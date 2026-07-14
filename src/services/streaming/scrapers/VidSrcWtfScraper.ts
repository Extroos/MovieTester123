import { logToNative } from '../../../utils/nativeFetch';

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
  let resolvedDomain = domain;
  if (domain === 'vidsrc.wtf') {
    try {
      const { getGatewayHost } = await import('../RemoteConfigService');
      const remoteHost = await getGatewayHost('vidsrc_wtf');
      if (remoteHost) resolvedDomain = remoteHost;
    } catch (e) {
      console.warn('[VidSrcWtfScraper] Failed to fetch dynamic host, using fallback:', e);
    }
  }

  const chunkRes = await fetch('./wtf_chunk_46_decrypted.js');
  if (!chunkRes.ok) throw new Error("Decryption chunk asset could not be loaded");
  const chunkCode = await chunkRes.text();

  const wasmRes = await fetch('./makima.wasm');
  if (!wasmRes.ok) throw new Error("Decryption WASM asset could not be loaded");
  const wasmBuffer = await wasmRes.arrayBuffer();

  const webpackIdx = chunkCode.indexOf(',(self.webpackChunk_N_E');
  if (webpackIdx !== -1) {
    const decFuncs = chunkCode.substring(0, webpackIdx);
    (window as any).eval(decFuncs + '; window._0x53ab = _0x53ab; window._0x471f = _0x471f;');
  }

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

  let functionBody = 'const _0x53ab = window._0x53ab;\n' + chunkCode.substring(startIdx + startStr.length, endIdx - 1);
  if (resolvedDomain !== 'vidsrc.wtf') {
    functionBody = functionBody
      .replace('z=r.yxHOd', `z="https://api.${resolvedDomain}"`)
      .replace('D="https://mu"+"ltilang-ap"+"i.vidsrc.w"+"tf"', `D="https://multilang-api.${resolvedDomain}"`);
  }
  const moduleFunc = new Function('e', 't', 'n', functionBody);

  const mockExports = {} as any;
  (window as any).__pn = null;

  moduleFunc(mockExports, mockExports, mockRequire);

  let refererUrl = `https://${resolvedDomain}/`;
  if (apiType === 'wtf-2') {
    refererUrl = isTv 
      ? `https://${resolvedDomain}/2/tv/${tmdbId}/${season}/${episode}`
      : `https://${resolvedDomain}/2/movie/${tmdbId}`;
  } else if (apiType === 'wtf-4') {
    refererUrl = isTv
      ? `https://${resolvedDomain}/4/tv/${tmdbId}/${season}/${episode}`
      : `https://${resolvedDomain}/4/movie/${tmdbId}`;
  } else {
    refererUrl = isTv
      ? `https://${resolvedDomain}/1/tv/${tmdbId}/${season}/${episode}`
      : `https://${resolvedDomain}/1/movie/${tmdbId}`;
  }

  const originalFetch = window.fetch;

  window.fetch = async (url: string, options: any = {}) => {
    let targetUrl = url;
    if (resolvedDomain !== 'vidsrc.wtf') {
      targetUrl = url.replace('vidsrc.wtf', resolvedDomain);
    }
    
    if (targetUrl.includes('/altcha-challenge') || targetUrl.includes('/bootstrap') || (!targetUrl.includes('.wasm') && !targetUrl.includes('/makima-manifest.json'))) {
      const nativeFetch = await import('../../../utils/nativeFetch');
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
