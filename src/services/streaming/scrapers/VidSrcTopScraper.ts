import { Capacitor } from '@capacitor/core';
import { getGateway } from '../RemoteConfigService';

/**
 * VidSrcTopScraper
 *
 * Scrapes vid-src.top embed pages for direct HLS/M3U8 stream URLs.
 *
 * vid-src.top uses a native JWPlayer/Video.js player with a large (~623KB)
 * obfuscated inline JS bundle. Stream URLs are resolved at runtime inside the
 * bundle. We extract them using multiple regex patterns that target JWPlayer
 * sources arrays, file: keys, and raw .m3u8 URLs embedded in the JS.
 *
 * URL pattern:
 *   Movie: https://vid-src.top/embed/movie/{tmdb_id}
 *   TV:    https://vid-src.top/embed/tv/{tmdb_id}/{season}/{episode}
 */

const VIDSRCTOP_DEFAULT = 'https://vid-src.top';

async function fetchEmbedHtml(url: string, referer: string): Promise<string> {
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml',
    'Referer': referer,
  };

  if (Capacitor.isNativePlatform()) {
    const { fetchWithCapacitor } = await import('../../../utils/nativeFetch');
    const res = await fetchWithCapacitor(url, 'text', { headers });
    if (!res.ok) throw new Error(`vid-src.top embed returned ${res.status}`);
    return await res.text();
  }

  const { getLocalServerUrl } = await import('../LocalStreamService');
  const base = getLocalServerUrl() || 'http://localhost:3001';
  const proxied = `${base}/local-proxy?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer)}&origin=${encodeURIComponent('https://vid-src.top')}`;
  const res = await fetch(proxied);
  if (!res.ok) throw new Error(`vid-src.top proxy returned ${res.status}`);
  return await res.text();
}

function extractStreams(html: string): { url: string; quality: string; isM3U8: boolean }[] {
  const results: { url: string; quality: string; isM3U8: boolean }[] = [];
  const seen = new Set<string>();

  function add(url: string, quality: string) {
    const clean = url.replace(/\\u002F/g, '/').replace(/\\\//g, '/').trim();
    if (!seen.has(clean) && clean.startsWith('http')) {
      seen.add(clean);
      results.push({
        url: clean,
        quality,
        isM3U8: clean.includes('.m3u8') || clean.includes('master') || clean.includes('playlist'),
      });
    }
  }

  let m: RegExpExecArray | null;

  // Pattern 1: JWPlayer {file:"https://...m3u8"}
  const jwFileRe = /['"`]?file['"`]?\s*:\s*['"`](https?:\/\/[^'"`\s]+\.m3u8[^'"`\s]*)/gi;
  while ((m = jwFileRe.exec(html)) !== null) add(m[1], 'JW Auto');

  // Pattern 2: sources:[{file:...}] with escaped slashes
  const srcFileRe = /file\s*:\s*['"`](https?:\\?\/\\?\/[^'"`\s]{10,300})/gi;
  while ((m = srcFileRe.exec(html)) !== null) add(m[1], 'Source Auto');

  // Pattern 3: raw m3u8 URLs anywhere
  const rawM3u8Re = /https?:\/\/[a-zA-Z0-9.\-_]+(?:\/[^'"`\s\\<>(){}[\]]{5,200})?\.m3u8(?:\?[^'"`\s\\<>(){}[\]]{0,200})?/gi;
  while ((m = rawM3u8Re.exec(html)) !== null) add(m[0], 'Direct M3U8');

  // Pattern 4: video.js {"src":"https://..."}
  const vjsSrcRe = /['"`]src['"`]\s*:\s*['"`](https?:\/\/[^'"`\s]+\.m3u8[^'"`\s]*)/gi;
  while ((m = vjsSrcRe.exec(html)) !== null) add(m[1], 'VideoJS Auto');

  return results;
}

export async function scrapeVidSrcTopStream(
  tmdbId: string,
  type: 'movie' | 'tv',
  season = 1,
  episode = 1
): Promise<{ sources: any[]; subtitles: any[] }> {
  let base = VIDSRCTOP_DEFAULT;
  try {
    const remote = await getGateway('vidsrc_top_new');
    if (remote) base = remote;
  } catch { /* use default */ }

  const embedUrl = type === 'tv'
    ? `${base}/embed/tv/${tmdbId}/${season}/${episode}`
    : `${base}/embed/movie/${tmdbId}`;

  const referer = `${base}/`;

  console.log(`[VidSrcTop] Fetching embed: ${embedUrl}`);

  const html = await fetchEmbedHtml(embedUrl, referer);

  if (!html || html.length < 100) {
    throw new Error('vid-src.top returned empty/invalid page');
  }

  const streams = extractStreams(html);

  if (streams.length === 0) {
    throw new Error('No stream URLs found in vid-src.top embed page');
  }

  console.log(`[VidSrcTop] Found ${streams.length} stream candidate(s)`);

  const { getLocalServerUrl } = await import('../LocalStreamService');
  const localBase = getLocalServerUrl() || 'http://localhost:3001';

  const sources = streams.map((s, i) => ({
    url: `${localBase}/local-proxy?url=${encodeURIComponent(s.url)}&referer=${encodeURIComponent(referer)}&origin=${encodeURIComponent(base)}`,
    quality: i === 0 ? 'Auto' : `Backup ${i}`,
    isM3U8: s.isM3U8,
    provider: 'vidsrc-top-new',
  }));

  return { sources, subtitles: [] };
}
