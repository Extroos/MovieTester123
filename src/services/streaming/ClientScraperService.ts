import nacl from 'tweetnacl';
import { Capacitor } from '@capacitor/core';
import { getLocalServerUrl } from './LocalStreamService';
import { logToNative } from '../../utils/nativeFetch';

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

let timeOffsetMs = 0;
let hasSyncedTime = false;

export async function syncClockOffset() {
  if (hasSyncedTime) return;
  try {
    const start = Date.now();
    let text = '';
    
    if (Capacitor.isNativePlatform()) {
      const { fetchWithCapacitor } = await import('../../utils/nativeFetch');
      const capRes = await fetchWithCapacitor('https://cloudflare.com/cdn-cgi/trace', 'text');
      if (capRes.ok) {
        text = await capRes.text();
      }
    } else {
      const res = await fetch('https://cloudflare.com/cdn-cgi/trace');
      if (res.ok) {
        text = await res.text();
      }
    }

    if (text) {
      const match = text.match(/ts=(\d+)/);
      if (match) {
        const cfTimeSec = parseInt(match[1]);
        const latency = (Date.now() - start) / 2;
        const cfTimeMs = (cfTimeSec * 1000) + latency;
        timeOffsetMs = cfTimeMs - Date.now();
        hasSyncedTime = true;
        console.log(`[ClientScraper] Synchronized clock offset with Cloudflare: ${timeOffsetMs}ms`);
      }
    }
  } catch (e) {
    console.warn('[ClientScraper] Failed to sync time offset with Cloudflare:', e);
  }
}

// Trigger initial sync on module load
syncClockOffset().catch(() => {});

export function encryptToken(mediaId: string): string {
  if (!hasSyncedTime) {
    syncClockOffset().catch(() => {});
  }
  const timestamp = Math.floor((Date.now() + timeOffsetMs) / 1000) + 480;
  
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

  if (Capacitor.isNativePlatform()) {
    try {
      const { fetchWithCapacitor } = await import('../../utils/nativeFetch');
      let capRes = await fetchWithCapacitor(url, 'text', options.headers as Record<string, string>);
      let text = await capRes.text();
      
      if (!capRes.ok) {
        console.warn(`[ClientScraper] Native direct fetch failed. Retrying via Cloud proxy...`);
        const cloudProxy = 'https://cinemovie-proxy.abderrahmanchakkouri.workers.dev';
        const referer = (options.headers as any)?.['Referer'] || (options.headers as any)?.['referer'] || 'https://vidlink.pro/';
        const origin = (options.headers as any)?.['Origin'] || (options.headers as any)?.['origin'] || 'https://vidlink.pro';
        const fallbackUrl = `${cloudProxy}/local-proxy?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer)}&origin=${encodeURIComponent(origin)}`;
        
        capRes = await fetchWithCapacitor(fallbackUrl, 'text');
        text = await capRes.text();
      }
      
      clearTimeout(id);
      if (!capRes.ok) {
        throw new Error(`Gateway responded HTTP ${(capRes as any).status || 500}: ${text || 'empty'}`);
      }
      return JSON.parse(text);
    } catch (e: any) {
      clearTimeout(id);
      throw e;
    }
  }

  let fetchUrl = url;
  const isWeb = true; // Web fallback
  const localServer = getLocalServerUrl() || 'http://localhost:3001';
  const referer = (options.headers as any)?.['Referer'] || (options.headers as any)?.['referer'] || 'https://vidlink.pro/';
  const origin = (options.headers as any)?.['Origin'] || (options.headers as any)?.['origin'] || 'https://vidlink.pro';
  fetchUrl = `${localServer}/local-proxy?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer)}&origin=${encodeURIComponent(origin)}`;

  try {
    let res;
    try {
      res = await fetch(fetchUrl, { ...options, signal: controller.signal });
    } catch (fetchErr) {
      if (fetchUrl.includes('localhost')) {
        console.warn(`[ClientScraper] Local proxy failed, falling back to Cloud proxy...`);
        const cloudProxy = 'https://cinemovie-proxy.abderrahmanchakkouri.workers.dev';
        const referer = (options.headers as any)?.['Referer'] || (options.headers as any)?.['referer'] || 'https://vidlink.pro/';
        const origin = (options.headers as any)?.['Origin'] || (options.headers as any)?.['origin'] || 'https://vidlink.pro';
        const fallbackUrl = `${cloudProxy}/local-proxy?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer)}&origin=${encodeURIComponent(origin)}`;
        res = await fetch(fallbackUrl, { ...options, signal: controller.signal });
      } else {
        throw fetchErr;
      }
    }

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
    const delimiter = originalPlaylist.includes('?') ? '&' : '?';
    const markedUrl = `${originalPlaylist}${delimiter}origin_referer=${encodeURIComponent('https://vidlink.pro/')}`;
    sources.push({
      url: markedUrl,
      quality: 'auto',
      isM3U8: data.stream.type === 'hls' || originalPlaylist.includes('.m3u8')
    });
  } else if (data.stream.qualities) {
    Object.entries(data.stream.qualities).forEach(([quality, qObj]: [string, any]) => {
      if (qObj && qObj.url) {
        const delimiter = qObj.url.includes('?') ? '&' : '?';
        const markedUrl = `${qObj.url}${delimiter}origin_referer=${encodeURIComponent('https://vidlink.pro/')}`;
        sources.push({
          url: markedUrl,
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
    if (subUrl) {
      const delimiter = subUrl.includes('?') ? '&' : '?';
      subUrl = `${subUrl}${delimiter}origin_referer=${encodeURIComponent('https://vidlink.pro/')}`;
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
  try {
    await syncClockOffset();
  } catch (_) {}
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
  const param = tmdbId.startsWith("tt") ? "imdb" : "tmdb";
  let url = `https://streamdata.vaplayer.ru/api.php?${param}=${tmdbId}&type=${type}`;
  if (type === 'tv') {
    url += `&season=${season}&episode=${episode}`;
  }

  const localServer = getLocalServerUrl() || 'http://localhost:3001';
  const endpoints = [
    `${localServer}/meta/tmdb/watch/${tmdbId}?type=${type}&server=vidsrc-pm${type === 'tv' ? `&s=${season}&e=${episode}` : ''}`,
    `https://cinemovie-proxy.abderrahmanchakkouri.workers.dev/meta/tmdb/watch/${tmdbId}?type=${type}&server=vidsrc-pm${type === 'tv' ? `&s=${season}&e=${episode}` : ''}`
  ];

  for (const ep of endpoints) {
    try {
      console.log(`[Client VidSrc PM] Trying resolver: ${ep}`);
      const res = await fetch(ep);
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {}
  }

  console.log(`[Client VidSrc PM Fallback] Scraping directly: ${url}`);
  try {
    let resText = '';
    if (Capacitor.isNativePlatform()) {
      const nativeFetch = await import('../../utils/nativeFetch');
      const res = await nativeFetch.fetchWithCapacitor(url, 'text');
      if (!res.ok) throw new Error('vidsrc.pm direct API failed');
      resText = await res.text();
    } else {
      let proxiedUrl = `${localServer}/local-proxy?url=${encodeURIComponent(url)}&referer=${encodeURIComponent('https://brightpathsignals.com/')}&origin=${encodeURIComponent('https://brightpathsignals.com')}`;
      let res;
      try {
        res = await fetch(proxiedUrl);
      } catch (e) {
        proxiedUrl = `https://cinemovie-proxy.abderrahmanchakkouri.workers.dev/local-proxy?url=${encodeURIComponent(url)}&referer=${encodeURIComponent('https://brightpathsignals.com/')}&origin=${encodeURIComponent('https://brightpathsignals.com')}`;
        res = await fetch(proxiedUrl);
      }
      if (!res.ok) throw new Error('vidsrc.pm direct API failed');
      resText = await res.text();
    }

    const data = typeof resText === 'string' ? JSON.parse(resText) : resText;
    if (data.status_code == 200 || data.status_code == "200") {
      const streamData = data.data || {};
      const streamUrls = streamData.stream_urls || [];
      const sources = streamUrls.map((stream: string, idx: number) => {
        const delimiter = stream.includes('?') ? '&' : '?';
        const markedUrl = `${stream}${delimiter}origin_referer=${encodeURIComponent('https://brightpathsignals.com/')}`;
        return {
          url: markedUrl,
          quality: idx === 0 ? 'auto' : `backup ${idx}`,
          isM3U8: true
        };
      });
      const subs = (data.default_subs || streamData.default_subs || []).map((sub: any) => {
        const fileUrl = sub.url || sub.file;
        const delimiter = fileUrl.includes('?') ? '&' : '?';
        const markedUrl = `${fileUrl}${delimiter}origin_referer=${encodeURIComponent('https://brightpathsignals.com/')}`;
        return {
          url: markedUrl,
          lang: sub.lang || sub.label || 'English'
        };
      });
      return { sources, subtitles: subs };
    }
    throw new Error("No stream data found in vaplayer response");
  } catch (e: any) {
    console.error(`[Client VidSrc PM Fallback] Failed:`, e.message);
    throw e;
  }
}

// Mock webpack require 'n' for client-side evaluation
function mockRequire(modId: number) {
  if (modId === 6434) {
    return { Buffer: Uint8Array };
  }
  return {};
}
(mockRequire as any).d = (exports: any, definition: any) => {
  for (const key in definition) {
    if (Object.prototype.hasOwnProperty.call(definition, key) && !Object.prototype.hasOwnProperty.call(exports, key)) {
      Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
    }
  }
};

export async function scrapeWtfStream(
  tmdbId: string,
  apiType: 'wtf-1' | 'wtf-2' | 'wtf-3' | 'wtf-4',
  serverName: string | null = null,
  isTv = false,
  season = 1,
  episode = 1,
  domain = 'vidsrc.wtf'
): Promise<any> {
  const chunkRes = await fetch('./wtf_chunk_46_decrypted.js');
  if (!chunkRes.ok) throw new Error("Decryption chunk asset could not be loaded");
  const chunkCode = await chunkRes.text();

  const wasmRes = await fetch('./makima.wasm');
  if (!wasmRes.ok) throw new Error("Decryption WASM asset could not be loaded");
  const wasmBuffer = await wasmRes.arrayBuffer();

  // Extract top-level decryption functions
  const webpackIdx = chunkCode.indexOf(',(self.webpackChunk_N_E');
  if (webpackIdx !== -1) {
    const decFuncs = chunkCode.substring(0, webpackIdx);
    (window as any).eval(decFuncs + '; window._0x53ab = _0x53ab; window._0x471f = _0x471f;');
  }

  // Extract module 46 function body
  const startStr = '46:function(e,t,n){';
  const startIdx = chunkCode.indexOf(startStr);
  if (startIdx === -1) {
    throw new Error("Could not find module 46 function in decrypted chunk");
  }

  let braceCount = 1;
  let endIdx = startIdx + startStr.length;
  while (braceCount > 0 && endIdx < chunkCode.length) {
    if (chunkCode[endIdx] === '{') braceCount++;
    else if (chunkCode[endIdx] === '}') braceCount--;
    endIdx++;
  }

  // Inject domain override directly into the decrypted chunk function scope by rewriting the hardcoded D and z variables
  let functionBody = 'const _0x53ab = window._0x53ab;\n' + chunkCode.substring(startIdx + startStr.length, endIdx - 1);
  if (domain !== 'vidsrc.wtf') {
    // Override local variables z (api base) and D (multilang api base) in the decrypted function body
    functionBody = functionBody
      .replace('z=r.yxHOd', `z="https://api.${domain}"`)
      .replace('D="https://mu"+"ltilang-ap"+"i.vidsrc.w"+"tf"', `D="https://multilang-api.${domain}"`);
  }
  const moduleFunc = new Function('e', 't', 'n', functionBody);

  const mockExports = {} as any;
  (window as any).__pn = null;

  moduleFunc(mockExports, mockExports, mockRequire);

  let refererUrl = `https://${domain}/`;
  if (apiType === 'wtf-2') {
    refererUrl = isTv 
      ? `https://${domain}/2/tv/${tmdbId}/${season}/${episode}`
      : `https://${domain}/2/movie/${tmdbId}`;
  } else if (apiType === 'wtf-4') {
    refererUrl = isTv
      ? `https://${domain}/4/tv/${tmdbId}/${season}/${episode}`
      : `https://${domain}/4/movie/${tmdbId}`;
  } else {
    refererUrl = isTv
      ? `https://${domain}/1/tv/${tmdbId}/${season}/${episode}`
      : `https://${domain}/1/movie/${tmdbId}`;
  }

  const originalFetch = window.fetch;

  window.fetch = async (url: string, options: any = {}) => {
    let targetUrl = url;
    if (domain !== 'vidsrc.wtf') {
      targetUrl = url.replace('vidsrc.wtf', domain);
    }
    
    if (targetUrl.includes('/altcha-challenge') || targetUrl.includes('/bootstrap') || (!targetUrl.includes('.wasm') && !targetUrl.includes('/makima-manifest.json'))) {
      const nativeFetch = await import('../../utils/nativeFetch');
      const delimiter = targetUrl.includes('?') ? '&' : '?';
      const decoratedUrl = `${targetUrl}${delimiter}origin_referer=${encodeURIComponent(refererUrl)}`;
      const res = await nativeFetch.fetchWithCapacitor(decoratedUrl, 'text', options?.headers);
      const text = await res.text();
      
      return {
        ok: res.ok,
        status: res.ok ? 200 : 500,
        text: async () => text,
        json: async () => JSON.parse(text)
      } as any;
    }

    if (targetUrl.includes('.wasm')) {
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => wasmBuffer
      } as any;
    }

    if (targetUrl.includes('/makima-manifest.json')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          url: "makima.wasm",
          exports: {
            alloc: "_BpDg",
            reset: "_YrcY",
            writeByte: "_xeBp",
            readByte: "_e6Un",
            decryptPepper: "_0S1G",
            decryptEnvelope: "_7F6j",
            dropPepper: "_DKz4"
          }
        })
      } as any;
    }

    return originalFetch(targetUrl, options);
  };

  try {
    logToNative(`[WTF Resolver] Initializing scraper for TMDB: ${tmdbId} (${isTv ? `TV S${season}E${episode}` : 'Movie'}) using domain: ${domain}`);
    
    let activeServer = serverName;
    if (!activeServer && (apiType === 'wtf-1' || apiType === 'wtf-3')) {
      try {
        const serversRes = await mockExports.Ot();
        if (serversRes && serversRes.ok && serversRes.data && serversRes.data.length > 0) {
          activeServer = serversRes.data[0].name;
          logToNative(`[WTF Resolver] Found active sub-servers: ${JSON.stringify(serversRes.data.map((s: any) => s.name))}. Selecting first: ${activeServer}`);
        }
      } catch (e: any) {
        logToNative(`[WTF Resolver] Failed to fetch servers list: ${e.message}. Falling back to default Leon.`);
      }
      if (!activeServer) activeServer = 'Leon';
    }

    let decrypted: any;
    if (apiType === 'wtf-2') {
      decrypted = isTv 
        ? await mockExports.ju(tmdbId, season, episode)
        : await mockExports.Cm(tmdbId);
    } else if (apiType === 'wtf-4') {
      decrypted = isTv
        ? await mockExports.sk(tmdbId, season, episode)
        : await mockExports.$q(tmdbId);
    } else {
      decrypted = isTv
        ? await mockExports.Nw(tmdbId, season, episode, activeServer)
        : await mockExports.dE(tmdbId, activeServer);
    }

    if (decrypted && decrypted.ok) {
      logToNative(`[WTF Resolver] Successfully decrypted streams!`);
    } else {
      logToNative(`[WTF Resolver] Decryption failed or returned empty: ${JSON.stringify(decrypted)}`);
    }

    return decrypted;
  } catch (err: any) {
    logToNative(`[WTF Resolver] Fatal error during decryption: ${err.message}`);
    throw err;
  } finally {
    window.fetch = originalFetch;
  }
}

// ============================================
// Vidzee Stream Resolver
// ============================================

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64.replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function decryptApiKeyWebCrypto(encryptedBase64: string, keyStr: string): Promise<string> {
  const binaryStr = base64ToBytes(encryptedBase64);
  if (binaryStr.length <= 28) throw new Error("Invalid cipher length");
  
  const iv = binaryStr.subarray(0, 12);
  const tag = binaryStr.subarray(12, 28);
  const ciphertext = binaryStr.subarray(28);

  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext, 0);
  combined.set(tag, ciphertext.length);

  const keyHash = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(keyStr));
  
  const cryptoKey = await window.crypto.subtle.importKey(
    "raw",
    keyHash,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  const decrypted = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv, tagLength: 128 },
    cryptoKey,
    combined
  );

  return new TextDecoder().decode(decrypted);
}

async function decryptStreamUrlWebCrypto(encryptedLink: string, keyStr: string): Promise<string> {
  const decoded = atob(encryptedLink);
  const parts = decoded.split(':');
  if (parts.length !== 2) throw new Error("Invalid stream link format");

  const iv = base64ToBytes(parts[0]);
  const ciphertext = base64ToBytes(parts[1]);

  const paddedKey = new Uint8Array(32);
  const keyBytes = new TextEncoder().encode(keyStr);
  paddedKey.set(keyBytes.subarray(0, 32));

  const cryptoKey = await window.crypto.subtle.importKey(
    "raw",
    paddedKey,
    { name: "AES-CBC" },
    false,
    ["decrypt"]
  );

  const decrypted = await window.crypto.subtle.decrypt(
    { name: "AES-CBC", iv: iv },
    cryptoKey,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

async function fetchTextRaw(url: string): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    const { fetchWithCapacitor } = await import('../../utils/nativeFetch');
    const capRes = await fetchWithCapacitor(url, 'text');
    if (!capRes.ok) throw new Error(`Failed to fetch text from ${url}`);
    return await capRes.text();
  } else {
    const localServer = getLocalServerUrl() || 'http://localhost:3001';
    const proxiedUrl = `${localServer}/local-proxy?url=${encodeURIComponent(url)}`;
    let res;
    try {
      res = await fetch(proxiedUrl);
    } catch (e) {
      const cloudProxy = 'https://cinemovie-proxy.abderrahmanchakkouri.workers.dev';
      const fallbackUrl = `${cloudProxy}/local-proxy?url=${encodeURIComponent(url)}`;
      res = await fetch(fallbackUrl);
    }
    if (!res.ok) throw new Error(`Failed to fetch text from ${url}`);
    return await res.text();
  }
}

export async function scrapeVidzeeStream(
  tmdbId: string,
  type: 'movie' | 'tv',
  season = 1,
  episode = 1
): Promise<any> {
  try {
    console.log(`[Client Vidzee] Fetching encrypted API key...`);
    const encryptedKey = await fetchTextRaw('https://core.vidzee.wtf/api-key');
    const HARDCODED_KEY_HEX = "c4a8f1d7e2b9a6c3d0f5e8a1b7c4d9e2";
    const decryptedKey = await decryptApiKeyWebCrypto(encryptedKey, HARDCODED_KEY_HEX);
    console.log(`[Client Vidzee] Decrypted API key: ${decryptedKey}`);

    const referer = `https://player.vidzee.wtf/embed/${type}/${tmdbId}`;
    const sources: any[] = [];
    const errors: string[] = [];

    // Query Tcloud (0), IpCloud (1), Achilles (2), Nflix (3), Drag (4)
    const serversToTest = [0, 1, 3, 4];
    const promises = serversToTest.map(async (sr) => {
      let url = `https://player.vidzee.wtf/api/server?id=${tmdbId}&sr=${sr}`;
      if (type === 'tv') {
        url += `&ss=${season}&ep=${episode}`;
      }
      try {
        const res = await fetchWithTimeout(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Referer': referer,
            'Accept': 'application/json'
          }
        }, 5000);
        
        if (res && res.url && res.url.length > 0) {
          for (const item of res.url) {
            try {
              const decryptedStream = await decryptStreamUrlWebCrypto(item.link, decryptedKey);
              if (decryptedStream) {
                sources.push({
                  url: decryptedStream,
                  quality: item.name || `Server ${sr}`,
                  isM3U8: decryptedStream.includes('.m3u8')
                });
              }
            } catch (decErr: any) {
              console.warn(`[Client Vidzee] Link decryption failed for server ${sr}:`, decErr.message);
            }
          }
        }
      } catch (err: any) {
        errors.push(`Server ${sr} fetch failed: ${err.message}`);
      }
    });

    await Promise.allSettled(promises);

    if (sources.length === 0) {
      throw new Error(`No streams resolved. Errors:\n${errors.join('\n')}`);
    }

    console.log(`[Client Vidzee] Successfully resolved ${sources.length} sources`);
    return {
      sources,
      subtitles: []
    };
  } catch (e: any) {
    console.error(`[Client Vidzee] Scraper failed:`, e.message);
    throw e;
  }
}



