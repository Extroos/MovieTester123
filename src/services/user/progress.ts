import type { Movie, TVShow } from '../../types';
import { ProfileService } from './profiles';
import { supabase } from '../../lib/supabase';
import { StatsService } from './stats';

// Guard verbose logging behind DEV mode — console.log on Android WebView
// triggers a synchronous native bridge call that stalls the main thread.
const DEBUG = typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV;

// ─── Offline Progress Sync Queue ───────────────────────────────────────────
// When the device is offline or Supabase is unreachable, progress saves are
// queued in localStorage and flushed automatically when connectivity resumes.
const OFFLINE_QUEUE_KEY = 'cinemovie_offline_progress_queue';

interface OfflineProgressEntry {
  profileId: string;
  itemId: string;
  type: 'movie' | 'tv' | 'anime';
  progress: number;
  duration: number;
  seasonNumber?: number;
  episodeNumber?: number;
  lastWatched: string;
  data: any;
  queuedAt: number;
}

const isGuest = () => localStorage.getItem('cinemovie_is_guest') === 'true';

interface GuestProgressItem {
  profile_id: string;
  item_id: string;
  type: 'movie' | 'tv' | 'anime';
  progress: number;
  duration: number;
  season_number?: number;
  episode_number?: number;
  last_watched: string;
  data: any;
}

function getLocalProgress(profileId: string): GuestProgressItem[] {
  try {
    const raw = localStorage.getItem(`cinemovie_guest_progress_${profileId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveLocalProgress(profileId: string, progressList: GuestProgressItem[]) {
  try {
    localStorage.setItem(`cinemovie_guest_progress_${profileId}`, JSON.stringify(progressList));
  } catch (e) {
    // quota exceeded or similar
  }
}

const readOfflineQueue = (): OfflineProgressEntry[] => {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const writeOfflineQueue = (queue: OfflineProgressEntry[]) => {
  try {
    // Keep latest entry per (profileId + itemId + type), discard older duplicates
    const deduped = new Map<string, OfflineProgressEntry>();
    queue.forEach(entry => {
      const key = `${entry.profileId}::${entry.itemId}::${entry.type}`;
      const existing = deduped.get(key);
      if (!existing || entry.queuedAt > existing.queuedAt) {
        deduped.set(key, entry);
      }
    });
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(Array.from(deduped.values())));
  } catch {
    // localStorage quota exceeded — silently skip
  }
};

const enqueueProgress = (entry: OfflineProgressEntry) => {
  const queue = readOfflineQueue();
  queue.push(entry);
  writeOfflineQueue(queue);
  if (DEBUG) console.log(`[Progress] Queued offline save for item ${entry.itemId} (queue size: ${queue.length})`);
};

export interface WatchProgress {
  id: string | number;
  type: 'movie' | 'tv' | 'anime';
  itemId: number | string; 
  progress: number; 
  duration: number; 
  timestamp: number; 
  data: Movie | TVShow | any; 
  season?: number;
  episode?: number;
}

// ─── Watch Progress Memory Cache ──────────────────────────────────────────
// Caches all progress entries for the active profile to reduce database reads to 0.
const progressCache = new Map<string, WatchProgress>();
const cacheLoadedProfiles = new Set<string>();

// Bust progress cache on profile changes
if (typeof window !== 'undefined') {
  window.addEventListener('profileChanged', () => {
    progressCache.clear();
    cacheLoadedProfiles.clear();
  });
}

// Pre-fetch all watch progress entries in a single select query for the active profile
async function ensureProgressCacheLoaded(profileId: string) {
  if (isGuest()) return;
  if (cacheLoadedProfiles.has(profileId)) return;
  
  try {
    if (DEBUG) console.log(`[Progress] Pre-fetching all progress rows for profile ${profileId}...`);
    const { data, error } = await supabase
      .from('watch_progress')
      .select('*')
      .eq('profile_id', profileId)
      .neq('type', 'stats');

    if (error) {
      console.error('[Progress] Failed to prefetch watch progress:', error);
      return;
    }

    if (data) {
      data.forEach((row: any) => {
        const key = `${profileId}::${row.item_id}::${row.type}`;
        progressCache.set(key, {
          id: row.id,
          type: row.type,
          itemId: row.item_id,
          progress: row.progress,
          duration: row.duration,
          timestamp: new Date(row.last_watched).getTime(),
          data: row.data,
          season: row.season_number,
          episode: row.episode_number
        });
      });
    }
    cacheLoadedProfiles.add(profileId);
    if (DEBUG) console.log(`[Progress] Successfully cached ${data?.length || 0} entries for profile ${profileId}`);
  } catch (e) {
    console.error('[Progress] Prefetch error:', e);
  }
}

export const WatchProgressService = {
  // In-flight dedup: prevents parallel Supabase upserts for the same (itemId, type)
  _inflight: new Set<string>(),
  _lastSaved: new Map<string, number>(),

  saveProgress: async (item: Movie | TVShow | any, progress: number, duration: number, season?: number, episode?: number, forceSync?: boolean) => {
    if (!item || !item.id) {
        console.warn('[Progress] Cannot save: invalid item', item);
        return;
    }

    // Minimum threshold: Don't save if it's just the start (unless it is a resume update?)
    if (duration > 0 && progress < 1) {
        return; 
    }
    
    const isAnimeShow = item.mediaType === 'anime' || 
                        (item.genres?.some((g: any) => g.name.toLowerCase() === 'animation') && 
                         (item.origin_country?.includes('JP') || item.originCountry?.includes('JP')));
    const type = isAnimeShow ? 'anime' : ((item as any).name ? 'tv' : 'movie'); 

    const profile = ProfileService.getActiveProfile();
    if (!profile) {
      console.error('[Progress] No active profile for saving');
      return;
    }

    const itemType = type as 'movie' | 'tv' | 'anime';
    const cacheKey = `${profile.id}::${item.id}::${itemType}`;
    const payload = {
      profile_id: profile.id,
      item_id: item.id.toString(),
      type: itemType,
      progress: Math.round(progress),
      duration: Math.round(duration),
      season_number: season,
      episode_number: episode,
      last_watched: new Date().toISOString(),
      data: item
    };

    // 1. Update memory cache immediately so UI gets updated instantly
    progressCache.set(cacheKey, {
      id: cacheKey,
      type: itemType,
      itemId: item.id.toString(),
      progress: Math.round(progress),
      duration: Math.round(duration),
      timestamp: Date.now(),
      data: item,
      season,
      episode
    });

    if (isGuest()) {
      const list = getLocalProgress(profile.id);
      const filtered = list.filter(i => !(i.item_id === item.id.toString() && i.type === itemType));
      filtered.push(payload);
      saveLocalProgress(profile.id, filtered);
      return;
    }

    // Throttle checks: save to DB at most once every 60 seconds (instead of 30)
    const throttleKey = `${item.id}::${type}`;
    const now = Date.now();
    const lastSaved = WatchProgressService._lastSaved.get(throttleKey) || 0;
    const isComplete = duration > 0 && progress / duration > 0.90;
    const isForceSave = isComplete || (progress === 0 && duration === 0) || forceSync === true; // e.g. pause or stop heartbeat

    if (now - lastSaved < 60000 && !isForceSave) {
      // Skips Supabase REST payload, serving from local cache only
      return;
    }
    WatchProgressService._lastSaved.set(throttleKey, now);

    // In-flight deduplication: skip if a save for this exact item is already in progress
    const flightKey = `${item.id}::${type}`;
    if (WatchProgressService._inflight.has(flightKey)) return;
    WatchProgressService._inflight.add(flightKey);

    try {
      // If watched > 90%, remove from continue watching
      if (duration > 0 && progress / duration > 0.90) {
        progressCache.delete(cacheKey); // Remove from cached lists
        if (type === 'tv' && season !== undefined && episode !== undefined && episode < 99) {
          if (DEBUG) console.log(`[Progress] TV Episode S${season}:E${episode} completed (>90%). Advancing to E${episode + 1}`);
          try {
            await supabase
              .from('watch_progress')
              .upsert({
                profile_id: profile.id,
                item_id: item.id.toString(),
                type,
                progress: 0,
                duration: 0,
                season_number: season,
                episode_number: episode + 1,
                last_watched: new Date().toISOString(),
                data: item
              }, { onConflict: 'profile_id,item_id,type' });
          } catch (e) {
            console.error('[Progress] Exception advancing TV show:', e);
          }
        } else {
          console.log('[Progress] Removing finished item:', item.id);
          await WatchProgressService.removeProgress(item.id, type);
        }
        return;
      }

      await StatsService.trackProgressUpdate(profile.id, item, progress, duration, season, episode);

      if (!navigator.onLine) {
        enqueueProgress({
          profileId: profile.id,
          itemId: item.id.toString(),
          type: itemType,
          progress: Math.round(progress),
          duration: Math.round(duration),
          seasonNumber: season,
          episodeNumber: episode,
          lastWatched: payload.last_watched,
          data: item,
          queuedAt: Date.now()
        });
        return;
      }

      if (DEBUG) console.log(`[Progress] Saving ${itemType} ${item.id} (${progress}/${duration})`);
      const { error } = await supabase
        .from('watch_progress')
        .upsert(payload, { onConflict: 'profile_id,item_id,type' });

      if (error) {
        console.warn('[Progress] Supabase error — queuing for offline sync:', error.message);
        enqueueProgress({
          profileId: profile.id,
          itemId: item.id.toString(),
          type: itemType,
          progress: Math.round(progress),
          duration: Math.round(duration),
          seasonNumber: season,
          episodeNumber: episode,
          lastWatched: payload.last_watched,
          data: item,
          queuedAt: Date.now()
        });
      }
    } catch (e) {
      console.warn('[Progress] Network exception — queuing for offline sync:', e);
      enqueueProgress({
        profileId: profile.id,
        itemId: item.id.toString(),
        type: itemType,
        progress: Math.round(progress),
        duration: Math.round(duration),
        seasonNumber: season,
        episodeNumber: episode,
        lastWatched: payload.last_watched,
        data: item,
        queuedAt: Date.now()
      });
    } finally {
      WatchProgressService._inflight.delete(flightKey);
    }
  },

  syncOfflineQueue: async (): Promise<void> => {
    if (isGuest()) return;
    let queue = readOfflineQueue();
    if (queue.length === 0) return;

    if (DEBUG) console.log(`[Progress] Syncing ${queue.length} offline progress entries...`);
    const failed: OfflineProgressEntry[] = [];

    while (queue.length > 0) {
      const entry = queue.shift()!;
      let success = false;
      try {
        const { error } = await supabase
          .from('watch_progress')
          .upsert({
            profile_id: entry.profileId,
            item_id: entry.itemId,
            type: entry.type,
            progress: entry.progress,
            duration: entry.duration,
            season_number: entry.seasonNumber,
            episode_number: entry.episodeNumber,
            last_watched: entry.lastWatched,
            data: entry.data
          }, { onConflict: 'profile_id,item_id,type' });

        if (error) {
          console.warn(`[Progress] Sync failed for ${entry.itemId}, will retry later:`, error.message);
          if (error.code === '42501' || error.message.toLowerCase().includes('row-level security')) {
            success = true;
          }
        } else {
          if (DEBUG) console.log(`[Progress] Synced offline entry: ${entry.itemId}`);
          success = true;
        }
      } catch (e) {
        console.warn(`[Progress] Exception syncing ${entry.itemId}:`, e);
      }

      if (!success) {
        failed.push(entry);
      }
      writeOfflineQueue([...failed, ...queue]);
    }

    if (failed.length === 0) {
      localStorage.removeItem(OFFLINE_QUEUE_KEY);
      if (DEBUG) console.log('[Progress] All offline entries synced successfully.');
    } else {
      if (DEBUG) console.log(`[Progress] Done syncing. ${failed.length} entries remain queued.`);
    }
  },

  getOfflineQueueLength: (): number => isGuest() ? 0 : readOfflineQueue().length,

  getProgress: async (id: number | string, type: 'movie' | 'tv' | 'anime'): Promise<WatchProgress | null> => {
    try {
      const profile = ProfileService.getActiveProfile();
      if (!profile) return null;

      if (isGuest()) {
        const list = getLocalProgress(profile.id);
        const data = list.find(i => i.item_id === id.toString() && i.type === type);
        if (!data) return null;
        if (data.progress < 1 && data.duration > 0) return null;
        return {
          id: data.item_id,
          type: data.type,
          itemId: data.item_id,
          progress: data.progress,
          duration: data.duration,
          timestamp: new Date(data.last_watched).getTime(),
          data: data.data,
          season: data.season_number,
          episode: data.episode_number
        };
      }

      // 1. Ensure cache is loaded
      await ensureProgressCacheLoaded(profile.id);

      // 2. Fetch directly from cache
      const cachedKey = `${profile.id}::${id}::${type}`;
      const cached = progressCache.get(cachedKey);
      if (!cached) return null;

      if (cached.progress < 1 && cached.duration > 0) return null;
      return cached;
    } catch (e) {
      console.error('[Progress] Exception get:', e);
      return null;
    }
  },

  getContinueWatching: async (): Promise<(Movie | TVShow)[]> => {
    try {
      const profile = ProfileService.getActiveProfile();
      if (!profile) {
          console.warn('[Progress] No active profile for fetching');
          return [];
      }

      if (isGuest()) {
        const list = getLocalProgress(profile.id);
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const filtered = list
          .filter(i => new Date(i.last_watched).getTime() > thirtyDaysAgo)
          .sort((a, b) => new Date(b.last_watched).getTime() - new Date(a.last_watched).getTime());

        const result = filtered.map((item: any) => {
          if (!item.data) return null;
          const raw = item.data;
          if (raw.title && typeof raw.title === 'object') {
            return {
              ...raw,
              original_title: raw.title,
              title: raw.title.userPreferred || raw.title.english || raw.title.romaji || 'Anime',
              poster_path: raw.coverImage?.large || raw.coverImage?.extraLarge || raw.image || raw.poster_path || raw.bannerImage || raw.img || raw.thumbnail || raw.picture,
              posterPath: raw.coverImage?.large || raw.coverImage?.extraLarge || raw.image || raw.poster_path || raw.bannerImage || raw.img || raw.thumbnail || raw.picture,
              image: raw.coverImage?.large || raw.coverImage?.extraLarge || raw.image || raw.poster_path || raw.bannerImage || raw.img || raw.thumbnail || raw.picture,
              mediaType: 'anime',
              id: item.item_id || raw.id,
              watchedAt: new Date(item.last_watched).getTime(),
              progress: item.progress,
              duration: item.duration,
              season: item.season_number,
              episode: item.episode_number
            };
          }
          return {
            ...raw,
            id: item.item_id || raw.id,
            watchedAt: new Date(item.last_watched).getTime(),
            progress: item.progress,
            duration: item.duration,
            season: item.season_number,
            episode: item.episode_number
          } as (Movie | TVShow);
        }).filter(item => item !== null);
        return result as (Movie | TVShow)[];
      }

      // 1. Ensure cache is loaded
      await ensureProgressCacheLoaded(profile.id);

      // 2. Fetch all entries from the local memory cache
      const profilePrefix = `${profile.id}::`;
      const cachedList = Array.from(progressCache.values())
        .filter(item => {
          const key = `${profile.id}::${item.itemId}::${item.type}`;
          const exists = progressCache.has(key);
          const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
          return exists && item.timestamp > thirtyDaysAgo;
        })
        .sort((a, b) => b.timestamp - a.timestamp);

      const result = cachedList
        .map((item: WatchProgress) => {
            if (!item.data) return null;
            const raw = item.data;
            
            if (raw.title && typeof raw.title === 'object') {
                return {
                    ...raw,
                    original_title: raw.title,
                    title: raw.title.userPreferred || raw.title.english || raw.title.romaji || 'Anime',
                    poster_path: raw.coverImage?.large || raw.coverImage?.extraLarge || raw.image || raw.poster_path || raw.bannerImage || raw.img || raw.thumbnail || raw.picture,
                    posterPath: raw.coverImage?.large || raw.coverImage?.extraLarge || raw.image || raw.poster_path || raw.bannerImage || raw.img || raw.thumbnail || raw.picture,
                    image: raw.coverImage?.large || raw.coverImage?.extraLarge || raw.image || raw.poster_path || raw.bannerImage || raw.img || raw.thumbnail || raw.picture,
                    mediaType: 'anime',
                    id: item.itemId,
                    watchedAt: item.timestamp,
                    progress: item.progress,
                    duration: item.duration,
                    season: item.season,
                    episode: item.episode
                };
            }
            return { 
                ...raw, 
                id: item.itemId,
                watchedAt: item.timestamp,
                progress: item.progress,
                duration: item.duration,
                season: item.season,
                episode: item.episode
            } as (Movie | TVShow);
        })
        .filter((item: any) => item !== null);
        
      if (DEBUG) console.log(`[Progress] Returning ${result.length} valid cached items`);
      return result;
    } catch (e) {
      console.error('[Progress] Exception list:', e);
      return [];
    }
  },

  getWatchHistory: async (page = 0, limit = 20): Promise<WatchProgress[]> => {
    try {
      const profile = ProfileService.getActiveProfile();
      if (!profile) return [];

      // 1. Ensure cache is loaded
      await ensureProgressCacheLoaded(profile.id);

      // 2. Paginate from local cache
      const cached = Array.from(progressCache.values())
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(page * limit, (page + 1) * limit);

      return cached;
    } catch (e) {
      console.error('Error fetching watch history', e);
      return [];
    }
  },

  getAll: async (): Promise<Record<string, WatchProgress>> => {
       try {
        const profile = ProfileService.getActiveProfile();
        if (!profile) return {};
  
        // 1. Ensure cache is loaded
        await ensureProgressCacheLoaded(profile.id);

        const map: Record<string, WatchProgress> = {};
        progressCache.forEach((item) => {
          map[item.itemId] = item;
        });
        return map;
      } catch {
        return {};
      }
  },

  removeProgress: async (id: number | string, type: 'movie' | 'tv' | 'anime') => {
    try {
      const profile = ProfileService.getActiveProfile();
      if (!profile) return;

      const cacheKey = `${profile.id}::${id}::${type}`;
      progressCache.delete(cacheKey);

      if (isGuest()) {
        const list = getLocalProgress(profile.id);
        const filtered = list.filter(i => !(i.item_id === id.toString() && i.type === type));
        saveLocalProgress(profile.id, filtered);
        return;
      }

      const { error } = await supabase
        .from('watch_progress')
        .delete()
        .eq('profile_id', profile.id)
        .eq('item_id', id.toString())
        .eq('type', type);
        
      if (error) console.error('Error removing progress:', error);
    } catch (e) {
      console.error('Error removing progress', e);
    }
  },
  
  clearAllProgress: async () => {
    try {
      const profile = ProfileService.getActiveProfile();
      if (!profile) return false;

      progressCache.clear();

      if (isGuest()) {
        saveLocalProgress(profile.id, []);
        return true;
      }

      const { error } = await supabase
        .from('watch_progress')
        .delete()
        .eq('profile_id', profile.id)
        .neq('type', 'stats');
        
      if (error) {
        console.error('Error clearing progress:', error);
        return false;
      }
      return true;
    } catch (e) {
      console.error('Error clearing progress', e);
      return false;
    }
  }
};
