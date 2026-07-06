import { SettingsService } from '../user/settings';

/**
 * Generic Cache Service for persistent data storage
 * specific to WatchMovie mobile optimization.
 * Wraps localStorage with an in-memory Cache Map to bypass synchronous disk I/O.
 */

const DEFAULT_TTL = 4 * 60 * 60 * 1000; // 4 hours
const LONG_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days (for things like genres or configs)

interface CacheItem<T> {
  data: T;
  timestamp: number;
  expiry: number;
  version: number;
}

const CACHE_VERSION = 2; // bumped to bust old season caches with missing still_path/air_date
const CACHE_PREFIX = 'cine_cache_';

// Fast in-memory cache storage
const memoryCache = new Map<string, CacheItem<any>>();

export const CacheService = {
  /**
   * generate a unique key for a request — includes language so fr/en/es data stays isolated
   */
  generateKey: (url: string, params: Record<string, any> = {}): string => {
    // Optimized: read appLanguage directly from memory-cached SettingsService
    let lang = 'en';
    try {
      lang = SettingsService.get('appLanguage') || 'en';
    } catch {}
    
    const paramString = Object.entries(params)
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
      .map(([key, value]) => `${key}=${String(value)}`)
      .join('&');
    return `${CACHE_PREFIX}${lang}:${url}?${paramString}`;
  },

  /**
   * Get item from cache with SWR info
   * @returns { data: T, isStale: boolean } or null
   */
  get: <T>(key: string): { data: T; isStale: boolean } | null => {
    try {
      // 1. Try In-Memory Cache first (0ms cost)
      let item: CacheItem<T> | undefined = memoryCache.get(key);

      // 2. Fallback to localStorage if not in memory
      if (!item) {
        const itemStr = localStorage.getItem(key);
        if (!itemStr) return null;

        item = JSON.parse(itemStr);
        if (!item) return null;

        // Check version compatibility
        if (item.version !== CACHE_VERSION) {
          localStorage.removeItem(key);
          return null;
        }

        // Cache in memory for subsequent hits
        memoryCache.set(key, item);
      }

      const isStale = Date.now() > item.expiry;
      
      // Even if stale, we might return it for SWR, 
      // but we should set a "Hard Expiry" (e.g., 7 days) where it's too old to show.
      const HARD_EXPIRY = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() > item.timestamp + HARD_EXPIRY) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          return { data: item.data, isStale: true };
        }
        memoryCache.delete(key);
        localStorage.removeItem(key);
        return null;
      }

      return { data: item.data, isStale };
    } catch (e) {
      console.warn('Cache read error', e);
      return null;
    }
  },

  /**
   * Save item to cache
   */
  set: <T>(key: string, data: T, ttl: number = DEFAULT_TTL): void => {
    try {
      const item: CacheItem<T> = {
        data,
        timestamp: Date.now(),
        expiry: Date.now() + ttl,
        version: CACHE_VERSION,
      };
      
      // Cache in memory
      memoryCache.set(key, item);
      
      // Persist to disk
      try {
        localStorage.setItem(key, JSON.stringify(item));
      } catch (writeError) {
        console.warn('LocalStorage write failed, pruning cache...', writeError);
        CacheService.prune(true); // Aggressive prune
        try {
          // Retry write once
          localStorage.setItem(key, JSON.stringify(item));
        } catch (retryError) {
          console.warn('Cache write failed permanently after pruning:', retryError);
        }
      }
    } catch (e) {
      console.warn('Cache set general error:', e);
    }
  },

  /**
   * Remove specific item
   */
  remove: (key: string): void => {
    memoryCache.delete(key);
    localStorage.removeItem(key);
  },

  /**
   * Clear all app-specific cache
   */
  clear: (): void => {
    memoryCache.clear();
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith(CACHE_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  },

  prune: (aggressive: boolean = false): void => {
    const entries: { key: string; timestamp: number }[] = [];
    
    // Collect all cache entries with their timestamps
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith(CACHE_PREFIX)) {
        try {
          const itemStr = localStorage.getItem(key);
          if (itemStr) {
            const item = JSON.parse(itemStr);
            // Remove expired items immediately
            if (Date.now() > item.expiry) {
              memoryCache.delete(key);
              localStorage.removeItem(key);
            } else {
              entries.push({ key, timestamp: item.timestamp });
            }
          }
        } catch (e) {
          memoryCache.delete(key);
          localStorage.removeItem(key); // Corrupt item
        }
      }
    });
    
    // Sort oldest first
    entries.sort((a, b) => a.timestamp - b.timestamp);

    // If aggressive, remove 60% of entries. Otherwise, prune 30% if count exceeds 80.
    const limit = aggressive ? 0 : 80;
    if (entries.length > limit) {
      const toRemove = aggressive ? Math.ceil(entries.length * 0.6) : Math.ceil(entries.length * 0.3);
      for (let i = 0; i < Math.min(toRemove, entries.length); i++) {
        const k = entries[i].key;
        memoryCache.delete(k);
        localStorage.removeItem(k);
      }
      console.log(`Cache pruned: removed ${toRemove} oldest entries (aggressive: ${aggressive})`);
    }
  }
};

export { DEFAULT_TTL, LONG_TTL };
