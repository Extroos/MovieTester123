import nacl from 'tweetnacl';
import { getLocalServerUrl } from './LocalStreamService';

const KEY_HEX = "c75136c5668bbfe65a7ecad431a745db68b5f381555b38d8f6c699449cf11fcd";

function hexToUint8Array(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return arr;
}

const KEY = hexToUint8Array(KEY_HEX);
const NONCE = new Uint8Array(24);

export function encryptToken(mediaId: string): string {
  const timestamp = Math.floor(Date.now() / 1000) + 480;
  
  const encoder = new TextEncoder();
  const mediaIdBytes = encoder.encode(mediaId);
  
  const timestampBytes = new Uint8Array(8);
  const view = new DataView(timestampBytes.buffer);
  view.setBigUint64(0, BigInt(timestamp), false); // Big-endian
  
  const message = new Uint8Array(mediaIdBytes.length + 8);
  message.set(mediaIdBytes, 0);
  message.set(timestampBytes, mediaIdBytes.length);
  
  const encrypted = nacl.secretbox(message, NONCE, KEY);
  if (!encrypted) throw new Error("Encryption failed");
  
  const fullPayload = new Uint8Array(NONCE.length + encrypted.length);
  fullPayload.set(NONCE, 0);
  fullPayload.set(encrypted, NONCE.length);
  
  let binary = '';
  for (let i = 0; i < fullPayload.length; i++) {
    binary += String.fromCharCode(fullPayload[i]);
  }
  const base64 = btoa(binary);
  
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  'Origin': 'https://vidlink.pro',
  'Referer': 'https://vidlink.pro/'
};

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 8000): Promise<any> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  const host = new URL(url).host;
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    if (!res.ok) {
      let bodyText = '';
      try {
        bodyText = await res.text();
      } catch (_) {}
      
      let parsedMessage = '';
      try {
        const parsed = JSON.parse(bodyText);
        parsedMessage = parsed.message || parsed.error || bodyText;
      } catch (_) {
        parsedMessage = bodyText;
      }
      
      const errorMsg = parsedMessage ? `Gateway ${host} responded HTTP ${res.status}: ${parsedMessage}` : `Gateway ${host} responded HTTP ${res.status}`;
      throw new Error(errorMsg);
    }
    return await res.json();
  } catch (err: any) {
    clearTimeout(id);
    if (err.name === 'AbortError') {
      throw new Error(`Gateway ${host} request timed out after ${timeoutMs}ms`);
    }
    throw err;
  }
}

export function formatVidlinkResponse(data: any): any {
  if (!data?.stream) {
    throw new Error("No stream object in Vidlink response");
  }

  const sources = [];
  if (data.stream.playlist) {
    const originalPlaylist = data.stream.playlist;
    sources.push({
      url: originalPlaylist,
      quality: 'auto',
      isM3U8: data.stream.type === 'hls' || originalPlaylist.includes('.m3u8')
    });
  } else if (data.stream.qualities) {
    Object.entries(data.stream.qualities).forEach(([quality, qObj]: [string, any]) => {
      if (qObj && qObj.url) {
        sources.push({
          url: qObj.url,
          quality: quality,
          isM3U8: qObj.type === 'hls' || qObj.url.includes('.m3u8')
        });
      }
    });
  }

  if (sources.length === 0) {
    throw new Error("No usable stream sources found in Vidlink response");
  }
  
  const captionsList = data.captions || data.stream.captions || [];
  const subtitles = captionsList.map((c: any) => {
    let subUrl = c.url || '';
    if (subUrl && !subUrl.startsWith('http://') && !subUrl.startsWith('https://')) {
      if (subUrl.startsWith('//')) {
        subUrl = `https:${subUrl}`;
      } else if (subUrl.startsWith('/')) {
        subUrl = `https://vidlink.pro${subUrl}`;
      } else {
        subUrl = `https://vidlink.pro/${subUrl}`;
      }
    }
    return {
      url: subUrl,
      lang: c.language || 'Unknown'
    };
  });
  
  return {
    sources,
    subtitles
  };
}

export async function scrapeVidlinkStream(tmdbId: string, type: 'movie' | 'tv', season = 1, episode = 1, gatewayUrl?: string): Promise<any> {
  const token = encryptToken(tmdbId);
  const gateways = gatewayUrl ? [gatewayUrl] : [
    'https://vidlink.pro',
    'https://vidlink.me',
    'https://vidlink.org',
    'https://vidlink.net'
  ];
  
  const errors: string[] = [];
  const promises = gateways.map(async (gw) => {
    const url = type === 'tv' 
      ? `${gw}/api/b/tv/${token}/${season}/${episode}?multiLang=1`
      : `${gw}/api/b/movie/${token}?multiLang=1`;
    try {
      return await fetchWithTimeout(url, {
        headers: DEFAULT_HEADERS
      }, 6000);
    } catch (e: any) {
      errors.push(e.message || String(e));
      throw e;
    }
  });
  
  try {
    const result = await Promise.any(promises);
    return formatVidlinkResponse(result);
  } catch (e: any) {
    console.error(`[Client Vidlink] Concurrency resolution failed:`, e.message);
    const combinedErrors = errors.length > 0 ? errors.join('\n') : e.message;
    const finalErr = new Error(`Failed to resolve from any Vidlink gateway concurrently.\nLogs:\n${combinedErrors}`);
    (finalErr as any).logs = errors;
    throw finalErr;
  }
}

export async function scrapeVidsrcFallback(tmdbId: string, isTv = false, season = 1, episode = 1): Promise<any> {
  const embedUrl = isTv
    ? `https://vidsrc.to/embed/tv/${tmdbId}/${season}-${episode}`
    : `https://vidsrc.to/embed/movie/${tmdbId}`;

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml',
    'Referer': 'https://google.com/'
  };

  try {
    console.log(`[Client VidSrc] Fetching vidsrc.to: ${embedUrl}`);
    const res1 = await fetch(embedUrl, { headers });
    if (!res1.ok) throw new Error(`vidsrc.to returned ${res1.status}`);
    const html1 = await res1.text();

    const vsembedMatch = html1.match(/src="(https?:\/\/vsembed[^"]+)"/);
    if (!vsembedMatch) throw new Error("No vsembed.ru iframe found in vidsrc.to page");
    const vsembedUrl = vsembedMatch[1];
    console.log(`[Client VidSrc] vsembed URL: ${vsembedUrl}`);

    const vsembedHeaders = { ...headers, 'Referer': embedUrl };
    const res2 = await fetch(vsembedUrl, { headers: vsembedHeaders });
    if (!res2.ok) throw new Error(`vsembed.ru returned ${res2.status}`);
    const html2 = await res2.text();

    const rcpMatch = html2.match(/cloudnestra\.com\/rcp\/([A-Za-z0-9_\-=.]+)/);
    if (!rcpMatch) throw new Error("No cloudnestra rcp hash found in vsembed.ru page");
    const rcpHash = rcpMatch[1];
    const rcpUrl = `https://cloudnestra.com/rcp/${rcpHash}`;
    console.log(`[Client VidSrc] cloudnestra rcp URL: ${rcpUrl.substring(0, 60)}`);

    const rcpHeaders = { ...headers, 'Referer': vsembedUrl };
    const res3 = await fetch(rcpUrl, { headers: rcpHeaders });
    if (!res3.ok) throw new Error(`cloudnestra/rcp returned ${res3.status}`);
    const html3 = await res3.text();
    if (html3.includes('cf-turnstile')) throw new Error("cloudnestra/rcp is Cloudflare Turnstile protected");

    const prorcpMatch = html3.match(/src:\s*['"]\s*\/prorcp\/([^'"]+)['"]/i);
    if (!prorcpMatch) throw new Error("prorcp hash not found in cloudnestra/rcp page");
    const prorcpHash = prorcpMatch[1];
    const prorcpUrl = `https://cloudnestra.com/prorcp/${prorcpHash}`;
    console.log(`[Client VidSrc] prorcp URL: ${prorcpUrl.substring(0, 60)}`);

    const prorcpHeaders = { ...headers, 'Referer': rcpUrl };
    const res4 = await fetch(prorcpUrl, { headers: prorcpHeaders });
    if (!res4.ok) throw new Error(`cloudnestra/prorcp returned ${res4.status}`);
    const html4 = await res4.text();

    const m3u8Match = html4.match(/"(https?:\/\/[^"]+\.m3u8[^"]*)"/i);
    if (!m3u8Match) throw new Error("m3u8 stream not found in prorcp page");

    const rawMatched = m3u8Match[1];
    const rawStreams = rawMatched.split(/\s+or\s+/);

    const workingStreams = rawStreams.filter(s => s.includes('/pl/') || s.includes('/cdnstr/') || s.includes('master.m3u8') || s.includes('list.m3u8'));
    const finalStreams = workingStreams.length > 0 ? workingStreams : rawStreams;

    const sources = finalStreams.map((stream, idx) => {
      const cleaned = stream.replace(/\{v\d\}/g, 'cloudnestra.com');
      return {
        url: cleaned,
        quality: idx === 0 ? 'auto' : `backup ${idx}`,
        isM3U8: true
      };
    });

    console.log(`[Client VidSrc] Success: resolved ${sources.length} streams`);
    return { sources, subtitles: [] };

  } catch (e: any) {
    console.error(`[Client VidSrc] Failed: ${e.message}`);
    throw new Error(`VidSrc stream extraction failed: ${e.message}`);
  }
}

export async function scrapeVidifyStream(tmdbId: string, isTv = false, season = 1, episode = 1): Promise<any> {
  const vidifyUrl = isTv
    ? `https://pro.vidify.top/embed/tv/${tmdbId}/${season}/${episode}`
    : `https://pro.vidify.top/embed/movie/${tmdbId}`;

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml',
    'Referer': 'https://google.com/'
  };

  try {
    console.log(`[Client Vidify] Fetching: ${vidifyUrl}`);
    const res1 = await fetch(vidifyUrl, { headers });
    if (!res1.ok) throw new Error(`pro.vidify.top returned ${res1.status}`);
    const html1 = await res1.text();

    const serverMatch = html1.match(/data-server=["']([^"']+)["']/);
    if (!serverMatch) throw new Error(`Movie ${tmdbId} not found in Vidify database (no data-server attribute)`);

    const b64Val = serverMatch[1];
    const decodedUrl = atob(b64Val);
    console.log(`[Client Vidify] Decoded server URL: ${decodedUrl.substring(0, 80)}`);

    const rcpHashMatch = decodedUrl.match(/cloudnestra\.com\/rcp\/([A-Za-z0-9_\-=.]+)/);
    if (!rcpHashMatch) throw new Error(`Decoded Vidify URL is not a cloudnestra rcp URL`);
    const rcpHash = rcpHashMatch[1];
    const rcpUrl = `https://cloudnestra.com/rcp/${rcpHash}`;

    const rcpHeaders = { ...headers, 'Referer': 'https://vsembed.ru/' };
    const res2 = await fetch(rcpUrl, { headers: rcpHeaders });
    if (!res2.ok) throw new Error(`cloudnestra/rcp returned ${res2.status}`);
    const html2 = await res2.text();
    if (html2.includes('cf-turnstile')) throw new Error("cloudnestra/rcp is Cloudflare Turnstile protected");

    const prorcpMatch = html2.match(/src:\s*['"]\s*\/prorcp\/([^'"]+)['"]/i);
    if (!prorcpMatch) throw new Error("prorcp hash not found in cloudnestra/rcp page");
    const prorcpHash = prorcpMatch[1];
    const prorcpUrl = `https://cloudnestra.com/prorcp/${prorcpHash}`;

    const prorcpHeaders = { ...headers, 'Referer': rcpUrl };
    const res3 = await fetch(prorcpUrl, { headers: prorcpHeaders });
    if (!res3.ok) throw new Error(`cloudnestra/prorcp returned ${res3.status}`);
    const html3 = await res3.text();

    const m3u8Match = html3.match(/"(https?:\/\/[^"]+\.m3u8[^"]*)"/i);
    if (!m3u8Match) throw new Error("m3u8 stream not found in prorcp page");

    const rawMatched = m3u8Match[1];
    const rawStreams = rawMatched.split(/\s+or\s+/);

    const workingStreams = rawStreams.filter(s => s.includes('/pl/') || s.includes('/cdnstr/') || s.includes('master.m3u8') || s.includes('list.m3u8'));
    const finalStreams = workingStreams.length > 0 ? workingStreams : rawStreams;

    const sources = finalStreams.map((stream, idx) => {
      const cleaned = stream.replace(/\{v\d\}/g, 'cloudnestra.com');
      return {
        url: cleaned,
        quality: idx === 0 ? 'auto' : `backup ${idx}`,
        isM3U8: true
      };
    });

    console.log(`[Client Vidify] Success: resolved ${sources.length} streams`);
    return { sources, subtitles: [] };

  } catch (e: any) {
    console.error(`[Client Vidify] Failed: ${e.message}`);
    throw new Error(`Vidify stream extraction failed: ${e.message}`);
  }
}

export async function scrapeVidsrcPmStream(tmdbId: string, type: 'movie' | 'tv', season = 1, episode = 1): Promise<any> {
  const localServer = getLocalServerUrl();
  let url = `${localServer}/meta/tmdb/watch/${tmdbId}?type=${type}&server=vidsrc-pm`;
  if (type === 'tv') {
    url += `&s=${season}&e=${episode}`;
  }
  console.log(`[Client VidSrc PM] Fetching stream from: ${url}`);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`vidsrc.pm resolver returned status ${res.status}`);
    return await res.json();
  } catch (e: any) {
    console.error(`[Client VidSrc PM] Failed to resolve:`, e.message);
    throw e;
  }
}


