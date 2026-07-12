import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { NativeStreamingEngine } from '../services/native/NativeStreamingEngine';

export function getHeadersForUrl(url: string): Record<string, string> {
  const ua = 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

  if (url.includes('origin_referer=')) {
    try {
      const urlObj = new URL(url);
      const ref = urlObj.searchParams.get('origin_referer');
      if (ref) {
        let origin = ref.replace(/\/$/, '');
        try {
          origin = new URL(ref).origin;
        } catch (_) {}
        return {
          'User-Agent': ua,
          'Referer': ref,
          'Origin': origin,
          'Accept': '*/*',
        };
      }
    } catch (e) {
      const match = url.match(/[?&]origin_referer=([^&]+)/);
      if (match) {
        const ref = decodeURIComponent(match[1]);
        let origin = ref.replace(/\/$/, '');
        try {
          origin = new URL(ref).origin;
        } catch (_) {}
        return {
          'User-Agent': ua,
          'Referer': ref,
          'Origin': origin,
          'Accept': '*/*',
        };
      }
    }
  }

  if (
    url.includes('cloudnestra') ||
    url.includes('yonderunyielding') ||
    url.includes('unctuousundertow')
  ) {
    return {
      'User-Agent': ua,
      'Referer': 'https://cloudnestra.com/',
      'Origin': 'https://cloudnestra.com',
      'Accept': '*/*',
    };
  }
  if (url.includes('vidsrc.wtf')) {
    return {
      'User-Agent': ua,
      'Referer': 'https://vidsrc.wtf/',
      'Origin': 'https://vidsrc.wtf',
      'Accept': '*/*',
    };
  }
  if (url.includes('vidsrc.sbs')) {
    return {
      'User-Agent': ua,
      'Referer': 'https://vidsrc.sbs/',
      'Origin': 'https://vidsrc.sbs',
      'Accept': '*/*',
    };
  }
  if (url.includes('vidsrc.pk')) {
    return {
      'User-Agent': ua,
      'Referer': 'https://embed.vidsrc.pk/',
      'Origin': 'https://embed.vidsrc.pk',
      'Accept': '*/*',
    };
  }
  if (url.includes('vidsrc.fyi')) {
    return {
      'User-Agent': ua,
      'Referer': 'https://vidsrc.fyi/',
      'Origin': 'https://vidsrc.fyi',
      'Accept': '*/*',
    };
  }
  if (url.includes('vidsrc')) {
    return {
      'User-Agent': ua,
      'Referer': 'https://vidsrc.me/',
      'Origin': 'https://vidsrc.me',
      'Accept': '*/*',
    };
  }
  if (url.includes('vaplayer') || url.includes('brightpath')) {
    return {
      'User-Agent': ua,
      'Referer': 'https://brightpathsignals.com/',
      'Origin': 'https://brightpathsignals.com',
      'Accept': '*/*',
    };
  }
  return {
    'User-Agent': ua,
    'Accept': '*/*',
  };
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  let cleanBase64 = base64;
  if (base64 && base64.includes(';base64,')) {
    cleanBase64 = base64.split(';base64,')[1];
  }
  const binary = atob(cleanBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function fetchWithCapacitor(
  url: string,
  responseType: 'text' | 'arraybuffer',
  headers?: Record<string, string>
): Promise<{ ok: boolean; status?: number; text: () => Promise<string>; arrayBuffer: () => Promise<ArrayBuffer>; base64?: () => Promise<string> }> {
  const isBinary = responseType === 'arraybuffer';
  const mergedHeaders = {
    ...getHeadersForUrl(url),
    ...headers,
  };
  
  logToNative(`[Proxy Fetch] Requesting: ${url} (Referer: ${mergedHeaders['Referer'] || 'None'})`);
  
  try {
    const response = await CapacitorHttp.get({
      url,
      headers: mergedHeaders,
      responseType: isBinary ? 'blob' : 'text',
      webFetchExtra: {
        mode: 'no-cors',
      } as any,
    });
    
    logToNative(`[Proxy Fetch] Response status: ${response.status} for ${url}`);

    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      text: async () => {
        if (typeof response.data === 'object' && response.data !== null) {
          return JSON.stringify(response.data);
        }
        return response.data;
      },
      base64: async () => response.data,
      arrayBuffer: async () => {
        let data = response.data;
        if (typeof data === 'string') {
          return base64ToArrayBuffer(data);
        }
        return data;
      },
    };
  } catch (err: any) {
    logToNative(`[Proxy Fetch] Error: ${err.message} for ${url}`);
    throw err;
  }
}

export function logToNative(message: string) {
  console.log(message);
  try {
    NativeStreamingEngine.addJsLog({ message });
  } catch (e) {
    // Fail silently if not on native platform or plugin unregistered
  }
}
