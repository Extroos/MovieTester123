import { Capacitor } from '@capacitor/core';
import { getLocalServerUrl } from '../LocalStreamService';
import { fetchWithTimeout } from './BaseScraper';

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
    { name: "AES-GCM", iv: iv as any, tagLength: 128 },
    cryptoKey,
    combined as any
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
    { name: "AES-CBC", iv: iv as any },
    cryptoKey,
    ciphertext as any
  );

  return new TextDecoder().decode(decrypted);
}

async function fetchTextRaw(url: string): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    const { fetchWithCapacitor } = await import('../../../utils/nativeFetch');
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
  let coreBase = 'https://core.vidzee.wtf';
  let playerBase = 'https://player.vidzee.wtf';
  try {
    const { getGateway } = await import('../RemoteConfigService');
    const remoteCore = await getGateway('vidzee_core');
    const remotePlayer = await getGateway('vidzee');
    if (remoteCore) coreBase = remoteCore;
    if (remotePlayer) playerBase = remotePlayer;
  } catch (e) {
    console.warn('[VidzeeScraper] Failed to fetch dynamic gateways, using fallback:', e);
  }

  try {
    console.log(`[Client Vidzee] Fetching encrypted API key...`);
    const encryptedKey = await fetchTextRaw(`${coreBase}/api-key`);
    const HARDCODED_KEY_HEX = "c4a8f1d7e2b9a6c3d0f5e8a1b7c4d9e2";
    const decryptedKey = await decryptApiKeyWebCrypto(encryptedKey, HARDCODED_KEY_HEX);
    console.log(`[Client Vidzee] Decrypted API key: ${decryptedKey}`);

    const referer = type === 'tv'
      ? `${playerBase}/embed/tv/${tmdbId}/${season}/${episode}`
      : `${playerBase}/embed/movie/${tmdbId}`;
    const sources: any[] = [];
    const errors: string[] = [];

    // Servers 0 (Tcloud), 1 (IpCloud), 2 (Achilles) are dead.
    // Working servers as of 2026-07: 3=Nflix (EN), 4=Drag (EN), 5=Viet (VI), 7=Hindi_v2 (HI)
    const serversToTest = [3, 4, 5, 7];
    const promises = serversToTest.map(async (sr) => {
      let url = `${playerBase}/api/server?id=${tmdbId}&sr=${sr}`;
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
                // Build a clean quality label: provider + language
                const langLabel = item.lang ? ` [${item.lang}]` : '';
                const providerLabel = res.provider || item.name || `Server ${sr}`;
                sources.push({
                  url: decryptedStream,
                  quality: `${providerLabel}${langLabel}`,
                  isM3U8: decryptedStream.includes('.m3u8') || decryptedStream.includes('.txt'),
                  language: item.lang || 'Unknown',
                  provider: providerLabel
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
