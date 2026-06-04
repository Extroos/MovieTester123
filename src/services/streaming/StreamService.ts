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
      console.log(`[StreamService] Resolving ${type} (ID: ${tmdbId}) for TV...`);

      // Use local proxy to bypass CORS
      // The Cloudflare worker at /proxy handles the actual fetching and CORS headers.
      const proxy = (url: string) => `/proxy?url=${encodeURIComponent(url)}&referer=${encodeURIComponent('https://vidsrc.icu/')}`;

      // Provider List (Optimized for 2025)
      const providers = [
        `https://vidsrc.icu/api/source`,
        `https://vidsrc-embed.ru/api/source`,
        `https://vidsrc.cc/api/source`,
        `https://vidsrc.xyz/api/source`,
        `https://vidsrc.stream/api/source`,
        `https://consumet-api-smosh.vercel.app/meta/tmdb/watch`,
      ];

      for (const base of providers) {
        let url = '';
        if (base.includes('consumet')) {
           url = type === 'movie' ? `${base}/${tmdbId}?type=movie` : `${base}/${tmdbId}?type=tv&s=${season}&e=${episode}`;
        } else {
           url = `${base}/${tmdbId}`;
        }

        const proxiedUrl = proxy(url);
        console.log(`[StreamService] Resolving via: ${base}`);

        try {
          const res = await fetch(proxiedUrl, { signal: AbortSignal.timeout(8000) }).catch(() => null);
          
          if (res && res.ok) {
            const text = await res.text();
            
            // Advanced Source Detection: Look for .m3u8 pattern in any format
            // This handles different JSON structures and even some plain text responses
            const m3u8Match = text.match(/"(https?:\/\/[^"]+\.m3u8[^"]*)"/);
            
            if (m3u8Match) {
              const streamUrl = m3u8Match[1].replace(/\\/g, ''); // Clean escaped slashes
              console.log('[StreamService] Success! Resolved via:', base);
              
              // Try to find subtitles if possible
              let subs: any[] = [];
              try {
                const data = JSON.parse(text);
                subs = (data.subtitles || data.result?.subtitles || data.data?.subtitles || []);
              } catch (e) {}

              return {
                source: streamUrl,
                subtitles: subs.map((sub: any) => ({
                  file: sub.url || sub.file,
                  label: sub.lang || sub.label || 'English',
                  kind: 'subtitles',
                  default: (sub.lang || sub.label)?.toLowerCase().includes('en')
                }))
              };
            }
          }
        } catch (e) {
          console.warn(`[StreamService] Mirror ${base} failed.`);
        }
      }

      console.warn('[StreamService] All resolution attempts failed.');
      return null;
    } catch (error) {
      console.error('[StreamService] Critical error during resolution:', error);
      return null;
    }
  }
};

