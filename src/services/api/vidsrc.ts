/**
 * VidSrc.icu Integration
 * Provides access to streaming embed URLs and content lists
 */

const BASE_URL = '/vidsrc'; // Proxy to https://vidsrcme.vidsrc.icu

export interface VidSrcItem {
  imdb_id?: string;
  tmdb_id: string;
  title: string;
  embed_url?: string;
  embed_url_tmdb?: string;
  quality?: string;
  type?: 'movie' | 'tv';
}

export const VidSrcService = {
  // Get latest movies
  async getLatestMovies(page: number = 1): Promise<VidSrcItem[]> {
    try {
      // Data API is often unstable/changed, fetch quietly
      const response = await fetch(`${BASE_URL}/movie/${page}`, { 
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000)
      }).catch(() => null);

      if (!response || !response.ok) return [];
      const json = await response.json();
      return (json.result || []).map((item: any) => ({ ...item, type: 'movie' }));
    } catch (e) {
      return [];
    }
  },

  // Get latest TV shows
  async getLatestTV(page: number = 1): Promise<VidSrcItem[]> {
    try {
      const response = await fetch(`${BASE_URL}/tv/${page}`, { 
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000)
      }).catch(() => null);

      if (!response || !response.ok) return [];
      const json = await response.json();
      return (json.result || []).map((item: any) => ({ ...item, type: 'tv' }));
    } catch (e) {
      return [];
    }
  },

  // Get recent episodes
  async getRecentEpisodes(page: number = 1): Promise<any[]> {
    try {
      const response = await fetch(`${BASE_URL}/episodes/${page}`, { 
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000)
      }).catch(() => null);

      if (!response || !response.ok) return [];
      const json = await response.json();
      return json.result || [];
    } catch (e) {
      return [];
    }
  },

  // Generate embed URL for Movie
  getMovieEmbed: async (tmdbId: number | string) => {
    return `https://vidsrc.me/embed/movie/${tmdbId}`;
  },

  // Generate embed URL for TV Show
  getTVEmbed: async (tmdbId: number | string, season: number, episode: number) => {
    return `https://vidsrc.me/embed/tv/${tmdbId}/${season}/${episode}`;
  }
};

