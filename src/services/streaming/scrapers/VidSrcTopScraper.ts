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
    const res = await fetchWithCapacitor(url, 'text', headers);
    if (!res.ok) throw new Error(`vid-src.top embed returned ${res.status}`);
    return await res.text();
  }

  const { getNativeProxyBaseUrl } = await import('../LocalStreamService');
  const base = await getNativeProxyBaseUrl();
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

  console.log(`[VidSrcTop] Resolving embed via client dynamic trace: ${embedUrl}`);

  const { getNativeProxyBaseUrl } = await import('../LocalStreamService');
  const localBase = await getNativeProxyBaseUrl();
  const proxyUrl = `${localBase}/local-proxy`;

  // 1. Fetch landing page
  const landingHtml = await fetchEmbedHtml(embedUrl, referer);

  // Find subdomain iframe
  let subdomainUrl = '';
  const iframeMatch = landingHtml.match(/<iframe\b[^>]*src="([^"]+)"/i);
  if (iframeMatch) {
    subdomainUrl = iframeMatch[1];
    if (subdomainUrl.startsWith('//')) subdomainUrl = 'https:' + subdomainUrl;
  } else {
    subdomainUrl = `https://vidsrcme.vid-src.top/embed/${type}/${tmdbId}${type === 'tv' ? `/${season}/${episode}` : ''}?ds_lang=en`;
  }

  // 2. Fetch subdomain player page
  const subdomainProxyUrl = `${proxyUrl}?url=${encodeURIComponent(subdomainUrl)}&referer=${encodeURIComponent(embedUrl)}&origin=${encodeURIComponent(base)}`;
  const subRes = await fetch(subdomainProxyUrl);
  if (!subRes.ok) throw new Error(`Subdomain proxy returned ${subRes.status}`);
  const subdomainHtml = await subRes.text();

  // Find inner player_iframe
  let rcpAbsoluteUrl = '';
  const rcpMatch = subdomainHtml.match(/id="player_iframe"\s+src="([^"]+)"/i) || subdomainHtml.match(/<iframe\b[^>]*id="player_iframe"[^>]*src="([^"]+)"/i);
  if (rcpMatch) {
    rcpAbsoluteUrl = rcpMatch[1];
    if (rcpAbsoluteUrl.startsWith('//')) rcpAbsoluteUrl = 'https:' + rcpAbsoluteUrl;
  } else {
    throw new Error('Failed to find player_iframe in subdomain page');
  }

  // 3. Fetch RCP page
  const rcpProxyUrl = `${proxyUrl}?url=${encodeURIComponent(rcpAbsoluteUrl)}&referer=${encodeURIComponent(subdomainUrl)}&origin=${encodeURIComponent(new URL(subdomainUrl).origin)}`;
  const rcpRes = await fetch(rcpProxyUrl);
  if (!rcpRes.ok) throw new Error(`RCP proxy returned ${rcpRes.status}`);
  const rcpHtml = await rcpRes.text();

  // Find prorcp path
  const prorcpMatch = rcpHtml.match(/src:\s*['"](\/prorcp\/[^'"]+)['"]/);
  if (!prorcpMatch) {
    throw new Error('Failed to find prorcp path in RCP page');
  }

  const cloudHost = new URL(rcpAbsoluteUrl).origin;
  const prorcpAbsoluteUrl = cloudHost + prorcpMatch[1];

  // 4. Fetch prorcp page
  const prorcpProxyUrl = `${proxyUrl}?url=${encodeURIComponent(prorcpAbsoluteUrl)}&referer=${encodeURIComponent(rcpAbsoluteUrl)}&origin=${encodeURIComponent(cloudHost)}`;
  const prorcpRes = await fetch(prorcpProxyUrl);
  if (!prorcpRes.ok) throw new Error(`Prorcp proxy returned ${prorcpRes.status}`);
  const prorcpHtml = await prorcpRes.text();

  // Find master_urls
  const masterUrlsMatch = prorcpHtml.match(/var master_urls\s*=\s*["']([^"']+)["']/);
  if (!masterUrlsMatch) {
    throw new Error('Failed to find master_urls in prorcp page');
  }

  const rawUrls = masterUrlsMatch[1].split(' or ');
  const sources = [];
  const subtitles: any[] = [];

  // Parse official subtitles
  try {
    const tracksMatch = prorcpHtml.match(/tracks:\s*(\[[^\]]+\])/);
    if (tracksMatch) {
      const cleanTracksText = tracksMatch[1].replace(/'/g, '"').replace(/([a-zA-Z0-9_]+)\s*:/g, '"$1":');
      const tracks = JSON.parse(cleanTracksText);
      for (const track of tracks) {
        if (track.file) {
          subtitles.push({
            url: track.file,
            lang: track.label || track.language || 'Unknown'
          });
        }
      }
    }
  } catch (_) {}

  if (subtitles.length === 0) {
    const trackRegex = /<track\s+[^>]*src="([^"]+)"[^>]*label="([^"]+)"/g;
    let match;
    while ((match = trackRegex.exec(prorcpHtml)) !== null) {
      subtitles.push({
        url: match[1],
        lang: match[2]
      });
    }
  }

  for (const rawUrl of rawUrls) {
    try {
      const urlObj = new URL(rawUrl);
      const domain = urlObj.origin;
      const generateUrl = `${domain}/generate.php`;

      // Generate token
      const generateProxyUrl = `${proxyUrl}?url=${encodeURIComponent(generateUrl)}&referer=${encodeURIComponent(cloudHost + '/')}&origin=${encodeURIComponent(cloudHost)}`;
      const genRes = await fetch(generateProxyUrl);
      if (genRes.ok) {
        const token = (await genRes.text()).trim();
        let finalUrl = rawUrl;
        if (rawUrl.includes('__TOKEN__')) {
          finalUrl = finalUrl.replace('__TOKEN__', token);
        }
        if (rawUrl.includes('__TOKENPG__')) {
          finalUrl = finalUrl.replace('__TOKENPG__', token);
        }
        sources.push({
          url: `${proxyUrl}?url=${encodeURIComponent(finalUrl)}&referer=${encodeURIComponent(cloudHost + '/')}&origin=${encodeURIComponent(cloudHost)}`,
          quality: domain.includes('putgate') ? 'Putgate Mirror' : 'Volition Mirror',
          isM3U8: true,
          provider: 'vidsrc-top-new',
        });
      }
    } catch (e: any) {
      console.warn(`[VidSrcTop] Failed token generation mirror: ${e.message}`);
    }
  }

  if (sources.length === 0) {
    throw new Error('No stream URLs could be resolved successfully for vid-src.top');
  }

  return { sources, subtitles };
}
