import { Capacitor } from '@capacitor/core';

interface StreamSource {
  url: string;
  quality?: string;
  isM3U8: boolean;
}

interface StreamResult {
  source: string;
  subtitles?: { file: string; label: string; kind: string; default?: boolean }[];
}

export const StreamService = {
  /**
   * Resolves a TMDb ID to a direct streaming source (.m3u8)
   * This allows the app to cast third-party content to a TV.
   */
  async resolve(tmdbId: number | string, type: 'movie' | 'tv', season?: number, episode?: number): Promise<StreamResult | null> {
    try {
      console.log(`[StreamService] Resolving ${type} (ID: ${tmdbId}) for TV dynamically...`);
      const { getLocalServerUrl } = await import('./LocalStreamService');
      const localServer = getLocalServerUrl();
      
      const selectedServer = (typeof localStorage !== 'undefined' ? localStorage.getItem('selected_server') : 'vidsrc-pm') || 'vidsrc-pm';
      const isTv = type === 'tv';
      
      // Call local Express JIT watch route
      const query = type === 'tv'
        ? `?type=tv&s=${season || 1}&e=${episode || 1}&server=${selectedServer}`
        : `?type=movie&server=${selectedServer}`;
      
      const watchUrl = `${localServer}/meta/tmdb/watch/${tmdbId}${query}`;
      console.log(`[StreamService] Querying play-on-demand watch url: ${watchUrl}`);
      
      try {
        const res = await fetch(watchUrl, { signal: AbortSignal.timeout(12000) });
        if (res.ok) {
          const data = await res.json();
          if (data && data.sources && data.sources.length > 0) {
            console.log('[StreamService] Successfully resolved JIT play-on-demand stream URL');
            return {
              source: data.sources[0].url,
              subtitles: (data.subtitles || []).map((sub: any) => ({
                file: sub.url,
                label: sub.lang || 'English',
                kind: 'subtitles',
                default: (sub.lang || '').toLowerCase().includes('en')
              }))
            };
          }
        }
      } catch (err: any) {
        console.warn(`[StreamService] Play-on-demand watch resolver failed: ${err.message}`);
      }
      
      return null;
    } catch (error) {
      console.error('[StreamService] Critical error during play-on-demand resolution:', error);
      return null;
    }
  }
};
