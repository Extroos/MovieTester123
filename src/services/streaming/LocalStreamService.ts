import { Capacitor } from '@capacitor/core';
import { scrapeVidlinkStream, scrapeVidsrcPmStream } from './ClientScraperService';


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
  server: string = 'vidlink-pro'
): Promise<LocalStreamResult | null> {
  // Mobile / Native Platform: All providers scrape directly from the phone.
  // NativeHlsLoader injects the correct Referer/Origin on every HLS segment request natively,
  // bypassing the Android WebView header restriction — so cloudnestra CDN is fully bypassed.
  if (Capacitor.isNativePlatform()) {
    console.log(`[LocalStream] Native platform detected, resolving movie ${tmdbId} directly via client scrapers...`);
    
    // Attempt 1: Vidlink
    try {
      const vidlinkId = String(tmdbId).startsWith('tt') ? '' : String(tmdbId);
      if (vidlinkId) {
        const result = await scrapeVidlinkStream(vidlinkId, 'movie');
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
  server: string = 'vidlink-pro'
): Promise<LocalStreamResult | null> {
  // Mobile / Native Platform: All providers scrape directly from the phone.
  // NativeHlsLoader injects the correct Referer/Origin on every HLS segment request natively.
  if (Capacitor.isNativePlatform()) {
    console.log(`[LocalStream] Native platform detected, resolving TV ${tmdbId} S${season}E${episode} directly via client scrapers...`);
    
    // Attempt 1: Vidlink
    try {
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

