import type { Movie, Genre, Video, MovieCategory, SearchResult, TVShow, Season, Episode } from '../../types';
import { TMDB_BASE_URL, TMDB_IMAGE_BASE_URL, IMAGE_SIZES } from '../../constants';
import { CacheService, DEFAULT_TTL, LONG_TTL } from '../core/cache';
import { SettingsService } from '../user/settings';

export const API_KEY = '8265bd1679663a7ea12ac168da84d2e8'; // Using reliable demo key
const BASE_URL = 'https://api.themoviedb.org/3';

const TMDB_LANG_MAP: Record<string, string> = {
  en: 'en-US',
  fr: 'fr-FR',
  es: 'es-ES',
  de: 'de-DE',
  it: 'it-IT',
  pt: 'pt-BR',
  ru: 'ru-RU'
};

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_BACKOFF = 300; // ms

import { withRetry } from '../../utils/resilience';

// Request deduplication & SWR tracking
const pendingRequests = new Map<string, Promise<any>>();
const activeSubscriptions = new Map<string, Set<(data: any) => void>>();

async function fetchFromApi<T>(path: string, params: Record<string, string | number> = {}, ttl: number = DEFAULT_TTL, signal?: AbortSignal): Promise<T> {
  const urlObj = new URL(`${BASE_URL}${path}`);
  urlObj.searchParams.append('api_key', API_KEY);
  const lang = SettingsService.get('appLanguage') || 'en';
  urlObj.searchParams.append('language', TMDB_LANG_MAP[lang] || 'en-US');
  Object.entries(params).forEach(([key, value]) => urlObj.searchParams.append(key, String(value)));
  const fullUrl = urlObj.toString();
  const cacheKey = CacheService.generateKey(path, params);

  if (signal) {
    signal.addEventListener('abort', () => {
      pendingRequests.delete(cacheKey);
    }, { once: true });
  }

  // 1. DEDUPLICATION
  if (pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey);
  }

  // 2. SWR
  const cacheResult = CacheService.get<T>(cacheKey);
  
  const performFetch = async (): Promise<T> => {
    try {
      const response = await withRetry(async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        try {
          const res = await fetch(fullUrl, { signal: controller.signal });
          if (!res.ok && (res.status >= 500 || res.status === 429)) {
            throw new Error(`Server error: ${res.status}`);
          }
          return res;
        } finally {
          clearTimeout(timeoutId);
        }
      }, { retries: 2, initialDelay: 300 });
      
      if (response.status === 404) return null as any; 
      if (!response.ok) throw new Error(`TMDB error: ${response.status}`);
      
      const data = await response.json();
      CacheService.set(cacheKey, data, ttl);
      return data;
    } finally {
      pendingRequests.delete(cacheKey);
    }
  };

  if (cacheResult) {
    // If not stale, return cache data immediately
    if (!cacheResult.isStale) {
      return (cacheResult as any).data;
    }

    // IF STALE: Return cache data immediately but refetch in background (Proactive Revalidation)
    // We don't wait for this fetch to return to the user
    const backgroundFetch = performFetch().catch(e => console.warn('Silent SWR revalidation failed', e));
    pendingRequests.set(cacheKey, backgroundFetch); 
    
    return (cacheResult as any).data; 
  }

  // 3. COLD START: No cache, must fetch
  try {
    const fetchPromise = performFetch();
    pendingRequests.set(cacheKey, fetchPromise);
    return await fetchPromise;
  } catch (error) {
    console.warn(`Cold start fetch failed for ${path}, checking expired cache fallback:`, error);
    try {
      const fallbackStr = localStorage.getItem(cacheKey);
      if (fallbackStr) {
        const item = JSON.parse(fallbackStr);
        return item.data;
      }
    } catch (e) {
      console.warn('Failed to retrieve expired cache fallback:', e);
    }
    throw error;
  }
}

function buildUrl(path: string, params: Record<string, string | number> = {}) {
  // Keeps existing helper if needed, but fetchFromApi handles generic calls now
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.append('api_key', API_KEY);
  const lang = SettingsService.get('appLanguage') || 'en';
  url.searchParams.append('language', TMDB_LANG_MAP[lang] || 'en-US');
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, String(value));
  });
  return url.toString();
}

function checkInTheatersOnly(releaseDatesResult: any): boolean {
  if (!releaseDatesResult || !Array.isArray(releaseDatesResult.results)) {
    return false;
  }
  
  let hasTheatrical = false;
  let hasDigitalOrPhysical = false;
  const now = new Date();

  for (const country of releaseDatesResult.results) {
    if (!Array.isArray(country.release_dates)) continue;
    for (const rel of country.release_dates) {
      if (!rel.release_date) continue;
      const relDate = new Date(rel.release_date);
      if (relDate > now) continue;
      
      const type = rel.type;
      if (type === 2 || type === 3) {
        hasTheatrical = true;
      }
      if (type === 4 || type === 5 || type === 6) {
        hasDigitalOrPhysical = true;
      }
    }
  }

  return hasTheatrical && !hasDigitalOrPhysical;
}

function transformMovie(data: any): Movie {
  return {
    id: data.id,
    title: data.title,
    overview: data.overview || 'No overview available.',
    posterPath: data.poster_path,
    backdropPath: data.backdrop_path,
    releaseDate: data.release_date || '',
    voteAverage: data.vote_average || 0,
    voteCount: data.vote_count || 0,
    genres: data.genre_ids?.map((id: number) => ({ id, name: getGenreName(id) })) || data.genres || [],
    runtime: data.runtime,
    tagline: data.tagline,
    popularity: data.popularity,
    imdbId: data.imdb_id,
    status: data.status,
    budget: data.budget,
    revenue: data.revenue,
    originalLanguage: data.original_language,
    inTheaters: data.release_dates ? checkInTheatersOnly(data.release_dates) : undefined,
  };
}

function transformTVShow(data: any): TVShow {
  return {
    id: data.id,
    name: data.name,
    overview: data.overview || 'No overview available.',
    posterPath: data.poster_path,
    backdropPath: data.backdrop_path,
    firstAirDate: data.first_air_date || '2024-01-01',
    voteAverage: data.vote_average || 0,
    voteCount: data.vote_count || 0,
    genres: data.genre_ids?.map((id: number) => ({ id, name: getTVGenreName(id) })) || data.genres || [],
    numberOfSeasons: data.number_of_seasons,
    numberOfEpisodes: data.number_of_episodes,
    status: data.status,
    tagline: data.tagline,
    episodeRunTime: data.episode_run_time,
    originCountry: data.origin_country, // Map origin_country
    popularity: data.popularity,
    imdbId: data.external_ids?.imdb_id,
  };
}

const genreMap: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Science Fiction',
  10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
};

const tvGenreMap: Record<number, string> = {
  10759: 'Action & Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 10762: 'Kids',
  9648: 'Mystery', 10763: 'News', 10764: 'Reality', 10765: 'Sci-Fi & Fantasy',
  10766: 'Soap', 10767: 'Talk', 10768: 'War & Politics', 37: 'Western',
};

function getGenreName(id: number): string {
  return genreMap[id] || 'Unknown';
}

function getTVGenreName(id: number): string {
  return tvGenreMap[id] || genreMap[id] || 'Unknown';
}

// ===== MOVIE ENDPOINTS =====

export async function getTrending(timeWindow: 'day' | 'week' = 'week'): Promise<Movie[]> {
  try {
    const data: any = await fetchFromApi(`/trending/movie/${timeWindow}`);
    return data.results.slice(0, 20).map(transformMovie);
  } catch (error) {
    console.error('Error fetching trending movies:', error);
    return [];
  }
}

export async function getPopular(): Promise<Movie[]> {
  try {
    const data: any = await fetchFromApi('/movie/popular');
    return data.results.slice(0, 20).map(transformMovie);
  } catch (error) {
    console.error('Error fetching popular movies:', error);
    return [];
  }
}

export async function getTopRated(): Promise<Movie[]> {
  try {
    const data: any = await fetchFromApi('/movie/top_rated');
    return data.results.slice(0, 20).map(transformMovie);
  } catch (error) {
    console.error('Error fetching top rated movies:', error);
    return [];
  }
}

export async function getUpcoming(): Promise<Movie[]> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    const dateFrom = fmt(today);
    const futureCap = new Date(today);
    futureCap.setFullYear(futureCap.getFullYear() + 1);
    const dateTo = fmt(futureCap);

    // Sort by POPULARITY so blockbusters (Toy Story 5, Avengers, Spider-Man...) surface first.
    // Then we re-sort by release_date ascending for display order (nearest first).
    const baseParams = {
      sort_by: 'popularity.desc',
      'primary_release_date.gte': dateFrom,
      'primary_release_date.lte': dateTo,
      'vote_count.gte': 0,
      include_adult: 'false',
      include_video: 'false',
    };

    // Fetch 3 pages in parallel for ~60 popular upcoming candidates
    const [page1, page2, page3] = await Promise.all([
      fetchFromApi<any>('/discover/movie', { ...baseParams, page: 1 }),
      fetchFromApi<any>('/discover/movie', { ...baseParams, page: 2 }),
      fetchFromApi<any>('/discover/movie', { ...baseParams, page: 3 }),
    ]);

    const combined: any[] = [
      ...(page1?.results || []),
      ...(page2?.results || []),
      ...(page3?.results || []),
    ];

    // Deduplicate by id, filter to strictly future dates, then sort by release_date ascending (nearest first)
    const seen = new Set<number>();
    return combined
      .filter((m: any) => {
        if (!m.release_date || seen.has(m.id)) return false;
        const releaseDate = new Date(m.release_date);
        if (releaseDate <= today) return false;
        seen.add(m.id);
        return true;
      })
      .sort((a: any, b: any) =>
        new Date(a.release_date).getTime() - new Date(b.release_date).getTime()
      )
      .slice(0, 50)
      .map(transformMovie);
  } catch (error) {
    console.error('Error fetching upcoming movies:', error);
    return [];
  }
}

export async function getMoviesByGenre(genreId: number): Promise<Movie[]> {
  try {
    const data: any = await fetchFromApi('/discover/movie', {
      with_genres: genreId,
      sort_by: 'popularity.desc',
    });
    return data.results.slice(0, 20).map(transformMovie);
  } catch (error) {
    console.error('Error fetching movies by genre:', error);
    return [];
  }
}

/**
 * Smart Trending by Genre:
 * Uses /discover with popularity sorting and a release date filter
 * to find "hot" content rather than just all-time classics.
 */
export async function getTrendingByGenre(genreId: number, mediaType: 'movie' | 'tv' = 'movie', signal?: AbortSignal): Promise<(Movie | TVShow)[]> {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const dateStr = sixMonthsAgo.toISOString().split('T')[0];

  const path = mediaType === 'movie' ? '/discover/movie' : '/discover/tv';
  const dateParam = mediaType === 'movie' ? 'primary_release_date.gte' : 'first_air_date.gte';

  try {
    const data: any = await fetchFromApi(path, {
      with_genres: genreId,
      sort_by: 'popularity.desc',
      [dateParam]: dateStr,
      'vote_count.gte': 10, // Filter out entries with no traction
    }, DEFAULT_TTL, signal);
    return data.results.slice(0, 20).map(mediaType === 'movie' ? transformMovie : transformTVShow);
  } catch (error: any) {
    if (error.name === 'AbortError') return [];
    console.error(`Error fetching trending ${mediaType} by genre:`, error);
    return [];
  }
}

export async function searchMovies(query: string, signal?: AbortSignal): Promise<Movie[]> {
  try {
    if (!query.trim()) return [];
    const data: any = await fetchFromApi('/search/movie', { query }, DEFAULT_TTL, signal);
    return data.results.slice(0, 20).map(transformMovie);
  } catch (error: any) {
    if (error.name === 'AbortError') return [];
    console.error('Error searching movies:', error);
    return [];
  }
}

/**
 * Unified Search for Movies, TV Shows, and potentially People
 */
export async function searchMulti(query: string, signal?: AbortSignal): Promise<Movie[]> {
  if (!query.trim()) return [];

  try {
    // 1. Try multi-search for efficiency
    const data: any = await fetchFromApi('/search/multi', { query }, DEFAULT_TTL, signal);
    
    return data.results
      .filter((item: any) => item.media_type === 'movie' || item.media_type === 'tv')
      .map((item: any) => {
        if (item.media_type === 'movie') return transformMovie(item);
        return {
          ...transformTVShow(item),
          title: item.name, // Ensure consistent field names for the UI if needed
          releaseDate: item.first_air_date,
          mediaType: 'tv'
        } as unknown as Movie;
      })
      .slice(0, 20);
  } catch (error: any) {
    if (error.name === 'AbortError') return [];
    console.error('Multi-search failed, falling back to individual searches:', error);
    
    // Fallback if multi-search fails
    try {
      const [movies, tv] = await Promise.all([
        searchMovies(query, signal),
        searchTVShows(query, signal)
      ]);
      
      const mappedTV = tv.map(t => ({
        ...t,
        title: (t as any).name,
        releaseDate: (t as any).firstAirDate,
        mediaType: 'tv'
      })) as unknown as Movie[];

      return [...movies, ...mappedTV].sort((a, b) => (b.voteAverage || 0) - (a.voteAverage || 0)).slice(0, 20);
    } catch (fallbackError) {
      return [];
    }
  }
}

export async function getMovieDetails(movieId: number | string): Promise<Movie | null> {
  const cleanIdStr = typeof movieId === 'string' ? movieId.replace(/\D/g, '') : String(movieId);
  const numericId = parseInt(cleanIdStr, 10);
  if (!numericId || isNaN(numericId)) return null;

  try {
    const data: any = await fetchFromApi(`/movie/${numericId}`, { append_to_response: 'release_dates' }, LONG_TTL/2);
    if (!data || !data.id) return null;
    return transformMovie(data);
  } catch (error) {
    console.error('Error fetching movie details:', error);
    return null;
  }
}

export async function getMovieVideos(movieId: number): Promise<Video[]> {
  try {
    const data: any = await fetchFromApi(`/movie/${movieId}/videos`);
    if (!data || !data.results) return [];
    return data.results.map((video: any) => ({
      id: video.id,
      key: video.key,
      name: video.name,
      site: video.site,
      type: video.type,
      official: video.official,
    }));
  } catch (error) {
    console.error('Error fetching movie videos:', error);
    return [];
  }
}

export async function getSimilarMovies(movieId: number): Promise<Movie[]> {
  try {
    const data: any = await fetchFromApi(`/movie/${movieId}/similar`);
    return data.results.slice(0, 15).map(transformMovie);
  } catch (error) {
    console.error('Error fetching similar movies:', error);
    return [];
  }
}

/**
 * Smart hybrid recommendations for movies
 */
export async function getSmartMovieRecommendations(movieId: number): Promise<Movie[]> {
  try {
    const [similar, recommended] = await Promise.all([
      fetchFromApi<any>(`/movie/${movieId}/similar`),
      fetchFromApi<any>(`/movie/${movieId}/recommendations`)
    ]);

    const similarResults = similar?.results || [];
    const recResults = recommended?.results || [];
    const allResults = [...similarResults, ...recResults];
    
    // Deduplicate and re-rank
    const uniqueMap = new Map<number, any>();
    allResults.forEach(item => {
      if (!uniqueMap.has(item.id)) {
        uniqueMap.set(item.id, item);
      } else {
        // Boost score for items found in both endpoints
        const existing = uniqueMap.get(item.id);
        existing.popularity *= 1.2; 
      }
    });

    return Array.from(uniqueMap.values())
      .map(transformMovie)
      .filter(m => m.posterPath) // Must have poster
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
      .slice(0, 15);
  } catch (error) {
    console.error('Error fetching smart movie recommendations:', error);
    return getSimilarMovies(movieId); // Fallback
  }
}

export async function getMovieCredits(movieId: number): Promise<{ cast: any[], crew: any[] }> {
  try {
    const data: any = await fetchFromApi(`/movie/${movieId}/credits`);
    if (!data || !data.cast) return { cast: [], crew: [] };
    
    return {
      cast: data.cast.slice(0, 10).map((person: any) => ({
        id: person.id,
        name: person.name,
        character: person.character,
        profilePath: person.profile_path,
        order: person.order,
      })),
      crew: (data.crew || [])
        .filter((person: any) => person.job === 'Director' || person.department === 'Writing')
        .slice(0, 5)
        .map((person: any) => ({
          id: person.id,
          name: person.name,
          job: person.job,
          department: person.department,
          profilePath: person.profile_path,
        })),
    };
  } catch (error) {
    console.error('Error fetching movie credits:', error);
    return { cast: [], crew: [] };
  }
}

// ===== TV SHOW ENDPOINTS =====

export async function getTrendingTV(timeWindow: 'day' | 'week' = 'week'): Promise<TVShow[]> {
  try {
    const data: any = await fetchFromApi(`/trending/tv/${timeWindow}`);
    return data.results.slice(0, 20).map(transformTVShow);
  } catch (error) {
    console.error('Error fetching trending TV shows:', error);
    return [];
  }
}

export async function getPopularTV(): Promise<TVShow[]> {
  try {
    const data: any = await fetchFromApi('/tv/popular');
    return data.results.slice(0, 20).map(transformTVShow);
  } catch (error) {
    console.error('Error fetching popular TV shows:', error);
    return [];
  }
}

export async function getTopRatedTV(): Promise<TVShow[]> {
  try {
    const data: any = await fetchFromApi('/tv/top_rated');
    return data.results.slice(0, 20).map(transformTVShow);
  } catch (error) {
    console.error('Error fetching top rated TV shows:', error);
    return [];
  }
}

export async function getOnTheAirTV(): Promise<TVShow[]> {
  try {
    const data: any = await fetchFromApi('/tv/on_the_air');
    return data.results.slice(0, 20).map(transformTVShow);
  } catch (error) {
    console.error('Error fetching on the air TV shows:', error);
    return [];
  }
}

export async function getTVShowDetails(tvId: number | string): Promise<TVShow | null> {
  // If it's a non-numeric string (Anime ID) or invalid, return null to avoid TMDB 404s
  const numericId = typeof tvId === 'string' ? parseInt(tvId, 10) : tvId;
  if (!numericId || isNaN(numericId)) return null;

  try {
    const data: any = await fetchFromApi(`/tv/${numericId}`, { append_to_response: 'external_ids' }, LONG_TTL/2);
    if (!data || !data.id) return null;
    return transformTVShow(data);
  } catch (error) {
    console.error('Error fetching TV show details:', error);
    return null;
  }
}

export async function getTVShowVideos(tvId: number): Promise<Video[]> {
  try {
    const data: any = await fetchFromApi(`/tv/${tvId}/videos`);
    if (!data || !data.results) return [];
    return data.results.map((video: any) => ({
      id: video.id,
      key: video.key,
      name: video.name,
      site: video.site,
      type: video.type,
      official: video.official,
    }));
  } catch (error) {
    console.error('Error fetching TV show videos:', error);
    return [];
  }
}

export async function getSimilarTVShows(tvId: number): Promise<TVShow[]> {
  try {
    const data: any = await fetchFromApi(`/tv/${tvId}/similar`);
    return data.results.slice(0, 15).map(transformTVShow);
  } catch (error) {
    console.error('Error fetching similar TV shows:', error);
    return [];
  }
}

/**
 * Smart hybrid recommendations for TV shows
 */
export async function getSmartTVRecommendations(tvId: number): Promise<TVShow[]> {
  try {
    const [similar, recommended] = await Promise.all([
      fetchFromApi<any>(`/tv/${tvId}/similar`),
      fetchFromApi<any>(`/tv/${tvId}/recommendations`)
    ]);

    const similarResults = similar?.results || [];
    const recResults = recommended?.results || [];
    const allResults = [...similarResults, ...recResults];
    
    // Deduplicate and re-rank
    const uniqueMap = new Map<number, any>();
    allResults.forEach(item => {
      if (!uniqueMap.has(item.id)) {
        uniqueMap.set(item.id, item);
      } else {
        // Boost score for items found in both
        const existing = uniqueMap.get(item.id);
        existing.popularity *= 1.2;
      }
    });

    return Array.from(uniqueMap.values())
      .map(transformTVShow)
      .filter(s => s.posterPath)
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
      .slice(0, 15);
  } catch (error) {
    console.error('Error fetching smart TV recommendations:', error);
    return getSimilarTVShows(tvId); // Fallback
  }
}

export async function getTVShowCredits(tvId: number): Promise<{ cast: any[], crew: any[] }> {
  try {
    const data: any = await fetchFromApi(`/tv/${tvId}/credits`);
    if (!data || !data.cast) return { cast: [], crew: [] };
    
    return {
      cast: data.cast.slice(0, 10).map((person: any) => ({
        id: person.id,
        name: person.name,
        character: person.character,
        profilePath: person.profile_path,
        order: person.order,
      })),
      crew: (data.crew || [])
        .filter((person: any) => person.job === 'Executive Producer' || person.job === 'Creator')
        .slice(0, 5)
        .map((person: any) => ({
          id: person.id,
          name: person.name,
          job: person.job,
          department: person.department,
          profilePath: person.profile_path,
        })),
    };
  } catch (error) {
    console.error('Error fetching TV show credits:', error);
    return { cast: [], crew: [] };
  }
}

export async function searchTVShows(query: string, signal?: AbortSignal): Promise<TVShow[]> {
  try {
    if (!query.trim()) return [];
    const data: any = await fetchFromApi('/search/tv', { query }, DEFAULT_TTL, signal);
    return data.results.slice(0, 20).map(transformTVShow);
  } catch (error: any) {
    if (error.name === 'AbortError') return [];
    console.error('Error searching TV shows:', error);
    return [];
  }
}

export async function getTVShowsByGenre(genreId: number): Promise<TVShow[]> {
  try {
    const data: any = await fetchFromApi('/discover/tv', {
      with_genres: genreId,
      sort_by: 'popularity.desc',
    });
    return data.results.slice(0, 20).map(transformTVShow);
  } catch (error) {
    console.error('Error fetching TV shows by genre:', error);
    return [];
  }
}

// ===== PERSON ENDPOINTS =====

export async function getPersonDetails(personId: number, signal?: AbortSignal): Promise<any> {
  try {
    return await fetchFromApi(`/person/${personId}`, {}, LONG_TTL, signal);
  } catch (error: any) {
    if (error.name === 'AbortError') return null;
    console.error('Error fetching person details:', error);
    return null;
  }
}

export async function getPersonCombinedCredits(personId: number, signal?: AbortSignal): Promise<any> {
  try {
    const data: any = await fetchFromApi(`/person/${personId}/combined_credits`, {}, LONG_TTL/2, signal);
    
    // 1. Filter out items with no poster (quality filter)
    // 2. Map to app types (Movie | TVShow)
    // 3. Smart Sorting: Newest to Oldest, then by Popularity for same years
    const credits = (data.cast || [])
      .filter((item: any) => item.poster_path)
      .map((item: any) => {
        if (item.media_type === 'movie') return transformMovie(item);
        return transformTVShow(item);
      })
      .sort((a: any, b: any) => {
        const dateA = a.releaseDate || a.firstAirDate || '0';
        const dateB = b.releaseDate || b.firstAirDate || '0';
        
        // Primary sort: Date (descending)
        if (dateA !== dateB) {
          return dateB.localeCompare(dateA);
        }
        
        // Secondary sort: Popularity (descending)
        return (b.popularity || 0) - (a.popularity || 0);
      });

    return credits;
  } catch (error: any) {
    if (error.name === 'AbortError') return [];
    console.error('Error fetching person credits:', error);
    return [];
  }
}


export async function getTVShowSeason(tvId: number, seasonNumber: number): Promise<any> {
  try {
    const data: any = await fetchFromApi(`/tv/${tvId}/season/${seasonNumber}`, {}, LONG_TTL);
    if (!data) return null;
    
    // Transform episodes to match our Episode interface
    if (data.episodes) {
      data.episodes = data.episodes.map((ep: any) => ({
        id: ep.id,
        name: ep.name,
        overview: ep.overview,
        voteAverage: ep.vote_average,
        voteCount: ep.vote_count,
        airDate: ep.air_date,
        episodeNumber: ep.episode_number,
        seasonNumber: ep.season_number,
        stillPath: ep.still_path, // Map snake_case to camelCase
        runtime: ep.runtime,
        crew: ep.crew,
        guestStars: ep.guest_stars,
      }));
    }
    
    return data;
  } catch (error) {
    console.error('Error fetching TV show season:', error);
    return null;
  }
}

// ===== HELPER FUNCTIONS =====

export function getPosterUrl(path: string | null, size: 'small' | 'medium' | 'large' | 'original' = 'medium'): string {
  if (!path) return '/movie-placeholder.png';
  if (path.startsWith('http')) return path; // Handle full URLs (e.g., from AniList)
  return `${TMDB_IMAGE_BASE_URL}/${IMAGE_SIZES.poster[size]}${path}`;
}

export function getBackdropUrl(path: string | null, size: 'small' | 'medium' | 'large' | 'original' = 'large'): string {
  if (!path) return '/backdrop-placeholder.png';
  if (path.startsWith('http')) return path; // Handle full URLs (e.g., from AniList)
  return `${TMDB_IMAGE_BASE_URL}/${IMAGE_SIZES.backdrop[size]}${path}`;
}

export function getProfileUrl(path: string | null): string {
  if (!path) return '';
  if (path.startsWith('http')) return path; // Handle full URLs
  // Upgraded to w342 for better clarity on mobile/high-dpi screens
  return `${TMDB_IMAGE_BASE_URL}/w342${path}`;
}

export function getStillUrl(path: string | null): string {
  if (!path) return ''; 
  if (path.startsWith('http')) return path;
  return `${TMDB_IMAGE_BASE_URL}/w300${path}`;
}

/**
 * Proactively load images into browser cache
 */
export function prewarmImages(urls: string[]) {
  if (typeof window === 'undefined') return;
  urls.forEach(url => {
    if (!url) return;
    const img = new Image();
    img.src = url;
  });
}

export async function getDiscoverNetflix(mediaType: 'movie' | 'tv' = 'movie', signal?: AbortSignal): Promise<(Movie | TVShow)[]> {
  const path = mediaType === 'movie' ? '/discover/movie' : '/discover/tv';
  try {
    const data: any = await fetchFromApi(path, {
      sort_by: 'popularity.desc',
      with_watch_providers: 8,
      watch_region: 'US'
    }, DEFAULT_TTL, signal);
    return data.results.slice(0, 20).map(mediaType === 'movie' ? transformMovie : transformTVShow);
  } catch (e) {
    return [];
  }
}

export async function getDiscoverDisney(mediaType: 'movie' | 'tv' = 'movie', signal?: AbortSignal): Promise<(Movie | TVShow)[]> {
  const path = mediaType === 'movie' ? '/discover/movie' : '/discover/tv';
  try {
    const data: any = await fetchFromApi(path, {
      sort_by: 'popularity.desc',
      with_watch_providers: 337,
      watch_region: 'US'
    }, DEFAULT_TTL, signal);
    return data.results.slice(0, 20).map(mediaType === 'movie' ? transformMovie : transformTVShow);
  } catch (e) {
    return [];
  }
}

export async function getDiscoverOscars(signal?: AbortSignal): Promise<Movie[]> {
  try {
    const data: any = await fetchFromApi('/discover/movie', {
      sort_by: 'vote_average.desc',
      'vote_count.gte': 1000,
      with_keywords: '250212' // Oscar Winner keyword
    }, DEFAULT_TTL, signal);
    // If we get nothing, fallback to top-rated
    if (!data.results || data.results.length === 0) {
      const topRatedData: any = await fetchFromApi('/movie/top_rated', {}, DEFAULT_TTL, signal);
      return topRatedData.results.slice(0, 20).map(transformMovie);
    }
    return data.results.slice(0, 20).map(transformMovie);
  } catch (e) {
    return [];
  }
}

