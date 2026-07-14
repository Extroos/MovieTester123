import nacl from 'tweetnacl';
import { Capacitor } from '@capacitor/core';
import { getLocalServerUrl } from '../LocalStreamService';

const KEY_HEX = "c75136c5668bbfe65a7ecad431a745db68b5f381555b38d8f6c699449cf11fcd";

export function hexToUint8Array(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return arr;
}

export const KEY = hexToUint8Array(KEY_HEX);
export const NONCE = new Uint8Array(24);

export let timeOffsetMs = 0;
export let hasSyncedTime = false;

export async function syncClockOffset() {
  if (hasSyncedTime) return;
  try {
    const start = Date.now();
    let text = '';
    
    if (Capacitor.isNativePlatform()) {
      const { fetchWithCapacitor } = await import('../../../utils/nativeFetch');
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

export const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  'Origin': 'https://vidsrc.me',
  'Referer': 'https://vidsrc.me/'
};

export async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 8000): Promise<any> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  const host = new URL(url).host;

  if (Capacitor.isNativePlatform()) {
    try {
      const { fetchWithCapacitor } = await import('../../../utils/nativeFetch');
      let capRes = await fetchWithCapacitor(url, 'text', options.headers as Record<string, string>);
      let text = await capRes.text();
      
      if (!capRes.ok) {
        console.warn(`[ClientScraper] Native direct fetch failed. Retrying via Cloud proxy...`);
        const cloudProxy = 'https://cinemovie-proxy.abderrahmanchakkouri.workers.dev';
        const referer = (options.headers as any)?.['Referer'] || (options.headers as any)?.['referer'] || 'https://vidsrc.me/';
        const origin = (options.headers as any)?.['Origin'] || (options.headers as any)?.['origin'] || 'https://vidsrc.me';
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
  const localServer = getLocalServerUrl() || 'http://localhost:3001';
  const referer = (options.headers as any)?.['Referer'] || (options.headers as any)?.['referer'] || 'https://vidsrc.me/';
  const origin = (options.headers as any)?.['Origin'] || (options.headers as any)?.['origin'] || 'https://vidsrc.me';
  fetchUrl = `${localServer}/local-proxy?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer)}&origin=${encodeURIComponent(origin)}`;

  try {
    let res;
    try {
      res = await fetch(fetchUrl, { ...options, signal: controller.signal });
    } catch (fetchErr) {
      if (fetchUrl.includes('localhost')) {
        console.warn(`[ClientScraper] Local proxy failed, falling back to Cloud proxy...`);
        const cloudProxy = 'https://cinemovie-proxy.abderrahmanchakkouri.workers.dev';
        const referer = (options.headers as any)?.['Referer'] || (options.headers as any)?.['referer'] || 'https://vidsrc.me/';
        const origin = (options.headers as any)?.['Origin'] || (options.headers as any)?.['origin'] || 'https://vidsrc.me';
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
