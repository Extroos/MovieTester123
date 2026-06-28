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
  if (DEBUG) console.log(`[Progress] Queued offline save for item ${entry.itemId} (queue size: ${queue.length + 1})`);
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

export const WatchProgressService = {
  // In-flight dedup: prevents parallel Supabase upserts for the same (itemId, type)
  _inflight: new Set<string>(),
  _lastSaved: new Map<string, number>(),

  saveProgress: async (item: Movie | TVShow | any, progress: number, duration: number, season?: number, episode?: number) => {
    if (!item || !item.id) {
        console.warn('[Progress] Cannot save: invalid item', item);
        return;
    }

    // Minimum threshold: Don't save if it's just the start (unless it is a resume update?)
    // Note: If duration is 0 (unknown), we accept the heartbeat as valid only if it's not the initial 0-second save
    if (duration > 0 && progress < 1) { // Lowered to 1s for testing
        // console.log('[Progress] Skipping save: progress too small', progress);
        return; 
    }
    
    const isAnimeShow = item.mediaType === 'anime' || 
                        (item.genres?.some((g: any) => g.name.toLowerCase() === 'animation') && 
                         (item.origin_country?.includes('JP') || item.originCountry?.includes('JP')));
    const type = isAnimeShow ? 'anime' : ((item as any).name ? 'tv' : 'movie'); 

    // Throttle progress saves to at most once every 5 seconds per item, unless it's completion
    const throttleKey = `${item.id}::${type}`;
    const now = Date.now();
    const lastSaved = WatchProgressService._lastSaved.get(throttleKey) || 0;
    const isComplete = duration > 0 && progress / duration > 0.90;
    if (now - lastSaved < 5000 && progress > 0 && !isComplete) {
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
        if (type === 'tv' && season !== undefined && episode !== undefined && episode < 99) {
          if (DEBUG) console.log(`[Progress] TV Episode S${season}:E${episode} completed (>90%). Advancing to E${episode + 1}`);
          const profile = ProfileService.getActiveProfile();
          if (profile) {
            if (isGuest()) {
              const list = getLocalProgress(profile.id);
              const filtered = list.filter(i => !(i.item_id === item.id.toString() && i.type === type));
              filtered.push({
                profile_id: profile.id,
                item_id: item.id.toString(),
                type,
                progress: 0,
                duration: 0,
                season_number: season,
                episode_number: episode + 1,
                last_watched: new Date().toISOString(),
                data: item
              });
              saveLocalProgress(profile.id, filtered);
            } else {
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
            }
          }
          return;
        } else {
          console.log('[Progress] Removing finished item:', item.id);
          await WatchProgressService.removeProgress(item.id, type);
          return;
        }
      }
    } catch (e) {
      console.error('[Progress] Exception in saveProgress:', e);
    } finally {
      WatchProgressService._inflight.delete(flightKey);
    }

    const profile = ProfileService.getActiveProfile();
    if (!profile) {
      console.error('[Progress] No active profile for saving');
      return;
    }

    await StatsService.trackProgressUpdate(profile.id, item, progress, duration, season, episode);

    const itemType = type as 'movie' | 'tv' | 'anime';
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

    if (isGuest()) {
      const list = getLocalProgress(profile.id);
      const filtered = list.filter(i => !(i.item_id === item.id.toString() && i.type === itemType));
      filtered.push(payload);
      saveLocalProgress(profile.id, filtered);
      return;
    }

    // If device is offline, queue immediately without attempting Supabase
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

    try {
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
    }
  },

  /**
   * Flushes all queued offline progress saves to Supabase.
   * Call this when the device regains internet connectivity.
   */
  syncOfflineQueue: async (): Promise<void> => {
    if (isGuest()) return; // Guests do not sync with Supabase
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

  /** Returns the number of progress entries currently queued for offline sync. */
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

      const { data, error } = await supabase
        .from('watch_progress')
        .select('*')
        .eq('profile_id', profile.id)
        .eq('item_id', id.toString()) // Compare as string
        .eq('type', type) 
        .maybeSingle();
        
      if (error) console.error('[Progress] Fetch Error:', error);
      if (!data) return null;

      // Filter out insignificant progress (e.g. < 1s) to be safe
      if (data.progress < 1 && data.duration > 0) return null;

      return {
          id: data.id,
          type: data.type,
          itemId: data.item_id,
          progress: data.progress,
          duration: data.duration,
          timestamp: new Date(data.last_watched).getTime(),
          data: data.data,
          season: data.season_number,
          episode: data.episode_number
      };
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

      if (DEBUG) console.log('[Progress] Fetching continue watching...');
      const { data, error } = await supabase
        .from('watch_progress')
        .select('*')
        .eq('profile_id', profile.id)
        .neq('type', 'stats')
        .gt('last_watched', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) // Last 30 days only
        .order('last_watched', { ascending: false });

      if (error) {
          console.error('[Progress] Fetch Error:', error);
          return [];
      }

      if (DEBUG) console.log(`[Progress] Found ${data?.length} raw items`, data);

      // DEBUG: Remove strict filtering to verify saving
      const result = data
        // .filter((item: any) => item.data && (item.progress >= 1 || !item.duration)) 
        .map((item: any) => {
            if (!item.data) return null;
            const raw = item.data;
            
            // Unpack complex Anime title if present (AniList format)
            if (raw.title && typeof raw.title === 'object') {
                return {
                    ...raw,
                    original_title: raw.title, // keep original
                    title: raw.title.userPreferred || raw.title.english || raw.title.romaji || 'Anime',
                    // Shotgun approach to ensure ContentRow finds the image
                    poster_path: raw.coverImage?.large || raw.coverImage?.extraLarge || raw.image || raw.poster_path || raw.bannerImage || raw.img || raw.thumbnail || raw.picture,
                    posterPath: raw.coverImage?.large || raw.coverImage?.extraLarge || raw.image || raw.poster_path || raw.bannerImage || raw.img || raw.thumbnail || raw.picture,
                    image: raw.coverImage?.large || raw.coverImage?.extraLarge || raw.image || raw.poster_path || raw.bannerImage || raw.img || raw.thumbnail || raw.picture,
                    mediaType: 'anime',
                    id: item.item_id || raw.id, // Ensure ID is from row or data
                    watchedAt: new Date(item.last_watched).getTime(), // Append timestamp
                    progress: item.progress,
                    duration: item.duration,
                    season: item.season_number,
                    episode: item.episode_number
                };
            }
            // Ensure ID is string for movies/tv if needed, but usually number
            return { 
                ...raw, 
                id: item.item_id || raw.id,
                watchedAt: new Date(item.last_watched).getTime(), // Append timestamp
                progress: item.progress,
                duration: item.duration,
                season: item.season_number,
                episode: item.episode_number
            } as (Movie | TVShow);
        })
        .filter((item: any) => item !== null);
        
      if (DEBUG) console.log(`[Progress] Returning ${result.length} valid items`);
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

      if (isGuest()) {
        const list = getLocalProgress(profile.id);
        const sorted = list.sort((a, b) => new Date(b.last_watched).getTime() - new Date(a.last_watched).getTime());
        const sliced = sorted.slice(page * limit, (page + 1) * limit);
        return sliced.map((item: any) => ({
          id: item.item_id,
          type: item.type,
          itemId: item.item_id,
          progress: item.progress,
          duration: item.duration,
          timestamp: new Date(item.last_watched).getTime(),
          data: item.data,
          season: item.season_number,
          episode: item.episode_number
        }));
      }

      const { data, error } = await supabase
        .from('watch_progress')
        .select('*')
        .eq('profile_id', profile.id)
        .neq('type', 'stats')
        .order('last_watched', { ascending: false })
        .range(page * limit, (page + 1) * limit - 1);

      if (error) {
        console.error('Error fetching watch history:', error);
        return [];
      }

      return data.map((item: any) => ({
        id: item.item_id,
        type: item.type,
        itemId: item.item_id,
        progress: item.progress,
        duration: item.duration,
        timestamp: new Date(item.last_watched).getTime(),
        data: item.data,
        season: item.season_number,
        episode: item.episode_number
      }));
    } catch (e) {
      console.error('Error fetching watch history', e);
      return [];
    }
  },

  getAll: async (): Promise<Record<string, WatchProgress>> => {
      // Used for quick synced checks
       try {
        const profile = ProfileService.getActiveProfile();
        if (!profile) return {};
  
        if (isGuest()) {
          const list = getLocalProgress(profile.id);
          const map: Record<string, WatchProgress> = {};
          list.forEach((item: any) => {
             map[item.item_id] = {
                id: item.item_id,
                type: item.type,
                itemId: item.item_id,
                progress: item.progress,
                duration: item.duration,
                timestamp: new Date(item.last_watched).getTime(),
                data: item.data,
                season: item.season_number,
                episode: item.episode_number
             };
          });
          return map;
        }

        const { data } = await supabase
          .from('watch_progress')
          .select('*')
          .eq('profile_id', profile.id)
          .neq('type', 'stats');
          
        if (!data) return {};
        
        const map: Record<string, WatchProgress> = {};
        data.forEach((item: any) => {
           map[item.item_id] = {
              id: item.item_id,
              type: item.type,
              itemId: item.item_id,
              progress: item.progress,
              duration: item.duration,
              timestamp: new Date(item.last_watched).getTime(),
              data: item.data,
              season: item.season_number,
              episode: item.episode_number
           };
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
