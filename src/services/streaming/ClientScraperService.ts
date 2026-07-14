import nacl from 'tweetnacl';
import { Capacitor } from '@capacitor/core';
import { getLocalServerUrl } from './LocalStreamService';
import { logToNative } from '../../utils/nativeFetch';
import { getGateway, getGatewayList } from './RemoteConfigService';

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

    const referer = type === 'tv'
      ? `https://player.vidzee.wtf/embed/tv/${tmdbId}/${season}/${episode}`
      : `https://player.vidzee.wtf/embed/movie/${tmdbId}`;
    const sources: any[] = [];
    const errors: string[] = [];

    // Query Tcloud (0), IpCloud (1), Achilles (2), Nflix (3), Drag (4)
    const serversToTest = [3, 4, 5, 7];
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
        }, 8000);
        
        if (res && res.url && res.url.length > 0) {
          for (const item of res.url) {
            try {
              const decryptedStream = await decryptStreamUrlWebCrypto(item.link, decryptedKey);
              if (decryptedStream && decryptedStream.startsWith('http')) {
                const langLabel = item.lang ? ` [${item.lang}]` : '';
                const providerLabel = res.provider || item.name || `Server ${sr}`;
                sources.push({
                  url: decryptedStream,
                  quality: `${providerLabel}${langLabel}`,
                  isM3U8: decryptedStream.includes('.m3u8') || decryptedStream.includes('.txt')
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

export async function scrapeVidlinkStream(
  tmdbId: string,
  type: 'movie' | 'tv',
  season = 1,
  episode = 1
): Promise<any> {
  const primaryEncDec = await getGateway('enc_dec') || 'https://enc-dec.app';
  const primaryVidlink = await getGateway('vidlink') || 'https://vidlink.pro';
  
  const encDecMirrors = await getGatewayList('enc_dec_mirrors');
  const encDecHosts = [primaryEncDec, ...encDecMirrors].filter(Boolean);

  const vidlinkMirrors = await getGatewayList('vidlink_mirrors');
  const vidlinkHosts = [primaryVidlink, ...vidlinkMirrors].filter(Boolean);

  let encodedTmdb = '';
  let lastEncError = '';

  // 1. Try resolving encryption on available enc_dec hosts
  for (const encDecBase of encDecHosts) {
    try {
      console.log(`[Client VidLink] Trying encryption via host: ${encDecBase}`);
      const encUrl = `${encDecBase}/api/enc-vidlink?text=${encodeURIComponent(String(tmdbId))}`;
      let encRes;
      if (Capacitor.isNativePlatform()) {
        const { fetchWithCapacitor } = await import('../../utils/nativeFetch');
        const capRes = await fetchWithCapacitor(encUrl, 'text');
        encRes = JSON.parse(await capRes.text());
      } else {
        const localServer = getLocalServerUrl() || 'http://localhost:3001';
        const proxied = `${localServer}/local-proxy?url=${encodeURIComponent(encUrl)}`;
        const res = await fetch(proxied);
        encRes = await res.json();
      }
      encodedTmdb = encRes && encRes.result;
      if (encodedTmdb) break;
    } catch (e: any) {
      lastEncError = e.message;
    }
  }

  if (!encodedTmdb) {
    throw new Error(`VidLink Encryption failed on all mirror hosts. Last error: ${lastEncError}`);
  }

  // 2. Try fetching stream playlist on available vidlink hosts
  let apiRes = null;
  let lastFetchError = '';
  for (const vidlinkBase of vidlinkHosts) {
    try {
      const apiUrl = type === 'tv'
        ? `${vidlinkBase}/api/b/tv/${encodedTmdb}/${season}/${episode}?multiLang=0`
        : `${vidlinkBase}/api/b/movie/${encodedTmdb}?multiLang=0`;

      console.log(`[Client VidLink] Fetching stream API via host: ${vidlinkBase}`);
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Referer': vidlinkBase
      };

      if (Capacitor.isNativePlatform()) {
        const { fetchWithCapacitor } = await import('../../utils/nativeFetch');
        const capRes = await fetchWithCapacitor(apiUrl, 'text', headers);
        apiRes = JSON.parse(await capRes.text());
      } else {
        const localServer = getLocalServerUrl() || 'http://localhost:3001';
        const proxied = `${localServer}/local-proxy?url=${encodeURIComponent(apiUrl)}&referer=${encodeURIComponent(vidlinkBase)}`;
        const res = await fetch(proxied);
        apiRes = await res.json();
      }
      if (apiRes && apiRes.stream) break;
    } catch (e: any) {
      lastFetchError = e.message;
    }
  }

  if (!apiRes || !apiRes.stream) {
    throw new Error(`VidLink API retrieval failed on all mirror hosts. Last error: ${lastFetchError}`);
  }

  const sources: any[] = [];
  
  // 1. Primary HLS Playlist
  if (apiRes.stream && apiRes.stream.playlist && apiRes.stream.playlist.includes('.m3u8')) {
    sources.push({
      url: apiRes.stream.playlist,
      quality: 'auto',
      isM3U8: true
    });
  }

  // 2. Alternate HLS Playlists
  const alts = apiRes.alternates || apiRes.stream?.alternates;
  if (alts && alts.hls && alts.hls.playlist && alts.hls.playlist.includes('.m3u8')) {
    sources.push({
      url: alts.hls.playlist,
      quality: 'auto',
      isM3U8: true
    });
  }

  // 3. HLS Qualities (only if they contain .m3u8)
  if (apiRes.stream && apiRes.stream.qualities) {
    for (const [quality, fileObj] of Object.entries(apiRes.stream.qualities)) {
      const item: any = fileObj;
      if (item && item.url && item.url.includes('.m3u8')) {
        sources.push({
          url: item.url,
          quality: `${quality}p`,
          isM3U8: true
        });
      }
    }
  }

  const subtitles: any[] = [];
  if (apiRes.subtitles && Array.isArray(apiRes.subtitles)) {
    for (const sub of apiRes.subtitles) {
      if (sub.url) {
        subtitles.push({
          url: sub.url,
          lang: sub.language || 'Unknown'
        });
      }
    }
  }

  if (sources.length === 0) {
    throw new Error("No HLS (m3u8) streams found in VidLink response");
  }

  return { sources, subtitles };
}

export async function scrapeVixsrcStream(
  tmdbId: string,
  type: 'movie' | 'tv',
  season = 1,
  episode = 1
): Promise<any> {
  const primaryVixsrc = await getGateway('vixsrc') || 'https://vixsrc.to';
  const vixsrcMirrors = await getGatewayList('vixsrc_mirrors');
  const vixsrcHosts = [primaryVixsrc, ...vixsrcMirrors].filter(Boolean);

  let lastError = '';
  for (const vixsrcBase of vixsrcHosts) {
    try {
      const apiUrl = type === 'tv'
        ? `${vixsrcBase}/api/tv/${tmdbId}/${season}/${episode}`
        : `${vixsrcBase}/api/movie/${tmdbId}`;

      console.log(`[Client VixSrc] Fetching stream API token via host: ${vixsrcBase}`);
      let apiData;
      if (Capacitor.isNativePlatform()) {
        const { fetchWithCapacitor } = await import('../../utils/nativeFetch');
        const capRes = await fetchWithCapacitor(apiUrl, 'text', { 'Referer': `${vixsrcBase}/` });
        apiData = JSON.parse(await capRes.text());
      } else {
        const localServer = getLocalServerUrl() || 'http://localhost:3001';
        const proxied = `${localServer}/local-proxy?url=${encodeURIComponent(apiUrl)}&referer=${encodeURIComponent(`${vixsrcBase}/`)}`;
        const res = await fetch(proxied);
        apiData = await res.json();
      }

      if (!apiData || !apiData.src) {
        throw new Error("Failed to resolve dynamic VixSrc token");
      }

      const embedUrl = `${vixsrcBase}${apiData.src}`;
      console.log(`[Client VixSrc] Fetching embed player HTML...`);
      let html = '';
      if (Capacitor.isNativePlatform()) {
        const { fetchWithCapacitor } = await import('../../utils/nativeFetch');
        const capRes = await fetchWithCapacitor(embedUrl, 'text', { 'Referer': `${vixsrcBase}/` });
        html = await capRes.text();
      } else {
        const localServer = getLocalServerUrl() || 'http://localhost:3001';
        const proxied = `${localServer}/local-proxy?url=${encodeURIComponent(embedUrl)}&referer=${encodeURIComponent(`${vixsrcBase}/`)}`;
        const res = await fetch(proxied);
        html = await res.text();
      }

      const streamsMatch = html.match(/window\.streams\s*=\s*(\[[^\]]+\])/);
      const tokenMatch = html.match(/'token':\s*'([^']*)'/);
      const expiresMatch = html.match(/'expires':\s*'([^']*)'/);

      if (!streamsMatch || !tokenMatch || !expiresMatch) {
        throw new Error("Obfuscated window.streams parameters not found in player page");
      }

      const streams = JSON.parse(streamsMatch[1]);
      const token = tokenMatch[1];
      const expires = expiresMatch[1];

      const sources = streams.map((s: any) => {
        const l = new URL(s.url);
        l.searchParams.append("token", token);
        l.searchParams.append("expires", expires);
        l.searchParams.append("asn", "");
        l.searchParams.append("h", "1"); // FHD quality
        return {
          url: l.toString(),
          quality: s.name || 'Server',
          isM3U8: true
        };
      });

      return { sources, subtitles: [] };
    } catch (e: any) {
      lastError = e.message;
    }
  }

  throw new Error(`VixSrc resolution failed on all mirror hosts. Last error: ${lastError}`);
}

export async function scrape2EmbedStream(
  tmdbId: string,
  type: 'movie' | 'tv',
  season = 1,
  episode = 1
): Promise<any> {
  const wingsBase = 'https://api.wingsdatabase.com';
  const tmdbIdNum = parseInt(tmdbId);
  const isTv = type === 'tv';

  try {
    console.log(`[Client 2Embed/Videasy] Fetching seed for TMDB: ${tmdbId}`);
    const seedUrl = `${wingsBase}/seed?mediaId=${tmdbId}`;
    let seedData: any;
    if (Capacitor.isNativePlatform()) {
      const { fetchWithCapacitor } = await import('../../utils/nativeFetch');
      const capRes = await fetchWithCapacitor(seedUrl, 'text', {
        'Referer': 'https://player.videasy.to/',
        'Origin': 'https://player.videasy.to'
      });
      seedData = JSON.parse(await capRes.text());
    } else {
      const localServer = getLocalServerUrl() || 'http://localhost:3001';
      const proxied = `${localServer}/local-proxy?url=${encodeURIComponent(seedUrl)}&referer=${encodeURIComponent('https://player.videasy.to/')}&origin=${encodeURIComponent('https://player.videasy.to')}`;
      const res = await fetch(proxied);
      seedData = await res.json();
    }

    const seed = seedData.seed;
    if (!seed) throw new Error("Failed to retrieve seed from wingsdatabase");

    console.log(`[Client 2Embed/Videasy] Fetching sources-with-title using seed: ${seed}`);
    let movieTitle = 'Movie';
    let releaseYear = '2024';
    let imdbId = '';

    try {
      const tmdbApiKey = '8265bd1679663a7ea12ac168da84d2e8';
      const tmdbUrl = isTv
        ? `https://api.themoviedb.org/3/tv/${tmdbId}/external_ids?api_key=${tmdbApiKey}`
        : `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${tmdbApiKey}`;
      
      let resDetails;
      if (Capacitor.isNativePlatform()) {
        const { fetchWithCapacitor } = await import('../../utils/nativeFetch');
        const capRes = await fetchWithCapacitor(tmdbUrl, 'text');
        resDetails = JSON.parse(await capRes.text());
      } else {
        const localServer = getLocalServerUrl() || 'http://localhost:3001';
        const proxied = `${localServer}/local-proxy?url=${encodeURIComponent(tmdbUrl)}`;
        const res = await fetch(proxied);
        resDetails = await res.json();
      }
      
      if (resDetails) {
        imdbId = resDetails.imdb_id || '';
        movieTitle = resDetails.title || resDetails.name || movieTitle;
        const dateStr = resDetails.release_date || resDetails.first_air_date || '';
        if (dateStr) releaseYear = dateStr.split('-')[0];
      }

      // If TV show details don't have name/title, fetch the main tv info as fallback
      if (isTv && !imdbId) {
        const infoUrl = `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${tmdbApiKey}`;
        let mainDetails;
        if (Capacitor.isNativePlatform()) {
          const { fetchWithCapacitor } = await import('../../utils/nativeFetch');
          const capRes = await fetchWithCapacitor(infoUrl, 'text');
          mainDetails = JSON.parse(await capRes.text());
        } else {
          const localServer = getLocalServerUrl() || 'http://localhost:3001';
          const proxied = `${localServer}/local-proxy?url=${encodeURIComponent(infoUrl)}`;
          const res = await fetch(proxied);
          mainDetails = await res.json();
        }
        if (mainDetails) {
          movieTitle = mainDetails.name || movieTitle;
          const dateStr = mainDetails.first_air_date || '';
          if (dateStr) releaseYear = dateStr.split('-')[0];
        }
      }
    } catch (e: any) {
      console.warn("[Client 2Embed] Failed to fetch TMDB details:", e.message);
    }

    const mirrorEndpoints = [
      '/neon2/sources-with-title',
      '/cdn/sources-with-title',
      '/ym/sources-with-title',
      '/jett/sources-with-title',
      '/m4uhd/sources-with-title',
      '/hdmovie/sources-with-title'
    ];

    let resultObj: any = null;
    let lastError: any = null;

    for (const endpoint of mirrorEndpoints) {
      try {
        console.log(`[Client 2Embed] Trying mirror endpoint: ${endpoint}`);
        const query = `?title=${encodeURIComponent(movieTitle)}&mediaType=${isTv ? 'TV Series' : 'Movie'}&year=${releaseYear}&tmdbId=${tmdbId}&imdbId=${imdbId}&enc=2&seed=${seed}${isTv ? `&seasonId=${season}&episodeId=${episode}` : ''}`;
        const sourcesUrl = `${wingsBase}${endpoint}${query}`;

        let encryptedText = '';
        if (Capacitor.isNativePlatform()) {
          const { fetchWithCapacitor } = await import('../../utils/nativeFetch');
          const capRes = await fetchWithCapacitor(sourcesUrl, 'text', {
            'Referer': 'https://player.videasy.to/',
            'Origin': 'https://player.videasy.to'
          });
          encryptedText = await capRes.text();
        } else {
          const localServer = getLocalServerUrl() || 'http://localhost:3001';
          const proxied = `${localServer}/local-proxy?url=${encodeURIComponent(sourcesUrl)}&referer=${encodeURIComponent('https://player.videasy.to/')}&origin=${encodeURIComponent('https://player.videasy.to')}`;
          const res = await fetch(proxied);
          encryptedText = await res.text();
        }

        if (!encryptedText || encryptedText.includes("Attention Required") || encryptedText.includes("502 Bad Gateway") || encryptedText.includes("503 Service Unavailable") || encryptedText.includes("Cloudflare")) {
          throw new Error("Cloudflare block or bad gateway");
        }

        // XOR Decryption Algorithm
        const f = [1116352408, 1899447441, 3049323471, 3921009573, 961987163, 1508970993, 2453635748, 2870763221, 3624381080, 310598401, 607225278, 1426881987, 1925078388, 2162078206, 2614888103, 3248222580];
        const b = [109, 118, 109, 49]; // "mvm1"
        const h = (e: number) => (e * (e + 1) & 1) === 0;
        const I = (e: number) => (e * (e + 1) & 1) === 1;

        const w = (e: number) => {
          e >>>= 0;
          e ^= e >>> 16;
          e = Math.imul(e, 2246822507) >>> 0;
          e ^= e >>> 13;
          e = Math.imul(e, 3266489909) >>> 0;
          return (e ^= e >>> 16) >>> 0;
        };

        const v = (e: number, t: number) => {
          e >>>= 0;
          t &= 31;
          return t === 0 ? e >>> 0 : (e << t | e >>> 32 - t) >>> 0;
        };

        const o = (() => {
          const pad = encryptedText.replace(/-/g, "+").replace(/_/g, "/").padEnd(4 * Math.ceil(encryptedText.length / 4), "=");
          const binary = atob(pad);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          return bytes;
        })();

        const getSAndAcc = (e: string, t: number) => {
          if (I(e.length)) {
            const S = (() => {
              const t = Array(256);
              for (let e = 0; e < 256; e++) t[e] = e;
              let s = 0;
              for (let a = 0; a < 256; a++) {
                s = (s + t[a] + e.charCodeAt(a % e.length)) & 255;
                const o = t[a];
                t[a] = t[s];
                t[s] = o;
              }
              return t;
            })();
            const acc = (() => {
              let t = 1732584193;
              for (let s = 0; s < e.length; s++) t = v((t ^ Math.imul(e.charCodeAt(s), f[15 & s])) >>> 0, 5);
              return (w(t) ^ 0) >>> 0;
            })();
            return { S, acc };
          }

          const s = Array(61);
          let a = w((() => {
            let t = 2166136261;
            for (let s = 0; s < e.length; s++) t = Math.imul(t ^ e.charCodeAt(s), 16777619) >>> 0;
            return w(t);
          })() ^ w(t >>> 0 ^ 2654435769)) >>> 0;

          for (let e = 0; e < 8; e++) {
            if (h(e)) {
              const t = a % 61;
              a = v((a + 2654435769) >>> 0, 7 + (7 & e));
              s[t] = (a ^ w(a)) >>> 0;
              a = w((a + t) >>> 0);
            } else {
              s[e] = f[15 & e];
            }
          }
          return {
            S: s,
            acc: w(2779096485 ^ a) >>> 0
          };
        };

        const r = (() => {
          const a = getSAndAcc(seed, tmdbIdNum);
          const prng = new Uint8Array(o.length);
          let idx = 0;
          for (let e = 0; e < o.length; ) {
            const t = ((eStore: any, tVal: number) => {
              let sVal, aVal, lVal;
              const oArr = eStore.S;
              let rVal = eStore.acc;
              const nVal = rVal % 61;
              const iVal = 0 - Number(nVal in oArr);
              const dVal = oArr[nVal] >>> 0;
              lVal = (((sVal = rVal) ^ (aVal = (dVal ^ Math.imul(2654435769, tVal + 1) >>> 0) >>> 0)) >>> 0 | (sVal & aVal & iVal) >>> 0) >>> 0;
              rVal = w((lVal = (v((lVal + rVal) >>> 0, 31 & nVal) ^ v(rVal, 31 & Math.imul(nVal, 7))) >>> 0) + 2654435769 >>> 0);
              oArr[nVal] = rVal >>> 0;
              eStore.acc = rVal;
              return rVal >>> 0;
            })(a, idx++);
            prng[e++] = 255 & t;
            e < o.length && (prng[e++] = (t >>> 8) & 255);
            e < o.length && (prng[e++] = (t >>> 16) & 255);
            e < o.length && (prng[e++] = (t >>> 24) & 255);
          }
          return prng;
        })();

        for (let e = 0; e < o.length; e++) o[e] ^= r[e];
        for (let e = 0; e < b.length; e++) {
          if (o[e] !== b[e]) throw Error("decrypt failed: bad seed or tampered payload");
        }

        const payload = o.subarray(b.length);
        const decryptedJson = new TextDecoder("utf-8").decode(payload);
        resultObj = JSON.parse(decryptedJson);
        console.log(`[Client 2Embed] Mirror ${endpoint} resolved successfully!`);
        break;
      } catch (err: any) {
        console.warn(`[Client 2Embed] Mirror ${endpoint} failed:`, err.message);
        lastError = err;
      }
    }

    if (!resultObj) {
      throw lastError || new Error("All 2Embed mirrors failed to resolve");
    }

    const sources = (resultObj.sources || []).map((s: any) => ({
      url: s.url,
      quality: s.name || s.quality || 'Server',
      isM3U8: s.url.includes('.m3u8') || s.type === 'm3u8'
    }));

    const subtitles = (resultObj.subtitles || []).map((sub: any) => ({
      url: sub.url,
      lang: sub.label || sub.lang || 'English'
    }));

    return { sources, subtitles };
  } catch (e: any) {
    console.error(`[Client 2Embed/Videasy] Decryption failed:`, e.message);
    throw new Error(`2Embed/Videasy resolution failed: ${e.message}`);
  }
}



