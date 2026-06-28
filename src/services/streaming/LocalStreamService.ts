import { Capacitor, registerPlugin } from '@capacitor/core';
import { scrapeVidlinkStream, scrapeVidsrcPmStream } from './ClientScraperService';

const NativeStreamingEngine = registerPlugin<any>('NativeStreamingEngine');


/**
 * LocalStreamService — resolves direct .m3u8 / .mp4 streams via a
 * self-hosted Consumet API instance (e.g. deployed on Railway).
 *
 * Configure the server URL in Settings → Local Server, or set
 * VITE_CONSUMET_URL in your .env file.
 *
 * Consumet repo: https://github.com/consumet/api.consumet.org
 * Deploy free:   https://railway.app/new/template/consumet
 */

export interface LocalStreamResult {
  streamUrl: string;
  type: 'm3u8' | 'mp4' | 'unknown';
  subtitles?: { file: string; label: string; kind: string; default?: boolean }[];
  quality?: string;
  provider?: string;
}

const STORAGE_KEY = 'cinemovie_consumet_url';

export function getLocalServerUrl(): string {
  // Priority: localStorage override → .env variable → empty (not configured)
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && stored.trim() && stored !== 'null' && stored !== 'undefined') return stored.trim().replace(/\/$/, '');
  const envUrl = (import.meta as any).env?.VITE_CONSUMET_URL;
  if (envUrl && envUrl.trim() && envUrl !== 'null' && envUrl !== 'undefined') return envUrl.trim().replace(/\/$/, '');

  // Dynamic fallback for LAN / mobile browser testing:
  if (typeof window !== 'undefined' && window.location && window.location.hostname) {
    const host = window.location.hostname;
    if (host && host !== 'localhost' && host !== '127.0.0.1' && !host.startsWith('10.') && !host.startsWith('192.168.') && !host.startsWith('172.')) {
      // If it's a domain name or local LAN IP, construct the server URL using the same host
      return `http://${host}:3001`;
    }
    // Standard local IP checking
    if (host && (host.match(/^\d+\.\d+\.\d+\.\d+$/) || host.includes('.local'))) {
      return `http://${host}:3001`;
    }
  }
  return 'http://localhost:3001';
}

export function setLocalServerUrl(url: string) {
  localStorage.setItem(STORAGE_KEY, url.trim().replace(/\/$/, ''));
}

export function isLocalServerConfigured(): boolean {
  return !!getLocalServerUrl();
}

/** Detect stream type from URL */
function detectType(url: string): 'm3u8' | 'mp4' | 'unknown' {
  if (url.includes('.m3u8')) return 'm3u8';
  if (url.includes('.mp4'))  return 'mp4';
  return 'unknown';
}

/** Safe AbortSignal timeout helper for mobile compatibility */
function getTimeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) {
    return (AbortSignal as any).timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

/** Extract the best stream URL from a Consumet response object */
function extractFromConsumetResponse(data: any): LocalStreamResult | null {
  // Consumet /meta/tmdb/watch response structure
  if (data?.sources && Array.isArray(data.sources)) {
    // Prefer 1080p, then highest quality
    const sorted = [...data.sources].sort((a, b) => {
      const qa = parseInt(a.quality || '0');
      const qb = parseInt(b.quality || '0');
      return qb - qa;
    });

    const best = sorted[0];
    if (best?.url) {
      const subs = (data.subtitles || [])
        .filter((s: any) => s.lang !== 'Thumbnails')
        .map((s: any) => ({
          file: s.url,
          label: s.lang || 'Unknown',
          kind: 'subtitles',
          default: (s.lang || '').toLowerCase().includes('english'),
        }));

      return {
        streamUrl: best.url,
        type: detectType(best.url),
        quality: best.quality || 'auto',
        subtitles: subs,
        provider: 'consumet/tmdb',
      };
    }
  }

  // Generic: scan for .m3u8 or .mp4 in raw text
  return null;
}

/** Helper to wrap stream URL with CORS proxy, parsing headers if present */
function proxyStreamUrl(url: string): string {
  if (!url.startsWith('http')) return url;
  if (url.includes('/local-proxy')) return url;
  
  const base = getLocalServerUrl() || 'http://localhost:3001';
  let referer = 'https://videostr.net/';
  let origin = 'https://videostr.net';
  
  try {
    const urlObj = new URL(url);
    const headersParam = urlObj.searchParams.get('headers');
    if (headersParam) {
      const parsedHeaders = JSON.parse(headersParam);
      if (parsedHeaders.referer) referer = parsedHeaders.referer;
      if (parsedHeaders.origin) origin = parsedHeaders.origin;
    }
  } catch (e) {}
  
  return `${base}/local-proxy?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer)}&origin=${encodeURIComponent(origin)}`;
}

/**
 * Try to resolve a movie stream via the local Consumet server.
 */
export async function resolveMovieStream(
  tmdbId: number | string,
  title: string,
  imdbId?: string,
  server?: string
): Promise<LocalStreamResult | null> {
  const selectedServer = server || (typeof localStorage !== 'undefined' ? localStorage.getItem('selected_server') : 'vidlink-pro') || 'vidlink-pro';
  const localServer = getLocalServerUrl();
  const isLocalHost = !localServer || localServer.includes('localhost') || localServer.includes('127.0.0.1');
  const runClientScrapers = Capacitor.isNativePlatform() && isLocalHost;
  if (runClientScrapers) {
    console.log(`[LocalStream] Resolving movie ${tmdbId} directly via client scrapers (Server: ${selectedServer})...`);
    
    if (selectedServer === 'test-server') {
      try {
        console.log(`[LocalStream] Resolving via native test-server...`);
        const res = await NativeStreamingEngine.resolveStreams({
          tmdbId: String(tmdbId),
          imdbId: imdbId || '',
          type: 'movie',
          season: 1,
          episode: 1,
          localServer: localServer
        });
        const sources = res.sources || [];
        if (sources.length > 0) {
          let proxyPort = 8000;
          try {
            const portRes = await NativeStreamingEngine.getProxyPort();
            if (portRes && portRes.port) proxyPort = portRes.port;
          } catch(_) {}
          
          const resolvedSources = sources.map((s: any) => {
            let sUrl = s.url;
            if (!sUrl.includes('/local-proxy') && !sUrl.startsWith('blob:')) {
              sUrl = `http://localhost:${proxyPort}/local-proxy?url=${encodeURIComponent(s.url)}&referer=${encodeURIComponent(s.referer || '')}&origin=${encodeURIComponent(s.origin || '')}`;
            }
            return {
              url: sUrl,
              quality: s.quality || 'auto',
              isM3U8: s.isM3U8
            };
          });

          return {
            streamUrl: resolvedSources[0].url,
            type: resolvedSources[0].isM3U8 ? 'm3u8' : 'mp4',
            quality: resolvedSources[0].quality,
            subtitles: (res.subtitles || []).map((s: any) => ({
              file: s.url,
              label: s.lang || 'Unknown',
              kind: 'subtitles',
              default: (s.lang || '').toLowerCase().includes('english')
            })),
            provider: 'client/test-server',
            sources: resolvedSources
          } as any;
        }
      } catch (e: any) {
        console.warn(`[LocalStream] Client-side test-server movie resolution failed: ${e.message}`);
      }
    }
    
    // Attempt 1: Vidlink
    try {
      const vidlinkId = String(tmdbId).startsWith('tt') ? '' : String(tmdbId);
      if (vidlinkId) {
        let result;
        if (Capacitor.isNativePlatform()) {
          console.log(`[LocalStream] Resolving Vidlink movie natively on Android...`);
          const nativeRes = await NativeStreamingEngine.resolveVidlink({
            tmdbId: vidlinkId,
            type: 'movie',
            season: 1,
            episode: 1
          });
          result = {
            sources: (nativeRes.sources || []).map((s: any) => ({
              url: s.url,
              quality: s.quality || 'auto',
              isM3U8: s.isM3U8
            })),
            subtitles: (nativeRes.subtitles || []).map((s: any) => ({
              url: s.url,
              lang: s.lang || 'Unknown'
            }))
          };
        } else {
          result = await scrapeVidlinkStream(vidlinkId, 'movie');
        }

        if (result && result.sources && result.sources.length > 0) {
          const bestSource = result.sources[0];
          const subs = (result.subtitles || []).map((s: any) => ({
            file: s.url,
            label: s.lang || 'Unknown',
            kind: 'subtitles',
            default: (s.lang || '').toLowerCase().includes('english')
          }));
          return {
            streamUrl: bestSource.url,
            type: bestSource.isM3U8 ? 'm3u8' : 'mp4',
            quality: bestSource.quality || 'auto',
            subtitles: subs,
            provider: 'client/vidlink'
          };
        }
      }
    } catch (e: any) {
      console.warn(`[LocalStream] Client-side Vidlink movie resolution failed: ${e.message}`);
    }

    // Attempt 2: VidSrc PM Fallback
    try {
      console.log(`[LocalStream] Resolving via native VidSrc PM fallback...`);
      const result = await scrapeVidsrcPmStream(imdbId || String(tmdbId), 'movie');
      if (result && result.sources && result.sources.length > 0) {
        const bestSource = result.sources[0];
        const subs = (result.subtitles || []).map((s: any) => ({
          file: s.url,
          label: s.lang || 'Unknown',
          kind: 'subtitles',
          default: (s.lang || '').toLowerCase().includes('english')
        }));
        return {
          streamUrl: bestSource.url,
          type: bestSource.isM3U8 ? 'm3u8' : 'mp4',
          quality: bestSource.quality || 'auto',
          subtitles: subs,
          provider: 'client/vidsrc-pm'
        };
      }
    } catch (e: any) {
      console.warn(`[LocalStream] Client-side VidSrc PM movie fallback failed: ${e.message}`);
    }


    // Attempt 3: General Vidlink Fallback (uses NativeHlsLoader for Referer on segments)
    try {
      const vidlinkId = String(tmdbId).startsWith('tt') ? '' : String(tmdbId);
      if (vidlinkId) {
        console.log(`[LocalStream] Resolving via native general Vidlink fallback...`);
        const result = await scrapeVidlinkStream(vidlinkId, 'movie', 1, 1);
        if (result && result.sources && result.sources.length > 0) {
          const bestSource = result.sources[0];
          const subs = (result.subtitles || []).map((s: any) => ({
            file: s.url,
            label: s.lang || 'Unknown',
            kind: 'subtitles',
            default: (s.lang || '').toLowerCase().includes('english')
          }));
          return {
            streamUrl: bestSource.url,
            type: bestSource.isM3U8 ? 'm3u8' : 'mp4',
            quality: bestSource.quality || 'auto',
            subtitles: subs,
            provider: 'client/vidlink-general'
          };
        }
      }
    } catch (e: any) {
      console.warn(`[LocalStream] Client-side general Vidlink movie fallback failed: ${e.message}`);
    }
  }

  const base = getLocalServerUrl();
  if (!base) return null;

  const attempts = [
    // Consumet /meta/tmdb endpoint (direct TMDB ID support)
    async () => {
      const url = `${base}/meta/tmdb/watch/${tmdbId}?type=movie&title=${encodeURIComponent(title)}&server=${server}`;
      console.log(`[LocalStream] Trying: ${url}`);
      const res = await fetch(url, { signal: getTimeoutSignal(45000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return extractFromConsumetResponse(await res.json());
    },

  ];

  for (const attempt of attempts) {
    try {
      const result = await attempt();
      if (result) {
        console.log(`[LocalStream] ✓ Movie resolved: ${result.streamUrl.substring(0, 80)}`);
        result.streamUrl = proxyStreamUrl(result.streamUrl);
        return result;
      }
    } catch (e: any) {
      console.warn(`[LocalStream] Attempt failed: ${e.message}`);
    }
  }

  console.warn('[LocalStream] All movie resolution attempts failed.');
  return null;
}

/**
 * Try to resolve a TV show episode stream via the local Consumet server.
 */
export async function resolveTVStream(
  tmdbId: number | string,
  showName: string,
  season: number,
  episode: number,
  server?: string
): Promise<LocalStreamResult | null> {
  const selectedServer = server || (typeof localStorage !== 'undefined' ? localStorage.getItem('selected_server') : 'vidlink-pro') || 'vidlink-pro';
  const localServer = getLocalServerUrl();
  const isLocalHost = !localServer || localServer.includes('localhost') || localServer.includes('127.0.0.1');
  const runClientScrapers = Capacitor.isNativePlatform() && isLocalHost;
  if (runClientScrapers) {
    console.log(`[LocalStream] Resolving TV ${tmdbId} S${season}E${episode} directly via client scrapers (Server: ${selectedServer})...`);
    
    if (selectedServer === 'test-server') {
      try {
        console.log(`[LocalStream] Resolving via native test-server...`);
        const res = await NativeStreamingEngine.resolveStreams({
          tmdbId: String(tmdbId),
          type: 'tv',
          season: season,
          episode: episode,
          localServer: localServer
        });
        const sources = res.sources || [];
        if (sources.length > 0) {
          let proxyPort = 8000;
          try {
            const portRes = await NativeStreamingEngine.getProxyPort();
            if (portRes && portRes.port) proxyPort = portRes.port;
          } catch(_) {}
          
          const resolvedSources = sources.map((s: any) => {
            let sUrl = s.url;
            if (!sUrl.includes('/local-proxy') && !sUrl.startsWith('blob:')) {
              sUrl = `http://localhost:${proxyPort}/local-proxy?url=${encodeURIComponent(s.url)}&referer=${encodeURIComponent(s.referer || '')}&origin=${encodeURIComponent(s.origin || '')}`;
            }
            return {
              url: sUrl,
              quality: s.quality || 'auto',
              isM3U8: s.isM3U8
            };
          });

          return {
            streamUrl: resolvedSources[0].url,
            type: resolvedSources[0].isM3U8 ? 'm3u8' : 'mp4',
            quality: resolvedSources[0].quality,
            subtitles: (res.subtitles || []).map((s: any) => ({
              file: s.url,
              label: s.lang || 'Unknown',
              kind: 'subtitles',
              default: (s.lang || '').toLowerCase().includes('english')
            })),
            provider: 'client/test-server',
            sources: resolvedSources
          } as any;
        }
      } catch (e: any) {
        console.warn(`[LocalStream] Client-side test-server TV resolution failed: ${e.message}`);
      }
    }
    
    // Attempt 1: Vidlink
    try {
      let result;
      if (Capacitor.isNativePlatform()) {
        console.log(`[LocalStream] Resolving Vidlink TV S${season}E${episode} natively on Android...`);
        const nativeRes = await NativeStreamingEngine.resolveVidlink({
          tmdbId: String(tmdbId),
          type: 'tv',
          season: season,
          episode: episode
        });
        result = {
          sources: (nativeRes.sources || []).map((s: any) => ({
            url: s.url,
            quality: s.quality || 'auto',
            isM3U8: s.isM3U8
          })),
          subtitles: (nativeRes.subtitles || []).map((s: any) => ({
            url: s.url,
            lang: s.lang || 'Unknown'
          }))
        };
      } else {
        result = await scrapeVidlinkStream(String(tmdbId), 'tv', season, episode);
      }

      if (result && result.sources && result.sources.length > 0) {
        const bestSource = result.sources[0];
        const subs = (result.subtitles || []).map((s: any) => ({
          file: s.url,
          label: s.lang || 'Unknown',
          kind: 'subtitles',
          default: (s.lang || '').toLowerCase().includes('english')
        }));
        return {
          streamUrl: bestSource.url,
          type: bestSource.isM3U8 ? 'm3u8' : 'mp4',
          quality: bestSource.quality || 'auto',
          subtitles: subs,
          provider: 'client/vidlink'
        };
      }
    } catch (e: any) {
      console.warn(`[LocalStream] Client-side TV Vidlink resolution failed: ${e.message}`);
    }

    // Attempt 2: VidSrc PM Fallback
    try {
      console.log(`[LocalStream] Resolving via native VidSrc PM fallback for TV S${season}E${episode}...`);
      const result = await scrapeVidsrcPmStream(String(tmdbId), 'tv', season, episode);
      if (result && result.sources && result.sources.length > 0) {
        const bestSource = result.sources[0];
        const subs = (result.subtitles || []).map((s: any) => ({
          file: s.url,
          label: s.lang || 'Unknown',
          kind: 'subtitles',
          default: (s.lang || '').toLowerCase().includes('english')
        }));
        return {
          streamUrl: bestSource.url,
          type: bestSource.isM3U8 ? 'm3u8' : 'mp4',
          quality: bestSource.quality || 'auto',
          subtitles: subs,
          provider: 'client/vidsrc-pm'
        };
      }
    } catch (e: any) {
      console.warn(`[LocalStream] Client-side VidSrc PM TV fallback failed: ${e.message}`);
    }


    // Attempt 3: General Vidlink Fallback (uses NativeHlsLoader for Referer on segments)
    try {
      console.log(`[LocalStream] Resolving via native general Vidlink fallback for TV S${season}E${episode}...`);
      const result = await scrapeVidlinkStream(String(tmdbId), 'tv', season, episode);
      if (result && result.sources && result.sources.length > 0) {
        const bestSource = result.sources[0];
        const subs = (result.subtitles || []).map((s: any) => ({
          file: s.url,
          label: s.lang || 'Unknown',
          kind: 'subtitles',
          default: (s.lang || '').toLowerCase().includes('english')
        }));
        return {
          streamUrl: bestSource.url,
          type: bestSource.isM3U8 ? 'm3u8' : 'mp4',
          quality: bestSource.quality || 'auto',
          subtitles: subs,
          provider: 'client/vidlink-general'
        };
      }
    } catch (e: any) {
      console.warn(`[LocalStream] Client-side general Vidlink TV fallback failed: ${e.message}`);
    }
  }

  const base = getLocalServerUrl();
  if (!base) return null;

  const attempts = [
    // Consumet /meta/tmdb endpoint
    async () => {
      const url = `${base}/meta/tmdb/watch/${tmdbId}?type=tv&s=${season}&e=${episode}&title=${encodeURIComponent(showName)}&server=${server}`;
      console.log(`[LocalStream] Trying: ${url}`);
      const res = await fetch(url, { signal: getTimeoutSignal(45000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return extractFromConsumetResponse(await res.json());
    },

  ];

  for (const attempt of attempts) {
    try {
      const result = await attempt();
      if (result) {
        console.log(`[LocalStream] ✓ TV resolved S${season}E${episode}: ${result.streamUrl.substring(0, 80)}`);
        result.streamUrl = proxyStreamUrl(result.streamUrl);
        return result;
      }
    } catch (e: any) {
      console.warn(`[LocalStream] Attempt failed: ${e.message}`);
    }
  }

  console.warn('[LocalStream] All TV resolution attempts failed.');
  return null;
}

