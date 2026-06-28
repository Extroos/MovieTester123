import { Movie, TVShow } from '../../types';
import { supabase } from '../../lib/supabase';

export interface WatchedItem {
  id: string;
  title: string;
  posterPath: string;
  backdropPath?: string;
  type: 'movie' | 'tv' | 'anime';
  watchTime: number; // in seconds
  playCount: number;
  completed: boolean;
  genres: string[];
  lastWatched: string;
  progress?: number;
  duration?: number;
  season?: number;
  episode?: number;
}

export interface ProfileStats {
  totalWatchTime: number; // in seconds
  watchedItems: { [itemId: string]: WatchedItem };
  dailyWatchTime: { [dateStr: string]: number };
  hourlyActivity: { [hour: number]: number }; // 0-23 hours -> seconds
  currentStreak: number;
  longestStreak: number;
}

const GENRE_MAP: { [id: number]: string } = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Sci-Fi',
  10770: 'TV Movie',
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
  10759: 'Action & Adventure',
  10762: 'Kids',
  10763: 'News',
  10764: 'Reality',
  10765: 'Sci-Fi & Fantasy',
  10766: 'Soap',
  10767: 'Talk',
  10768: 'War & Politics'
};

const DEFAULT_STATS: ProfileStats = {
  totalWatchTime: 0,
  watchedItems: {},
  dailyWatchTime: {},
  hourlyActivity: {},
  currentStreak: 0,
  longestStreak: 0
};

// Validates and fills missing properties to avoid runtime exceptions
const normalizeStats = (raw: any): ProfileStats => {
  if (!raw || typeof raw !== 'object') {
    return JSON.parse(JSON.stringify(DEFAULT_STATS));
  }
  return {
    totalWatchTime: typeof raw.totalWatchTime === 'number' ? raw.totalWatchTime : 0,
    watchedItems: raw.watchedItems && typeof raw.watchedItems === 'object' ? raw.watchedItems : {},
    dailyWatchTime: raw.dailyWatchTime && typeof raw.dailyWatchTime === 'object' ? raw.dailyWatchTime : {},
    hourlyActivity: raw.hourlyActivity && typeof raw.hourlyActivity === 'object' ? raw.hourlyActivity : {},
    currentStreak: typeof raw.currentStreak === 'number' ? raw.currentStreak : 0,
    longestStreak: typeof raw.longestStreak === 'number' ? raw.longestStreak : 0
  };
};

// Safe date key parsing helper supporting both legacy (M/D/YYYY) and normalized (YYYY-MM-DD) formats
const parseDateKey = (dateStr: string): Date => {
  if (dateStr.includes('-')) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }
  if (dateStr.includes('/')) {
    const [m, d, y] = dateStr.split('/').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }
  const parsed = new Date(dateStr);
  parsed.setHours(0, 0, 0, 0);
  return parsed;
};

// Get standardized YYYY-MM-DD date key
const getTodayStr = (): string => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const calculateStreaks = (dailyWatchTime: { [dateStr: string]: number }): { current: number, longest: number } => {
  const dates = Object.keys(dailyWatchTime)
    .filter(d => dailyWatchTime[d] > 0)
    .map(d => parseDateKey(d))
    .sort((a, b) => b.getTime() - a.getTime()); // newest first

  if (dates.length === 0) return { current: 0, longest: 0 };

  let current = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  const hasWatchedTodayOrYesterday = dates.some(d => {
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    return copy.getTime() === today.getTime() || copy.getTime() === yesterday.getTime();
  });

  if (hasWatchedTodayOrYesterday) {
    let checkDate = new Date();
    checkDate.setHours(0, 0, 0, 0);
    
    const hasWatchedToday = dates.some(d => {
      const copy = new Date(d);
      copy.setHours(0, 0, 0, 0);
      return copy.getTime() === today.getTime();
    });
    if (!hasWatchedToday) {
      checkDate.setDate(checkDate.getDate() - 1);
    }

    while (true) {
      const match = dates.some(d => {
        const copy = new Date(d);
        copy.setHours(0, 0, 0, 0);
        return copy.getTime() === checkDate.getTime();
      });

      if (match) {
        current++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
  }

  // Calculate longest streak
  let longest = 0;
  let tempLongest = 0;
  
  const sortedOldest = [...dates].sort((a, b) => a.getTime() - b.getTime());
  let prevTime: number | null = null;

  sortedOldest.forEach(d => {
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    const currTime = copy.getTime();

    if (prevTime === null) {
      tempLongest = 1;
    } else {
      const diffDays = (currTime - prevTime) / (1000 * 60 * 60 * 24);
      if (diffDays <= 1.1) {
        if (diffDays > 0.9) {
          tempLongest++;
        }
      } else {
        longest = Math.max(longest, tempLongest);
        tempLongest = 1;
      }
    }
    prevTime = currTime;
  });
  longest = Math.max(longest, tempLongest);

  return { current, longest };
};

// In-memory cache & debouncing variables to optimize Supabase saves and prevent race conditions
const cachedStats: { [profileId: string]: ProfileStats } = {};
const saveDebounceTimeouts: { [profileId: string]: any } = {};

export const StatsService = {
  getStats: async (profileId: string): Promise<ProfileStats> => {
    try {
      // Return cached version if available
      if (cachedStats[profileId]) {
        return cachedStats[profileId];
      }

      const isGuest = localStorage.getItem('cinemovie_is_guest') === 'true';
      if (isGuest) {
        const raw = localStorage.getItem(`cinemovie_stats_${profileId}`);
        const parsed = raw ? normalizeStats(JSON.parse(raw)) : normalizeStats(null);
        cachedStats[profileId] = parsed;
        return parsed;
      }

      // Query from supabase
      const { data, error } = await supabase
        .from('watch_progress')
        .select('data')
        .eq('profile_id', profileId)
        .eq('item_id', 'profile_stats')
        .eq('type', 'stats')
        .maybeSingle();

      if (error || !data || !data.data) {
        const raw = localStorage.getItem(`cinemovie_stats_${profileId}`);
        const parsed = raw ? normalizeStats(JSON.parse(raw)) : normalizeStats(null);
        cachedStats[profileId] = parsed;
        return parsed;
      }

      const normalized = normalizeStats(data.data);
      cachedStats[profileId] = normalized;
      return normalized;
    } catch {
      try {
        const raw = localStorage.getItem(`cinemovie_stats_${profileId}`);
        const parsed = raw ? normalizeStats(JSON.parse(raw)) : normalizeStats(null);
        cachedStats[profileId] = parsed;
        return parsed;
      } catch {
        const fallback = normalizeStats(null);
        cachedStats[profileId] = fallback;
        return fallback;
      }
    }
  },

  saveStats: async (profileId: string, stats: ProfileStats) => {
    try {
      // Normalize to guarantee field presence
      const normalized = normalizeStats(stats);

      // Keep cache up to date instantly
      cachedStats[profileId] = normalized;

      // Always save to localStorage immediately as a fast local fallback/cache
      localStorage.setItem(`cinemovie_stats_${profileId}`, JSON.stringify(normalized));

      const isGuest = localStorage.getItem('cinemovie_is_guest') === 'true';
      if (isGuest) return;

      // Debounce writes to Supabase by 3 seconds of inactivity to avoid DB locks and API rate limiting
      if (saveDebounceTimeouts[profileId]) {
        clearTimeout(saveDebounceTimeouts[profileId]);
      }

      saveDebounceTimeouts[profileId] = setTimeout(async () => {
        try {
          await supabase
            .from('watch_progress')
            .upsert({
              profile_id: profileId,
              item_id: 'profile_stats',
              type: 'stats',
              progress: 0,
              duration: 0,
              last_watched: new Date().toISOString(),
              data: normalized
            }, { onConflict: 'profile_id,item_id,type' });
        } catch (dbErr) {
          console.error('[StatsService] Debounced database write failed:', dbErr);
        } finally {
          delete saveDebounceTimeouts[profileId];
        }
      }, 3000);

    } catch (e) {
      console.error('[StatsService] Failed to save stats:', e);
    }
  },

  trackProgressUpdate: async (profileId: string, item: Movie | TVShow | any, progress: number, duration: number, season?: number, episode?: number) => {
    if (!profileId || !item || !item.id) return;

    const type = item.mediaType === 'anime' ? 'anime' : ((item as any).name ? 'tv' : 'movie');
    
    const itemIdStr = (type === 'tv' || type === 'anime') && season !== undefined && episode !== undefined
      ? `${item.id}_s${season}_e${episode}`
      : item.id.toString();

    const now = Date.now();
    const lastTimeKey = `last_time_${profileId}_${itemIdStr}_${type}`;
    const lastProgressKey = `last_progress_${profileId}_${itemIdStr}_${type}`;
    
    const lastTimeRaw = sessionStorage.getItem(lastTimeKey);
    const lastProgressRaw = sessionStorage.getItem(lastProgressKey);
    
    let watchTimeDelta = 0;
    
    if (!lastTimeRaw || !lastProgressRaw) {
      sessionStorage.setItem(lastTimeKey, now.toString());
      sessionStorage.setItem(lastProgressKey, progress.toString());
      return;
    }
    
    const lastTime = Number(lastTimeRaw);
    const lastProgress = Number(lastProgressRaw);
    const realTimeDelta = (now - lastTime) / 1000;
    const progressDelta = progress - lastProgress;

    if (realTimeDelta > 45 || progressDelta < 0 || Math.abs(progressDelta - realTimeDelta) > 15) {
      sessionStorage.setItem(lastTimeKey, now.toString());
      sessionStorage.setItem(lastProgressKey, progress.toString());
      return;
    }
    
    watchTimeDelta = progressDelta;
    
    sessionStorage.setItem(lastTimeKey, now.toString());
    sessionStorage.setItem(lastProgressKey, progress.toString());

    if (watchTimeDelta <= 0) return;

    const stats = await StatsService.getStats(profileId);

    // Update total watch time
    stats.totalWatchTime += watchTimeDelta;

    // Update daily watch time using standardized YYYY-MM-DD
    const todayStr = getTodayStr();
    stats.dailyWatchTime[todayStr] = (stats.dailyWatchTime[todayStr] || 0) + watchTimeDelta;

    // Update hourly activity
    const currHour = new Date().getHours();
    stats.hourlyActivity[currHour] = (stats.hourlyActivity[currHour] || 0) + watchTimeDelta;

    // Calculate streaks
    const streaks = calculateStreaks(stats.dailyWatchTime);
    stats.currentStreak = streaks.current;
    stats.longestStreak = Math.max(stats.longestStreak, streaks.longest);

    // Update item watch details
    if (!stats.watchedItems[itemIdStr]) {
      let genres: string[] = [];
      if (Array.isArray(item.genres)) {
        genres = item.genres.map((g: any) => typeof g === 'object' ? (g.name || g.id?.toString()) : g);
      } else if (Array.isArray(item.genreIds)) {
        genres = item.genreIds.map((id: number) => GENRE_MAP[id] || id.toString());
      }

      const displayTitle = (type === 'tv' || type === 'anime') && season !== undefined && episode !== undefined
        ? `${item.title || item.name || 'Untitled'} - S${season}:E${episode}`
        : (item.title || item.name || 'Untitled');

      stats.watchedItems[itemIdStr] = {
        id: itemIdStr,
        title: displayTitle,
        posterPath: item.posterPath || item.poster_path || '',
        backdropPath: item.backdropPath || item.backdrop_path || '',
        type,
        watchTime: watchTimeDelta,
        playCount: 1,
        completed: false,
        genres,
        lastWatched: new Date().toISOString(),
        progress,
        duration,
        season,
        episode
      };
    } else {
      stats.watchedItems[itemIdStr].watchTime += watchTimeDelta;
      stats.watchedItems[itemIdStr].lastWatched = new Date().toISOString();
      stats.watchedItems[itemIdStr].progress = progress;
      stats.watchedItems[itemIdStr].duration = duration;
      stats.watchedItems[itemIdStr].season = season;
      stats.watchedItems[itemIdStr].episode = episode;
      if (!stats.watchedItems[itemIdStr].posterPath && (item.posterPath || item.poster_path)) {
        stats.watchedItems[itemIdStr].posterPath = item.posterPath || item.poster_path || '';
      }
      if (!stats.watchedItems[itemIdStr].backdropPath && (item.backdropPath || item.backdrop_path)) {
        stats.watchedItems[itemIdStr].backdropPath = item.backdropPath || item.backdrop_path || '';
      }
    }

    const isComplete = duration > 0 && progress / duration > 0.90;
    if (isComplete) {
      stats.watchedItems[itemIdStr].completed = true;
    }

    await StatsService.saveStats(profileId, stats);
  },

  resetStats: async (profileId: string) => {
    try {
      // Clear local memory cache immediately
      delete cachedStats[profileId];

      if (saveDebounceTimeouts[profileId]) {
        clearTimeout(saveDebounceTimeouts[profileId]);
        delete saveDebounceTimeouts[profileId];
      }

      localStorage.removeItem(`cinemovie_stats_${profileId}`);
      
      const keysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && (key.includes(`last_time_${profileId}`) || key.includes(`last_progress_${profileId}`))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => sessionStorage.removeItem(k));

      const isGuest = localStorage.getItem('cinemovie_is_guest') === 'true';
      if (!isGuest) {
        await supabase
          .from('watch_progress')
          .delete()
          .eq('profile_id', profileId)
          .eq('item_id', 'profile_stats')
          .eq('type', 'stats');
      }
    } catch (e) {
      console.error('[StatsService] Failed to reset stats:', e);
    }
  }
};
