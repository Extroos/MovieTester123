import { Capacitor, CapacitorHttp } from '@capacitor/core';

export function getHeadersForUrl(url: string): Record<string, string> {
  const ua = 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

  if (url.includes('origin_referer=')) {
    try {
      const urlObj = new URL(url);
      const ref = urlObj.searchParams.get('origin_referer');
      if (ref) {
        const origin = ref.replace(/\/$/, '');
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
        const origin = ref.replace(/\/$/, '');
        return {
          'User-Agent': ua,
          'Referer': ref,
          'Origin': origin,
          'Accept': '*/*',
        };
      }
    }
  }

  if (url.includes('vodvidl.site') || url.includes('vidlink')) {
    return {
      'User-Agent': ua,
      'Referer': 'https://vidlink.pro/',
      'Origin': 'https://vidlink.pro',
      'Accept': '*/*',
    };
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
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function fetchWithCapacitor(
  url: string,
  responseType: 'text' | 'arraybuffer'
): Promise<{ ok: boolean; text: () => Promise<string>; arrayBuffer: () => Promise<ArrayBuffer>; base64?: () => Promise<string> }> {
  const isBinary = responseType === 'arraybuffer';
  const response = await CapacitorHttp.get({
    url,
    headers: getHeadersForUrl(url),
    responseType: isBinary ? 'blob' : 'text',
    webFetchExtra: {
      mode: 'no-cors',
    } as any,
  });

  return {
    ok: response.status >= 200 && response.status < 300,
    text: async () => response.data,
    base64: async () => response.data,
    arrayBuffer: async () => {
      let data = response.data;
      if (typeof data === 'string') {
        return base64ToArrayBuffer(data);
      }
      return data;
    },
  };
}
