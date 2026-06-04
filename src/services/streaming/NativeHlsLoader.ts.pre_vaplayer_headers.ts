/**
 * NativeHlsLoader.ts
 *
 * A custom HLS.js loader for Capacitor Android that uses the built-in
 * CapacitorHttp from @capacitor/core to make all HLS network requests
 * (playlists, segments, AES keys) with full native header control.
 *
 * Why this is needed:
 * - cloudnestra.com requires Referer: https://cloudnestra.com/ on every request
 * - The Android WebView's JavaScript engine treats "Referer" as a forbidden header
 *   and silently strips it from XHR/fetch calls
 * - CapacitorHttp makes truly native Android HTTP calls (OkHttp under the hood),
 *   bypassing the WebView's header restrictions entirely
 *
 * On web (non-native), this returns the default loader unchanged.
 */

import { Capacitor, CapacitorHttp } from '@capacitor/core';

/** Map CDN domain → required Referer/Origin */
function getHeadersForUrl(url: string): Record<string, string> {
  const ua =
    'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

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
  return {
    'User-Agent': ua,
    'Accept': '*/*',
  };
}

/** Convert a base64 string to an ArrayBuffer */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Returns a custom HLS.js loader class that uses CapacitorHttp for
 * all HLS network fetches on native mobile. On web it returns the
 * default loader unchanged.
 */
export function buildNativeHlsLoader(defaultLoader: any) {
  if (!Capacitor.isNativePlatform()) {
    return defaultLoader;
  }

  return class NativeHlsLoader {
    context: any;
    config: any;
    callbacks: any;
    aborted = false;

    // HLS.js checks for stats on the loader instance
    stats = {
      aborted: false,
      loaded: 0,
      retry: 0,
      total: 0,
      chunkCount: 0,
      bwEstimate: 0,
      loading: { start: 0, first: 0, end: 0 },
      parsing: { start: 0, end: 0 },
      buffering: { start: 0, first: 0, end: 0 },
    };

    constructor(_config: any) {}

    destroy() {
      this.aborted = true;
    }

    abort() {
      this.aborted = true;
    }

    async load(context: any, _config: any, callbacks: any) {
      this.context = context;
      this.callbacks = callbacks;

      const { url } = context;
      const headers = getHeadersForUrl(url);
      const isBinary = context.responseType === 'arraybuffer';

      this.stats.loading.start = performance.now();

      try {
        const response = await CapacitorHttp.get({
          url,
          headers,
          // responseType 'blob' returns base64 on Android native, which we
          // convert to ArrayBuffer for HLS.js binary requests (segments, keys)
          responseType: isBinary ? 'blob' : 'text',
          webFetchExtra: {
            // Prevent CapacitorHttp from applying its own CORS rewrite for these
            mode: 'no-cors',
          } as any,
        });

        if (this.aborted) return;

        this.stats.loading.end = performance.now();
        this.stats.loading.first = this.stats.loading.end;

        const statusCode = response.status;

        if (statusCode < 200 || statusCode >= 300) {
          console.error(`[NativeHlsLoader] HTTP ${statusCode} for: ${url}`);
          callbacks.onError(
            { code: statusCode, text: `HTTP ${statusCode}` },
            context,
            null,
            this.stats
          );
          return;
        }

        let data: string | ArrayBuffer = response.data;

        // Convert base64 blob → ArrayBuffer for binary HLS content
        if (isBinary && typeof data === 'string') {
          data = base64ToArrayBuffer(data);
        }

        this.stats.loaded = typeof data === 'string' ? data.length : (data as ArrayBuffer).byteLength;
        this.stats.total = this.stats.loaded;

        callbacks.onSuccess(
          { data, url: context.url },
          this.stats,
          context,
          null
        );
      } catch (err: any) {
        if (this.aborted) return;
        console.error('[NativeHlsLoader] CapacitorHttp failed:', url, err?.message || err);
        callbacks.onError(
          { code: 0, text: err?.message || 'CapacitorHttp network error' },
          context,
          null,
          this.stats
        );
      }
    }
  };
}

