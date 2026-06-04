/**
 * Generic Cache Service for persistent data storage
 * specific to WatchMovie mobile optimization.
 */

const DEFAULT_TTL = 4 * 60 * 60 * 1000; // 4 hours
const LONG_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days (for things like genres or configs)

interface CacheItem<T> {
  data: T;
  timestamp: number;
  expiry: number;
  version: number;
}

const CACHE_VERSION = 1;
const CACHE_PREFIX = 'cine_cache_';

export const CacheService = {
  /**
   * generate a unique key for a request
   */
  generateKey: (url: string, params: Record<string, any> = {}): string => {
    const paramString = Object.entries(params)
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB)) // Sort to ensure consistent keys
      .map(([key, value]) => `${key}=${String(value)}`)
      .join('&');
    return `${CACHE_PREFIX}${url}?${paramString}`;
  },

  /**
   * Get item from cache with SWR info
   * @returns { data: T, isStale: boolean } or null
   */
  get: <T>(key: string): { data: T; isStale: boolean } | null => {
    try {
      const itemStr = localStorage.getItem(key);
      if (!itemStr) return null;

      const item: CacheItem<T> = JSON.parse(itemStr);

      // Check version compatibility
      if (item.version !== CACHE_VERSION) {
        localStorage.removeItem(key);
        return null;
      }

      const isStale = Date.now() > item.expiry;
      
      // Even if stale, we might return it for SWR, 
      // but we should set a "Hard Expiry" (e.g., 7 days) where it's too old to show.
      const HARD_EXPIRY = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() > item.timestamp + HARD_EXPIRY) {
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
      localStorage.setItem(key, JSON.stringify(item));
    } catch (e) {
      console.warn('Cache write error (quota exceeded?)', e);
      // Optional: Prune old cache if quota exceeded
      CacheService.prune();
    }
  },

  /**
   * Remove specific item
   */
  remove: (key: string): void => {
    localStorage.removeItem(key);
  },

  /**
   * Clear all app-specific cache
   */
  clear: (): void => {
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith(CACHE_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  },

  /**
   * Remove expired items and oldest items to free up space
   */
  prune: (): void => {
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
              localStorage.removeItem(key);
            } else {
              entries.push({ key, timestamp: item.timestamp });
            }
          }
        } catch (e) {
          localStorage.removeItem(key); // Corrupt item
        }
      }
    });
    
    // If still too many entries, remove oldest 50%
    if (entries.length > 50) {
      entries.sort((a, b) => a.timestamp - b.timestamp);
      const toRemove = Math.floor(entries.length / 2);
      for (let i = 0; i < toRemove; i++) {
        localStorage.removeItem(entries[i].key);
      }
      console.log(`Cache pruned: removed ${toRemove} oldest entries`);
    }
  }
};

export { DEFAULT_TTL, LONG_TTL };

