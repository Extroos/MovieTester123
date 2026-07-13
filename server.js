import express from 'express';
import cors from 'cors';
import { Readable } from 'stream';
import axios from 'axios';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import fs from 'fs';
import vm from 'vm';
import https from 'https';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Spawn Python Decryptor Server on port 8000 using absolute paths
console.log('[Node Server] Starting Python decryptor server on port 8000...');
const pythonPath = path.join(__dirname, '.venv', 'Scripts', 'python.exe');
const scriptPath = path.join(__dirname, 'temp_decryptor', 'main.py');

const pythonProcess = spawn(pythonPath, [scriptPath], {
  stdio: 'inherit',
  shell: false
});
pythonProcess.on('error', (err) => {
  console.error('[Node Server] Failed to start Python decryptor server:', err.message);
});

// Ensure Python server is terminated when the node process exits
const killPythonProcess = () => {
  console.log('[Node Server] Shutting down Python decryptor server...');
  try {
    pythonProcess.kill();
  } catch (e) {}
};
process.on('exit', killPythonProcess);
process.on('SIGINT', () => {
  killPythonProcess();
  process.exit();
});
process.on('SIGTERM', () => {
  killPythonProcess();
  process.exit();
});
process.on('uncaughtException', (err) => {
  console.error('[Node Server] Uncaught exception:', err);
  killPythonProcess();
  process.exit(1);
});

const app = express();
const port = process.env.PORT || 3001;

// Load configuration — re-reads on every call so config.json changes apply immediately (no restart needed)
const configPath = path.join(__dirname, 'config.json');
let config = {};
function loadConfig() {
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    console.error('[Node Server] Failed to load config.json:', e.message);
  }
  return config;
}
loadConfig(); // eager load on startup

app.use(cors());
app.use(express.json());

// WTF Decryption and Resolution Configuration
const wtfProxyBase = "http://localhost:8000/local-proxy";

async function fetchWtfProxy(url, headers = {}, refererUrl = 'https://vidsrc.wtf/') {
  const fullUrl = `${wtfProxyBase}?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(refererUrl)}&origin=${encodeURIComponent('https://vidsrc.wtf')}`;
  const cleanHeaders = { ...headers };
  cleanHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
  cleanHeaders['user-agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
  
  const res = await axios.get(fullUrl, { headers: cleanHeaders, validateStatus: () => true });
  if (typeof res.data === 'string' && res.data.includes('<!DOCTYPE html>')) {
    throw new Error("Cloudflare block page returned by proxy");
  }
  return res.data;
}

function mockRequire(modId) {
  if (modId === 6434) return { Buffer: Buffer };
  return {};
}

mockRequire.d = (exports, definition) => {
  for (const key in definition) {
    if (Object.prototype.hasOwnProperty.call(definition, key) && !Object.prototype.hasOwnProperty.call(exports, key)) {
      Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
    }
  }
};

async function getWtfStreamUrl(tmdbId, apiType, serverName = null, isTv = false, season = 1, episode = 1) {
  const chunkPath = path.join(__dirname, 'public', 'wtf_chunk_46_decrypted.js');
  const wasmPath = path.join(__dirname, 'public', 'makima.wasm');
  
  if (!fs.existsSync(chunkPath) || !fs.existsSync(wasmPath)) {
    throw new Error("Required decryption assets (wtf_chunk_46_decrypted.js or makima.wasm) are missing.");
  }
  
  const chunkCode = fs.readFileSync(chunkPath, 'utf8');
  
  // Extract top-level decryption functions
  const webpackIdx = chunkCode.indexOf(',(self.webpackChunk_N_E');
  if (webpackIdx !== -1) {
    const decFuncs = chunkCode.substring(0, webpackIdx);
    eval(decFuncs + '; global._0x53ab = _0x53ab; global._0x471f = _0x471f;');
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
  
  const functionBody = 'const _0x53ab = global._0x53ab;\n' + chunkCode.substring(startIdx + startStr.length, endIdx - 1);
  const moduleFunc = new Function('e', 't', 'n', functionBody);
  
  const mockExports = {};
  global.window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    __pn: null
  };
  global.self = global.window;
  
  moduleFunc(mockExports, mockExports, mockRequire);
  
  let refererUrl = 'https://vidsrc.wtf/';
  if (apiType === 'wtf-2') {
    refererUrl = isTv 
      ? `https://vidsrc.wtf/2/tv/${tmdbId}/${season}/${episode}`
      : `https://vidsrc.wtf/2/movie/${tmdbId}`;
  } else if (apiType === 'wtf-4') {
    refererUrl = isTv
      ? `https://vidsrc.wtf/4/tv/${tmdbId}/${season}/${episode}`
      : `https://vidsrc.wtf/4/movie/${tmdbId}`;
  } else {
    refererUrl = isTv
      ? `https://vidsrc.wtf/1/tv/${tmdbId}/${season}/${episode}`
      : `https://vidsrc.wtf/1/movie/${tmdbId}`;
  }
  
  global.fetch = async (url, options = {}) => {
    const headers = options.headers || {};
    
    if (url.includes('/altcha-challenge')) {
      const data = await fetchWtfProxy(url, headers, refererUrl);
      return {
        ok: true,
        status: 200,
        json: async () => data
      };
    }
    
    if (url.includes('/bootstrap')) {
      const data = await fetchWtfProxy(url, headers, refererUrl);
      return {
        ok: true,
        status: 200,
        json: async () => data
      };
    }
    
    if (url.includes('.wasm')) {
      const wasmBuffer = fs.readFileSync(wasmPath);
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => wasmBuffer
      };
    }
    
    if (url.includes('/makima-manifest.json')) {
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
      };
    }
    
    const data = await fetchWtfProxy(url, headers, refererUrl);
    return {
      ok: true,
      status: 200,
      text: async () => typeof data === 'string' ? data : JSON.stringify(data),
      json: async () => typeof data === 'string' ? JSON.parse(data) : data
    };
  };
  
  Object.defineProperty(global, 'crypto', {
    value: {
      subtle: {
        digest: async (algo, data) => {
          const nodeAlgo = algo.toLowerCase().replace('-', '');
          const hash = crypto.createHash(nodeAlgo).update(data).digest();
          return new Uint8Array(hash).buffer;
        }
      },
      getRandomValues: (array) => {
        return crypto.randomFillSync(array);
      }
    },
    configurable: true,
    writable: true
  });
  
  if (apiType === 'wtf-2') {
    return isTv 
      ? await mockExports.ju(tmdbId, season, episode)
      : await mockExports.Cm(tmdbId);
  } else if (apiType === 'wtf-4') {
    return isTv
      ? await mockExports.sk(tmdbId, season, episode)
      : await mockExports.$q(tmdbId);
  } else {
    // apiType is wtf-1 or wtf-3
    let activeServer = serverName;
    if (!activeServer) {
      try {
        const serversRes = await mockExports.Ot();
        if (serversRes && serversRes.ok && serversRes.data && serversRes.data.length > 0) {
          activeServer = serversRes.data[0].name;
        }
      } catch (e) {
        console.warn("[WTF Resolver] Failed to fetch servers list, fallback to Leon:", e.message);
      }
      if (!activeServer) activeServer = 'Leon';
    }
    
    return isTv
      ? await mockExports.Nw(tmdbId, season, episode, activeServer)
      : await mockExports.dE(tmdbId, activeServer);
  }
}



// Vidlink Decryption and Resolution Configuration
const KEY_HEX = "c75136c5668bbfe65a7ecad431a745db68b5f381555b38d8f6c699449cf11fcd";
const KEY = Buffer.from(KEY_HEX, 'hex');
const NONCE = new Uint8Array(24);

function encryptToken(mediaId) {
  const timestamp = Math.floor(Date.now() / 1000) + 480;
  const mediaIdBuf = Buffer.from(mediaId, 'utf-8');
  const timestampBuf = Buffer.alloc(8);
  timestampBuf.writeBigUInt64BE(BigInt(timestamp));
  const message = Buffer.concat([mediaIdBuf, timestampBuf]);
  
  const encrypted = nacl.secretbox(
    new Uint8Array(message),
    NONCE,
    new Uint8Array(KEY)
  );
  
  if (!encrypted) throw new Error("Encryption failed");
  
  const fullPayload = Buffer.concat([
    Buffer.from(NONCE),
    Buffer.from(encrypted)
  ]);
  
  return fullPayload.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}





// Custom fallback resolver calling the Python vidsrc.me scraper
async function resolveFallbackStream(tmdbId, type, season = 1, episode = 1) {
  try {
    const url = type === 'tv'
      ? `http://localhost:8000/fallback/tv/${tmdbId}/${season}/${episode}`
      : `http://localhost:8000/fallback/movie/${tmdbId}`;
      
    console.log(`[Express Fallback] Calling Python fallback resolver: ${url}`);
    
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Python fallback resolver returned status ${res.status}`);
    }
    const data = await res.json();
    return data;
  } catch (e) {
    console.error(`[Fallback Scraper] Failed: ${e.message}`);
    return null;
  }
}

// Local Residential CORS Proxy (Delegates to Python curl_cffi proxy on port 8000, or directly proxies video streams)
app.get('/local-proxy', async (req, res) => {
  const targetUrl = req.query.url;
  const referer = req.query.referer || 'https://vidlink.pro/';
  const origin = req.query.origin || 'https://vidlink.pro';
  
  if (!targetUrl) {
    return res.status(400).send('Missing url parameter');
  }
  
  try {
    const pythonProxyUrl = `http://localhost:8000/local-proxy?url=${encodeURIComponent(targetUrl)}&referer=${encodeURIComponent(referer)}&origin=${encodeURIComponent(origin)}`;
    console.log(`[Express Proxy] Forwarding request to Python: ${targetUrl}`);
    
    const headers = {
      'x-forwarded-host': req.get('host'),
      'x-forwarded-proto': req.protocol,
      'user-agent': req.headers['user-agent'] || ''
    };
    if (req.headers.range) {
      headers['range'] = req.headers.range;
      headers['Range'] = req.headers.range;
      console.log(`[Express Proxy] Forwarding client Range: ${req.headers.range}`);
    }
    
    const response = await axios({
      method: 'get',
      url: pythonProxyUrl,
      headers: headers,
      responseType: 'stream',
      timeout: 45000, // Slightly higher timeout for large video range handshakes
      validateStatus: () => true
    });
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');
    
    if (response.headers['content-length']) {
      res.setHeader('Content-Length', response.headers['content-length']);
    }
    if (response.headers['content-range']) {
      res.setHeader('Content-Range', response.headers['content-range']);
    }
    if (response.headers['accept-ranges']) {
      res.setHeader('Accept-Ranges', response.headers['accept-ranges']);
    }
    
    res.status(response.status);
    response.data.pipe(res);
  } catch (e) {
    console.error(`[Express Proxy] Proxy error:`, e.message);
    res.status(500).send(e.message);
  }
});

app.get('/local-proxy', async (req, res) => {
  const { url, referer, origin } = req.query;
  if (!url) return res.status(400).send("Missing url parameter");
  
  console.log(`[Express Proxy] Proxying URL: ${url}`);
  
  try {
    const headers = {};
    const clientUa = req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    headers['user-agent'] = clientUa;
    headers['User-Agent'] = clientUa;
    if (referer) headers['Referer'] = referer;
    if (origin) headers['Origin'] = origin;
    
    const pythonProxyUrl = `http://localhost:8000/local-proxy?url=${encodeURIComponent(url)}` + 
      (referer ? `&referer=${encodeURIComponent(referer)}` : '') +
      (origin ? `&origin=${encodeURIComponent(origin)}` : '');
      
    const targetRes = await axios.get(pythonProxyUrl, {
      headers,
      responseType: 'stream',
      timeout: 25000,
      validateStatus: () => true
    });
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (targetRes.headers['content-type']) {
      res.setHeader('Content-Type', targetRes.headers['content-type']);
    }
    
    targetRes.data.pipe(res);
  } catch (err) {
    console.error(`[Express Proxy] Error proxying ${url}:`, err.message);
    res.status(500).send(err.message);
  }
});

// Helper to dynamically rewrite localhost:8000 URLs to the incoming client host URL
function rewriteLocalhostUrls(obj, req) {
  const hostBase = `${req.protocol}://${req.get('host')}`;
  const str = JSON.stringify(obj);
  const updatedStr = str.replace(/http:\/\/localhost:8000/g, hostBase);
  return JSON.parse(updatedStr);
}

// Routes
// 1. GET /meta/tmdb/watch/:tmdbId
app.get('/meta/tmdb/watch/:tmdbId', async (req, res) => {
  // Hot-reload config so CDN/gateway changes in config.json apply immediately
  loadConfig();
  const { tmdbId } = req.params;
  const { type = 'movie', s = 1, e = 1, title, server = 'auto', sub_server, raw } = req.query;
  const season = parseInt(s);
  const episode = parseInt(e);
  
  const activeServer = server;
  
  console.log(`[Server] Watch request: ID ${tmdbId}, Type: ${type}, S: ${season}, E: ${episode}, Server: ${server} (Mapped to: ${activeServer})`);
  
  // Handle direct stream redirects for raw playback
  if (raw === 'true') {
    try {
      const isTv = type === 'tv';
      const apiType = server === 'vidsrc-wtf-2' ? 'wtf-2' : (server === 'vidsrc-wtf-4' ? 'wtf-4' : (server === 'vidsrc-wtf-3' ? 'wtf-3' : 'wtf-1'));
      console.log(`[Server] Resolving raw redirect: API type ${apiType}, TMDB ${tmdbId}, Sub-Server: ${sub_server || 'default'}`);
      
      const decrypted = await getWtfStreamUrl(tmdbId, apiType, sub_server || null, isTv, season, episode);
      if (!decrypted || !decrypted.ok) {
        throw new Error(decrypted?.error || "Decryption returned failure status");
      }
      
      let streamUrl = '';
      let refererUrl = 'https://vidsrc.wtf/';
      if (apiType === 'wtf-2') {
        if (!decrypted.data?.streams || decrypted.data.streams.length === 0) {
          throw new Error("No streams found in Multi Language response");
        }
        streamUrl = decrypted.data.streams[0].url;
        refererUrl = decrypted.data.streams[0].headers?.Referer || refererUrl;
      } else {
        streamUrl = decrypted.data?.stream?.url;
      }
      
      if (!streamUrl) {
        throw new Error("No stream URL found in WTF response");
      }
      
      const originUrl = new URL(streamUrl).origin;
      const proxiedUrl = `http://localhost:8000/local-proxy?url=${encodeURIComponent(streamUrl)}&referer=${encodeURIComponent(refererUrl)}&origin=${encodeURIComponent(originUrl)}`;
      
      return res.redirect(302, rewriteLocalhostUrls({ url: proxiedUrl }, req).url);
    } catch (err) {
      console.error(`[Server] Raw redirect failed:`, err.message);
      return res.status(500).send(`Stream resolution failed: ${err.message}`);
    }
  }

  // Handle explicit vidsrc-pm request — direct JSON API call to streamdata.vaplayer.ru or other mirrors
  if (activeServer === 'vidsrc-pm') {
    try {
      let pmReferer = 'https://nextgencloudfabric.com/';
      let pmOrigin  = 'https://nextgencloudfabric.com';
      
      // Dynamically resolve the active VidSrc PM player CDN domain by scraping
      // the vaplayer.ru embed gateway — avoids breaking when they rotate CDN domains
      const pmEmbedBase = config?.gateways?.vidsrc_pm_embed || 'https://vaplayer.ru';
      try {
        console.log(`[Server] Dynamically resolving active VidSrc PM domain via ${pmEmbedBase}...`);
        const embedTargetUrl = `${pmEmbedBase}/embed/movie/tt0137523`;
        const pyProxy = `http://localhost:8000/local-proxy?url=${encodeURIComponent(embedTargetUrl)}&referer=${encodeURIComponent('https://brightpathsignals.com/')}&origin=${encodeURIComponent('https://brightpathsignals.com')}`;
        
        const testRes = await axios.get(pyProxy, {
          timeout: 10000,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36' }
        });
        const iframeMatch = testRes.data.match(/<iframe\s+id="pf"\s+src="([^"]+)"/);
        if (iframeMatch) {
          const iframeUrl = iframeMatch[1];
          const parsed = new URL(iframeUrl);
          pmOrigin = parsed.origin;
          pmReferer = iframeUrl;
          console.log(`[Server] Dynamically resolved active VidSrc PM referer: ${pmReferer}`);
        }
      } catch (err) {
        console.warn(`[Server] Failed to dynamically resolve VidSrc PM domain, using fallback: ${err.message}`);
      }
      
      // Resolve IMDB ID if TMDB is provided (VidSrc PM API requires IMDB ID)
      let imdbId = tmdbId;
      if (!tmdbId.startsWith('tt')) {
        try {
          const tmdbApiKey = '8265bd1679663a7ea12ac168da84d2e8';
          const tmdbUrl = type === 'tv'
            ? `https://api.themoviedb.org/3/tv/${tmdbId}/external_ids?api_key=${tmdbApiKey}`
            : `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${tmdbApiKey}`;
          
          const tmdbRes = await axios.get(tmdbUrl, { timeout: 8000 });
          if (tmdbRes.data && tmdbRes.data.imdb_id) {
            imdbId = tmdbRes.data.imdb_id;
            console.log(`[Server] Resolved IMDB ID ${imdbId} for TMDB ${tmdbId}`);
          }
        } catch (e) {
          console.warn(`[Server] Failed to resolve IMDB ID from TMDB: ${e.message}`);
        }
      }
      
      const gateways = config.embed_urls?.vidsrc_pm_gateways || ['https://streamdata.vaplayer.ru'];
      let apiData = null;
      let lastError = null;

      for (const gw of gateways) {
        const pmUrl = type === 'tv'
          ? `${gw}/api.php?imdb=${imdbId}&type=tv&season=${season}&episode=${episode}`
          : `${gw}/api.php?imdb=${imdbId}&type=movie`;

        console.log(`[Server] Resolving VidSrc PM for IMDB-${imdbId} (${type}) via gateway: ${pmUrl}`);
        try {
          const pyProxy = `http://localhost:8000/local-proxy?url=${encodeURIComponent(pmUrl)}&referer=${encodeURIComponent(pmReferer)}&origin=${encodeURIComponent(pmOrigin)}`;
          const pmRes = await axios.get(pyProxy, { responseType: 'text', timeout: 20000, validateStatus: () => true });
          const rawText = typeof pmRes.data === 'string' ? pmRes.data : JSON.stringify(pmRes.data);
          const parsed = JSON.parse(rawText);
          
          const statusCode = parsed?.status_code;
          if (statusCode === 200 || statusCode === '200') {
            apiData = parsed;
            break;
          } else {
            lastError = new Error(`Gateway returned status_code=${statusCode}`);
          }
        } catch (err) {
          lastError = err;
          console.warn(`[Server] Gateway ${gw} failed: ${err.message}`);
        }
      }

      if (!apiData) {
        throw lastError || new Error('All VidSrc PM gateways failed');
      }

      const streamData  = apiData?.data || {};
      const streamUrls  = streamData?.stream_urls || [];
      if (streamUrls.length === 0) {
        throw new Error('VidSrc PM returned empty stream_urls');
      }

      // Use only first adaptive master — CDN mirrors are duplicates
      const sources = [{
        url: `http://localhost:8000/local-proxy?url=${encodeURIComponent(streamUrls[0])}&referer=${encodeURIComponent(pmReferer)}&origin=${encodeURIComponent(pmOrigin)}`,
        quality: 'auto',
        isM3U8: true
      }];

      const subtitles = [];
      const subsList = apiData?.default_subs || streamData?.default_subs || [];
      for (const sub of subsList) {
        const subUrl = sub.url || sub.file;
        if (subUrl) {
          const localPort = process.env.PORT || 3001;
          const resolvedSubUrl = subUrl.includes('.zip')
            ? `http://localhost:${localPort}/movies/yts-subtitles/download?link=${encodeURIComponent(subUrl)}`
            : `http://localhost:${localPort}/subtitles/convert?url=${encodeURIComponent(subUrl)}`;
          subtitles.push({ url: resolvedSubUrl, lang: sub.lang || sub.label || 'English' });
        }
      }

      console.log(`[Server] VidSrc PM resolved dynamically: ${sources.length} source(s), ${subtitles.length} subtitle(s)`);
      return res.json(rewriteLocalhostUrls({ sources, subtitles }, req));
    } catch (err) {
      console.error(`[Server] VidSrc PM resolution failed:`, err.message, "trying fallback to Vidify or Fallback resolver...");
      try {
        const pythonUrl = type === 'tv'
          ? `http://localhost:8000/vidify/tv/${tmdbId}/${season}/${episode}`
          : `http://localhost:8000/vidify/movie/${tmdbId}`;
        const res2 = await fetch(pythonUrl);
        if (res2.ok) {
          const result = await res2.json();
          console.log("[Server] VidSrc PM successfully fell back to Vidify");
          return res.json(rewriteLocalhostUrls(result, req));
        }
      } catch (fbErr) {
        console.error(`[Server] VidSrc PM fallback to Vidify failed:`, fbErr.message);
        try {
          const pythonUrl = type === 'tv'
            ? `http://localhost:8000/fallback/tv/${tmdbId}/${season}/${episode}`
            : `http://localhost:8000/fallback/movie/${tmdbId}`;
          const res2 = await fetch(pythonUrl);
          if (res2.ok) {
            const result = await res2.json();
            console.log("[Server] VidSrc PM successfully fell back to Fallback scraper");
            return res.json(rewriteLocalhostUrls(result, req));
          }
        } catch (fbErr2) {
          console.error(`[Server] VidSrc PM fallback to Fallback scraper failed:`, fbErr2.message);
        }
      }
      return res.status(500).json({ error: `vidsrc-pm failed: ${err.message}` });
    }
  }

  // Handle explicit test-server request on Web/Desktop
  // Handle explicit test-server request on Web/Desktop (Native Node.js execution)
  // Handle explicit test-server request on Web/Desktop (Native Node.js execution with robust failover)
  if (activeServer === 'test-server') {
    try {
      console.log(`[Server] Resolving test-server natively for TMDB-${tmdbId} (${type})...`);
      
      const localProxyUrl = 'http://localhost:8000/local-proxy';
      
      const proxyFetch = async (targetUrl, referer = 'https://google.com/', origin = 'https://google.com') => {
        const url = `${localProxyUrl}?url=${encodeURIComponent(targetUrl)}&referer=${encodeURIComponent(referer)}&origin=${encodeURIComponent(origin)}`;
        const response = await axios.get(url, {
          responseType: 'arraybuffer',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept-Encoding': 'identity'
          }
        });
        const buffer = Buffer.from(response.data);
        if (buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
          return vm.runInContext("zlib.gunzipSync(buffer).toString('utf8')", vm.createContext({ zlib, buffer }));
        }
        return buffer.toString('utf8');
      };

      let resolvedSource = null;

      // 1. Try Vidsrc PM JSON API natively (Super reliable, no WAF challenge)
      try {
        const pmUrl = type === 'tv'
          ? `https://streamdata.vaplayer.ru/api.php?tmdb=${tmdbId}&type=tv&season=${season || 1}&episode=${episode || 1}`
          : `https://streamdata.vaplayer.ru/api.php?tmdb=${tmdbId}&type=movie`;
          
        console.log(`[Server] Resolving natively via Vidsrc PM API: ${pmUrl}`);
        const apiResponse = await proxyFetch(pmUrl, 'https://brightpathsignals.com/', 'https://brightpathsignals.com');
        const data = typeof apiResponse === 'string' ? JSON.parse(apiResponse) : apiResponse;
        
        if (data && (data.status_code === 200 || data.status_code === "200")) {
          const streamData = data.data || {};
          const streamUrls = streamData.stream_urls || [];
          if (streamUrls.length > 0) {
            const proxiedSources = streamUrls.map((stream, idx) => {
              const proxiedUrl = `http://localhost:8000/local-proxy?url=${encodeURIComponent(stream)}&referer=${encodeURIComponent('https://brightpathsignals.com/')}&origin=${encodeURIComponent('https://brightpathsignals.com')}`;
              return {
                url: proxiedUrl,
                quality: idx === 0 ? 'auto' : `backup ${idx}`,
                isM3U8: true
              };
            });
            
            const subtitles = [];
            const subsList = data.default_subs || streamData.default_subs || [];
            for (const sub of subsList) {
              const subUrl = sub.url || sub.file;
              if (subUrl) {
                const localPort = process.env.PORT || 3001;
                const resolvedSubUrl = subUrl.includes('.zip')
                  ? `http://localhost:${localPort}/movies/yts-subtitles/download?link=${encodeURIComponent(subUrl)}`
                  : `http://localhost:${localPort}/subtitles/convert?url=${encodeURIComponent(subUrl)}`;
                subtitles.push({
                  url: resolvedSubUrl,
                  lang: sub.lang || sub.label || 'English'
                });
              }
            }
            
            // Fallback: If subtitles list is empty, let the client fetch YTS subtitles on-demand
            // to prevent blocking the stream resolution endpoint with slow synchronous scrapers.
            
            resolvedSource = {
              sources: proxiedSources,
              subtitles: subtitles
            };
            console.log("[Server] Successfully resolved streams via Vidsrc PM API natively.");
          }
        }
      } catch (err) {
        console.warn(`[Server] Native Vidsrc PM API resolve failed: ${err.message}. Trying vidsrc.to chain...`);
      }

      // 2. Try vidsrc.to / cloudnestra / cloudorchestranova chain natively in Node (Domain Agnostic)
      if (!resolvedSource) {
        try {
          const embedUrl = type === 'tv'
            ? `https://vidsrc.to/embed/tv/${tmdbId}/${season}-${episode}`
            : `https://vidsrc.to/embed/movie/${tmdbId}`;

          const html1 = await proxyFetch(embedUrl, 'https://google.com/');
          const vsembedMatch = html1.match(/src="(https?:\/\/vsembed[^"]+)"/);
          if (vsembedMatch) {
            const vsembedUrl = vsembedMatch[1];
            const html2 = await proxyFetch(vsembedUrl, embedUrl);
            const rcpMatch = html2.match(/([A-Za-z0-9-.]+\.[A-Za-z]{2,})\/rcp\/([A-Za-z0-9_\-=.]+)/);
            if (rcpMatch) {
              const rcpDomain = rcpMatch[1];
              const rcpUrl = `https://${rcpDomain}/rcp/${rcpMatch[2]}`;
              const html3 = await proxyFetch(rcpUrl, vsembedUrl);
              const prorcpMatch = html3.match(/src:\s*['"]\s*\/prorcp\/([^'"]+)['"]/i);
              if (prorcpMatch) {
                const prorcpUrl = `https://${rcpDomain}/prorcp/${prorcpMatch[1]}`;
                const html4 = await proxyFetch(prorcpUrl, rcpUrl);
                const m3u8Match = html4.match(/"(https?:\/\/[^"]+\.m3u8[^"]*)"/i);
                if (m3u8Match) {
                  const cleaned = m3u8Match[1].replace(/\{v\d\}/g, rcpDomain);
                  const proxiedUrl = `http://localhost:8000/local-proxy?url=${encodeURIComponent(cleaned)}&referer=${encodeURIComponent(rcpUrl)}&origin=${encodeURIComponent('https://' + rcpDomain)}`;
                  resolvedSource = {
                    sources: [{
                      url: proxiedUrl,
                      quality: 'auto',
                      isM3U8: true
                    }],
                    subtitles: []
                  };
                  console.log("[Server] Successfully resolved streams via domain-agnostic cloudnestra/prorcp chain natively.");
                }
              }
            }
          }
        } catch (err) {
          console.warn(`[Server] Native vidsrc.to extraction failed: ${err.message}. Trying Filemoon...`);
        }
      }

      // 3. Try Filemoon via native JS plugin evaluation
      if (!resolvedSource) {
        try {
          const filemoonUrl = type === 'tv'
            ? `https://filemoon.to/e/${tmdbId}/${season}-${episode}`
            : `https://filemoon.to/e/${tmdbId}`;
          const html = await proxyFetch(filemoonUrl, 'https://google.com/');
          
          const pluginPath = path.join(__dirname, 'android', 'app', 'src', 'main', 'assets', 'plugins', 'filemoon.js');
          const scriptContent = fs.readFileSync(pluginPath, 'utf8');
          
          const context = vm.createContext({ URL, console, JSON });
          vm.runInContext(scriptContent + `\nvar result = extract(${JSON.stringify(html)}, ${JSON.stringify(filemoonUrl)});`, context);
          const parsed = JSON.parse(context.result);
          if (parsed.source_url) {
            const referer = parsed.headers?.Referer || filemoonUrl;
            const origin = parsed.headers?.Origin || 'https://filemoon.to';
            const proxiedUrl = `http://localhost:8000/local-proxy?url=${encodeURIComponent(parsed.source_url)}&referer=${encodeURIComponent(referer)}&origin=${encodeURIComponent(origin)}`;
            resolvedSource = {
              sources: [{
                url: proxiedUrl,
                quality: 'auto',
                isM3U8: true
              }],
              subtitles: []
            };
            console.log("[Server] Successfully resolved streams via Filemoon JS plugin natively.");
          }
        } catch (err) {
          console.warn(`[Server] Native Filemoon extraction failed: ${err.message}`);
        }
      }

      if (!resolvedSource) {
        throw new Error("Failed to extract stream natively in Node.js");
      }

      return res.json(rewriteLocalhostUrls(resolvedSource, req));
    } catch (err) {
      console.error(`[Server] Native test-server resolution failed:`, err.message);
      return res.status(500).json({ error: `test-server failed: ${err.message}` });
    }
  }

  // Handle explicit vidsrc-wtf requests
  if (activeServer === 'vidsrc-wtf-1' || activeServer === 'vidsrc-wtf-2' || activeServer === 'vidsrc-wtf-3' || activeServer === 'vidsrc-wtf-4') {
    try {
      const isTv = type === 'tv';
      const apiType = activeServer === 'vidsrc-wtf-2' ? 'wtf-2' : (activeServer === 'vidsrc-wtf-4' ? 'wtf-4' : (activeServer === 'vidsrc-wtf-3' ? 'wtf-3' : 'wtf-1'));
      console.log(`[Server] Resolving WTF stream: API type ${apiType}, TMDB ${tmdbId}, TV: ${isTv}`);
      
      if (apiType === 'wtf-1' || apiType === 'wtf-3') {
        // Expose all available WTF sub-servers to allow clean streams to be selected by quality options in the UI
        const baseQuery = `/meta/tmdb/watch/${tmdbId}?type=${type}&s=${season}&e=${episode}&server=${activeServer}&raw=true`;
        const sources = [
          { url: `${baseQuery}&sub_server=Ada`, quality: 'Ada (Clean Stream)', isM3U8: true },
          { url: `${baseQuery}&sub_server=Claire`, quality: 'Claire (Clean Stream)', isM3U8: true },
          { url: `${baseQuery}&sub_server=Hunk`, quality: 'Hunk (Premium Clean)', isM3U8: true },
          { url: `${baseQuery}&sub_server=Rebecca`, quality: 'Rebecca (Direct Clean)', isM3U8: false },
          { url: `${baseQuery}&sub_server=Leon`, quality: 'Leon (Standard Ads)', isM3U8: true },
          { url: `${baseQuery}&sub_server=Sherry`, quality: 'Sherry (MP4 Direct)', isM3U8: false },
          { url: `${baseQuery}&sub_server=Chris`, quality: 'Chris', isM3U8: true },
          { url: `${baseQuery}&sub_server=Grace`, quality: 'Grace', isM3U8: true },
          { url: `${baseQuery}&sub_server=Ethan`, quality: 'Ethan', isM3U8: true },
          { url: `${baseQuery}&sub_server=Jill`, quality: 'Jill', isM3U8: true },
          { url: `${baseQuery}&sub_server=Albert`, quality: 'Albert', isM3U8: true }
        ];
        
        return res.json(rewriteLocalhostUrls({
          sources: sources,
          subtitles: []
        }, req));
      }
      
      const decrypted = await getWtfStreamUrl(tmdbId, apiType, null, isTv, season, episode);
      
      if (!decrypted || !decrypted.ok) {
        throw new Error(decrypted?.error || "Decryption returned failure status");
      }
      
      if (apiType === 'wtf-2') {
        if (!decrypted.data?.streams || decrypted.data.streams.length === 0) {
          throw new Error("No streams found in Multi Language response");
        }
        
        const sources = decrypted.data.streams.map((stream, idx) => {
          const ref = stream.headers?.Referer || 'https://vidsrc.wtf/';
          const origin = new URL(stream.url).origin;
          const proxiedUrl = `http://localhost:8000/local-proxy?url=${encodeURIComponent(stream.url)}&referer=${encodeURIComponent(ref)}&origin=${encodeURIComponent(origin)}`;
          return {
            url: proxiedUrl,
            quality: stream.language || `Stream ${idx + 1}`,
            isM3U8: stream.type === 'hls' || stream.url.includes('.m3u8')
          };
        });
        
        return res.json(rewriteLocalhostUrls({
          sources: sources,
          subtitles: []
        }, req));
        
      } else {
        // This is wtf-4 (Premium)
        const streamUrl = decrypted.data?.stream?.url;
        if (!streamUrl) {
          throw new Error("No stream URL found in WTF response");
        }
        
        const refererUrl = `https://vidsrc.wtf/`;
        const originUrl = 'https://vidsrc.wtf';
        const proxiedUrl = `http://localhost:8000/local-proxy?url=${encodeURIComponent(streamUrl)}&referer=${encodeURIComponent(refererUrl)}&origin=${encodeURIComponent(originUrl)}`;
        
        return res.json(rewriteLocalhostUrls({
          sources: [{
            url: proxiedUrl,
            quality: 'Premium Stream',
            isM3U8: true
          }],
          subtitles: []
        }, req));
      }
      
    } catch (err) {
      console.error(`[Server] WTF resolution failed:`, err.message);
      return res.status(500).json({ error: `vidsrc-wtf resolution failed: ${err.message}` });
    }
  }

  // Handle explicit vidsrc-fyi request
  if (activeServer === 'vidsrc-fyi') {
    try {
      const isTv = type === 'tv';
      console.log(`[Server] Resolving FYI stream via WTF-1 / WTF-2 / Vidify / Fallback failover: TMDB ${tmdbId}, TV: ${isTv}`);
      
      // 1. Try WTF-1
      try {
        const decrypted = await getWtfStreamUrl(tmdbId, 'wtf-1', null, isTv, season, episode);
        if (decrypted && decrypted.ok && decrypted.data?.stream?.url) {
          const streamUrl = decrypted.data.stream.url;
          const refererUrl = `https://vidsrc.wtf/`;
          const originUrl = 'https://vidsrc.wtf';
          const proxiedUrl = `http://localhost:8000/local-proxy?url=${encodeURIComponent(streamUrl)}&referer=${encodeURIComponent(refererUrl)}&origin=${encodeURIComponent(originUrl)}`;
          return res.json(rewriteLocalhostUrls({
            sources: [{
              url: proxiedUrl,
              quality: 'auto',
              isM3U8: true
            }],
            subtitles: []
          }, req));
        }
      } catch (err) {
        console.warn(`[Server] FYI resolve via WTF-1 failed: ${err.message}. Trying WTF-2...`);
      }
      
      // 2. Try WTF-2
      try {
        const decrypted = await getWtfStreamUrl(tmdbId, 'wtf-2', null, isTv, season, episode);
        if (decrypted && decrypted.ok && decrypted.data?.streams && decrypted.data.streams.length > 0) {
          const sources = decrypted.data.streams.map((stream, idx) => {
            const ref = stream.headers?.Referer || 'https://vidsrc.wtf/';
            const origin = new URL(stream.url).origin;
            const proxiedUrl = `http://localhost:8000/local-proxy?url=${encodeURIComponent(stream.url)}&referer=${encodeURIComponent(ref)}&origin=${encodeURIComponent(origin)}`;
            return {
              url: proxiedUrl,
              quality: stream.language || `Stream ${idx + 1}`,
              isM3U8: stream.type === 'hls' || stream.url.includes('.m3u8')
            };
          });
          return res.json(rewriteLocalhostUrls({
            sources: sources,
            subtitles: []
          }, req));
        }
      } catch (err) {
        console.warn(`[Server] FYI resolve via WTF-2 failed: ${err.message}. Trying Vidify...`);
      }
      
      // 3. Try Vidify
      try {
        const pythonUrl = isTv
          ? `http://localhost:8000/vidify/tv/${tmdbId}/${season}/${episode}`
          : `http://localhost:8000/vidify/movie/${tmdbId}`;
        const res2 = await fetch(pythonUrl);
        if (res2.ok) {
          const result = await res2.json();
          return res.json(rewriteLocalhostUrls(result, req));
        }
      } catch (err) {
        console.warn(`[Server] FYI resolve via Vidify failed: ${err.message}. Trying Fallback...`);
      }
      
      // 4. Try Fallback
      try {
        const pythonUrl = isTv
          ? `http://localhost:8000/fallback/tv/${tmdbId}/${season}/${episode}`
          : `http://localhost:8000/fallback/movie/${tmdbId}`;
        const res2 = await fetch(pythonUrl);
        if (res2.ok) {
          const result = await res2.json();
          return res.json(rewriteLocalhostUrls(result, req));
        }
      } catch (err) {
        console.warn(`[Server] FYI resolve via Fallback failed: ${err.message}`);
      }
      
      throw new Error("All failover streams for VidSrc FYI failed");
    } catch (err) {
      console.error(`[Server] FYI resolution failed:`, err.message);
      return res.status(500).json({ error: `vidsrc-fyi resolution failed: ${err.message}` });
    }
  }

  // Handle explicit vidsrc-pk request
  if (activeServer === 'vidsrc-pk') {
    try {
      const isTv = type === 'tv';
      console.log(`[Server] Resolving PK stream via WTF-1 / WTF-2 / Vidify failover: TMDB ${tmdbId}, TV: ${isTv}`);
      
      // 1. Try WTF-1 first
      try {
        const decrypted = await getWtfStreamUrl(tmdbId, 'wtf-1', null, isTv, season, episode);
        if (decrypted && decrypted.ok && decrypted.data?.stream?.url) {
          const streamUrl = decrypted.data.stream.url;
          const refererUrl = `https://vidsrc.wtf/`;
          const originUrl = 'https://vidsrc.wtf';
          const proxiedUrl = `http://localhost:8000/local-proxy?url=${encodeURIComponent(streamUrl)}&referer=${encodeURIComponent(refererUrl)}&origin=${encodeURIComponent(originUrl)}`;
          return res.json(rewriteLocalhostUrls({
            sources: [{
              url: proxiedUrl,
              quality: 'auto',
              isM3U8: true
            }],
            subtitles: []
          }, req));
        }
      } catch (err) {
        console.warn(`[Server] PK resolve via WTF-1 failed: ${err.message}. Trying WTF-2...`);
      }
      
      // 2. Try WTF-2
      try {
        const decrypted = await getWtfStreamUrl(tmdbId, 'wtf-2', null, isTv, season, episode);
        if (decrypted && decrypted.ok && decrypted.data?.streams && decrypted.data.streams.length > 0) {
          const sources = decrypted.data.streams.map((stream, idx) => {
            const ref = stream.headers?.Referer || 'https://vidsrc.wtf/';
            const origin = new URL(stream.url).origin;
            const proxiedUrl = `http://localhost:8000/local-proxy?url=${encodeURIComponent(stream.url)}&referer=${encodeURIComponent(ref)}&origin=${encodeURIComponent(origin)}`;
            return {
              url: proxiedUrl,
              quality: stream.language || `Stream ${idx + 1}`,
              isM3U8: stream.type === 'hls' || stream.url.includes('.m3u8')
            };
          });
          return res.json(rewriteLocalhostUrls({
            sources: sources,
            subtitles: []
          }, req));
        }
      } catch (err) {
        console.warn(`[Server] PK resolve via WTF-2 failed: ${err.message}. Trying Vidify...`);
      }
      
      // 3. Try Vidify
      try {
        const pythonUrl = isTv
          ? `http://localhost:8000/vidify/tv/${tmdbId}/${season}/${episode}`
          : `http://localhost:8000/vidify/movie/${tmdbId}`;
        const res2 = await fetch(pythonUrl);
        if (res2.ok) {
          const result = await res2.json();
          return res.json(rewriteLocalhostUrls(result, req));
        }
      } catch (err) {
        console.warn(`[Server] PK resolve via Vidify failed: ${err.message}`);
      }
      
      throw new Error("All failover streams for VidSrc PK failed");
    } catch (err) {
      console.error(`[Server] PK resolution failed:`, err.message);
      return res.status(500).json({ error: `vidsrc-pk resolution failed: ${err.message}` });
    }
  }

  // Handle explicit vidsrc-sbs request
  if (activeServer === 'vidsrc-sbs') {
    try {
      const isTv = type === 'tv';
      console.log(`[Server] Resolving SBS stream via WTF-1 / WTF-2 / Vidify / Fallback failover: TMDB ${tmdbId}, TV: ${isTv}`);
      
      // 1. Try WTF-1
      try {
        const decrypted = await getWtfStreamUrl(tmdbId, 'wtf-1', null, isTv, season, episode);
        if (decrypted && decrypted.ok && decrypted.data?.stream?.url) {
          const streamUrl = decrypted.data.stream.url;
          const refererUrl = `https://vidsrc.wtf/`;
          const originUrl = 'https://vidsrc.wtf';
          const proxiedUrl = `http://localhost:8000/local-proxy?url=${encodeURIComponent(streamUrl)}&referer=${encodeURIComponent(refererUrl)}&origin=${encodeURIComponent(originUrl)}`;
          return res.json(rewriteLocalhostUrls({
            sources: [{
              url: proxiedUrl,
              quality: 'auto',
              isM3U8: true
            }],
            subtitles: []
          }, req));
        }
      } catch (err) {
        console.warn(`[Server] SBS resolve via WTF-1 failed: ${err.message}. Trying WTF-2...`);
      }
      
      // 2. Try WTF-2
      try {
        const decrypted = await getWtfStreamUrl(tmdbId, 'wtf-2', null, isTv, season, episode);
        if (decrypted && decrypted.ok && decrypted.data?.streams && decrypted.data.streams.length > 0) {
          const sources = decrypted.data.streams.map((stream, idx) => {
            const ref = stream.headers?.Referer || 'https://vidsrc.wtf/';
            const origin = new URL(stream.url).origin;
            const proxiedUrl = `http://localhost:8000/local-proxy?url=${encodeURIComponent(stream.url)}&referer=${encodeURIComponent(ref)}&origin=${encodeURIComponent(origin)}`;
            return {
              url: proxiedUrl,
              quality: stream.language || `Stream ${idx + 1}`,
              isM3U8: stream.type === 'hls' || stream.url.includes('.m3u8')
            };
          });
          return res.json(rewriteLocalhostUrls({
            sources: sources,
            subtitles: []
          }, req));
        }
      } catch (err) {
        console.warn(`[Server] SBS resolve via WTF-2 failed: ${err.message}. Trying Vidify...`);
      }
      
      // 3. Try Vidify
      try {
        const pythonUrl = isTv
          ? `http://localhost:8000/vidify/tv/${tmdbId}/${season}/${episode}`
          : `http://localhost:8000/vidify/movie/${tmdbId}`;
        const res2 = await fetch(pythonUrl);
        if (res2.ok) {
          const result = await res2.json();
          return res.json(rewriteLocalhostUrls(result, req));
        }
      } catch (err) {
        console.warn(`[Server] SBS resolve via Vidify failed: ${err.message}. Trying Fallback...`);
      }
      
      // 4. Try Fallback
      try {
        const pythonUrl = isTv
          ? `http://localhost:8000/fallback/tv/${tmdbId}/${season}/${episode}`
          : `http://localhost:8000/fallback/movie/${tmdbId}`;
        const res2 = await fetch(pythonUrl);
        if (res2.ok) {
          const result = await res2.json();
          return res.json(rewriteLocalhostUrls(result, req));
        }
      } catch (err) {
        console.warn(`[Server] SBS resolve via Fallback failed: ${err.message}`);
      }
      
      throw new Error("All failover streams for VidSrc SBS failed");
    } catch (err) {
      console.error(`[Server] SBS resolution failed:`, err.message);
      return res.status(500).json({ error: `vidsrc-sbs resolution failed: ${err.message}` });
    }
  }



  // universal / auto failover: try VidSrc PM first, then VidSrc fallback, then Vidify
  if (activeServer === 'auto') {
    try {
      const pythonUrl = type === 'tv'
        ? `http://localhost:8000/vidsrc-pm/tv/${tmdbId}/${season}/${episode}`
        : `http://localhost:8000/vidsrc-pm/movie/${tmdbId}`;
      console.log(`[Server] Universal: Trying Python VidSrc PM: ${pythonUrl}`);
      const res2 = await fetch(pythonUrl);
      if (res2.ok) {
        const result = await res2.json();
        return res.json(rewriteLocalhostUrls(result, req));
      }
    } catch (err) {
      console.warn(`[Server] Universal: VidSrc PM fallback failed: ${err.message}`);
    }

    try {
      const pythonUrl = type === 'tv'
        ? `http://localhost:8000/fallback/tv/${tmdbId}/${season}/${episode}`
        : `http://localhost:8000/fallback/movie/${tmdbId}`;
      console.log(`[Server] Universal: Falling back to Python VidSrc: ${pythonUrl}`);
      const res2 = await fetch(pythonUrl);
      if (res2.ok) {
        const result = await res2.json();
        return res.json(rewriteLocalhostUrls(result, req));
      }
    } catch (err) {
      console.warn(`[Server] Universal: VidSrc fallback failed: ${err.message}`);
    }

    try {
      const pythonUrl = type === 'tv'
        ? `http://localhost:8000/vidify/tv/${tmdbId}/${season}/${episode}`
        : `http://localhost:8000/vidify/movie/${tmdbId}`;
      console.log(`[Server] Universal: Falling back to Python Vidify: ${pythonUrl}`);
      const res2 = await fetch(pythonUrl);
      if (res2.ok) {
        const result = await res2.json();
        return res.json(rewriteLocalhostUrls(result, req));
      }
    } catch (err) {
      console.warn(`[Server] Universal: Vidify fallback failed: ${err.message}`);
    }

    return res.status(500).json({ error: "All localized stream fallbacks failed." });
  }

  // vidsrc: use the Python fallback scraper (extracts direct .m3u8 streams)
  if (activeServer === 'vidsrc') {
    try {
      const pythonUrl = type === 'tv'
        ? `http://localhost:8000/fallback/tv/${tmdbId}/${season}/${episode}`
        : `http://localhost:8000/fallback/movie/${tmdbId}`;
      console.log(`[Server] Calling Python VidSrc fallback: ${pythonUrl}`);
      const res2 = await fetch(pythonUrl);
      if (!res2.ok) {
        throw new Error(`Python fallback returned status ${res2.status}`);
      }
      const result = await res2.json();
      return res.json(rewriteLocalhostUrls(result, req));
    } catch (err) {
      console.warn(`[Server] VidSrc fallback failed: ${err.message}`);
      return res.status(500).json({ error: `VidSrc resolution failed: ${err.message}` });
    }
  }

  // vidify: use the Python Vidify scraper
  if (activeServer === 'vidify') {
    try {
      const pythonUrl = type === 'tv'
        ? `http://localhost:8000/vidify/tv/${tmdbId}/${season}/${episode}`
        : `http://localhost:8000/vidify/movie/${tmdbId}`;
      console.log(`[Server] Calling Python Vidify scraper: ${pythonUrl}`);
      const res2 = await fetch(pythonUrl);
      if (!res2.ok) {
        throw new Error(`Python Vidify scraper returned status ${res2.status}`);
      }
      const result = await res2.json();
      return res.json(rewriteLocalhostUrls(result, req));
    } catch (err) {
      console.warn(`[Server] Vidify scraper failed: ${err.message}`);
      return res.status(500).json({ error: `Vidify resolution failed: ${err.message}` });
    }
  }
  
  // Handle explicit vidlink-pro / vixsrc / 2embed / vidzee requests on Express
  if (activeServer === 'vidlink-pro') {
    try {
      console.log(`[Server] Resolving VidLink Pro for TMDB-${tmdbId}...`);
      const encDecBase = config?.gateways?.enc_dec || 'https://enc-dec.app';
      const vidlinkBase = config?.gateways?.vidlink || 'https://vidlink.pro';
      
      const encUrl = `${encDecBase}/api/enc-vidlink?text=${encodeURIComponent(String(tmdbId))}`;
      const encRes = await axios.get(encUrl, { timeout: 10000 });
      const encodedTmdb = encRes.data?.result;
      if (!encodedTmdb) throw new Error("Encryption failed");

      const apiUrl = type === 'tv'
        ? `${vidlinkBase}/api/b/tv/${encodedTmdb}/${season}/${episode}?multiLang=0`
        : `${vidlinkBase}/api/b/movie/${encodedTmdb}?multiLang=0`;

      console.log(`[Server] Fetching VidLink stream: ${apiUrl}`);
      const apiRes = await axios.get(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
          'Referer': vidlinkBase
        },
        timeout: 15000
      });

      const sources = [];
      if (apiRes.data.stream && apiRes.data.stream.playlist) {
        sources.push({
          url: apiRes.data.stream.playlist,
          quality: 'auto',
          isM3U8: apiRes.data.stream.playlist.includes('.m3u8')
        });
      }
      if (sources.length === 0 && apiRes.data.stream && apiRes.data.stream.qualities) {
        for (const [quality, fileObj] of Object.entries(apiRes.data.stream.qualities)) {
          if (fileObj && fileObj.url) {
            sources.push({
              url: fileObj.url,
              quality: `${quality}p`,
              isM3U8: fileObj.url.includes('.m3u8')
            });
          }
        }
      }

      const subtitles = [];
      if (apiRes.data.subtitles && Array.isArray(apiRes.data.subtitles)) {
        for (const sub of apiRes.data.subtitles) {
          if (sub.url) {
            subtitles.push({
              url: sub.url,
              lang: sub.language || 'Unknown'
            });
          }
        }
      }

      return res.json(rewriteLocalhostUrls({ sources, subtitles }, req));
    } catch (err) {
      console.error(`[Server] VidLink Pro resolution failed:`, err.message);
      return res.status(500).json({ error: `vidlink-pro failed: ${err.message}` });
    }
  }

  if (activeServer === 'vixsrc') {
    try {
      console.log(`[Server] Resolving VixSrc for TMDB-${tmdbId}...`);
      const vixsrcBase = config?.gateways?.vixsrc || 'https://vixsrc.to';
      const apiUrl = type === 'tv'
        ? `${vixsrcBase}/api/tv/${tmdbId}/${season}/${episode}`
        : `${vixsrcBase}/api/movie/${tmdbId}`;

      const apiRes = await axios.get(apiUrl, {
        headers: { 'Referer': vixsrcBase + '/' },
        timeout: 10000
      });
      if (!apiRes.data || !apiRes.data.src) throw new Error("Failed to get VixSrc embed path");

      const embedUrl = `${vixsrcBase}${apiRes.data.src}`;
      const embedRes = await axios.get(embedUrl, {
        headers: { 'Referer': vixsrcBase + '/' },
        timeout: 10000
      });

      const html = embedRes.data;
      const streamsMatch = html.match(/window\.streams\s*=\s*(\[[^\]]+\])/);
      const tokenMatch = html.match(/'token':\s*'([^']*)'/);
      const expiresMatch = html.match(/'expires':\s*'([^']*)'/);

      if (!streamsMatch || !tokenMatch || !expiresMatch) {
        throw new Error("Obfuscated window.streams parameters not found");
      }

      const streams = JSON.parse(streamsMatch[1]);
      const token = tokenMatch[1];
      const expires = expiresMatch[1];

      const sources = streams.map((s) => {
        const l = new URL(s.url);
        l.searchParams.append("token", token);
        l.searchParams.append("expires", expires);
        l.searchParams.append("asn", "");
        l.searchParams.append("h", "1");
        return {
          url: l.toString(),
          quality: s.name || 'Server',
          isM3U8: true
        };
      });

      return res.json(rewriteLocalhostUrls({ sources, subtitles: [] }, req));
    } catch (err) {
      console.error(`[Server] VixSrc resolution failed:`, err.message);
      return res.status(500).json({ error: `vixsrc failed: ${err.message}` });
    }
  }

  if (activeServer === '2embed') {
    try {
      console.log(`[Server] Resolving 2Embed/Videasy for TMDB-${tmdbId}...`);
      const wingsBase = 'https://api.wingsdatabase.com';
      const tmdbIdNum = parseInt(tmdbId);
      const isTv = type === 'tv';

      const fetchVideasyProxy = async (url) => {
        const proxyUrl = `http://localhost:8000/local-proxy?url=${encodeURIComponent(url)}&referer=${encodeURIComponent('https://player.videasy.to/')}&origin=${encodeURIComponent('https://player.videasy.to')}`;
        const sRes = await axios.get(proxyUrl, {
          headers: {
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
          }
        });
        return sRes.data;
      };

      const seedData = await fetchVideasyProxy(`${wingsBase}/seed?mediaId=${tmdbId}`);
      const seed = seedData?.seed;
      if (!seed) throw new Error("Failed to retrieve seed from wingsdatabase");

      let movieTitle = title || 'Movie';
      let releaseYear = '2024';
      let imdbId = '';

      try {
        const tmdbApiKey = '8265bd1679663a7ea12ac168da84d2e8';
        const tmdbUrl = isTv
          ? `https://api.themoviedb.org/3/tv/${tmdbId}/external_ids?api_key=${tmdbApiKey}`
          : `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${tmdbApiKey}`;
        const tmdbRes = await axios.get(tmdbUrl, { timeout: 8000 });
        if (tmdbRes.data) {
          imdbId = tmdbRes.data.imdb_id || '';
          movieTitle = tmdbRes.data.title || tmdbRes.data.name || movieTitle;
          const dateStr = tmdbRes.data.release_date || tmdbRes.data.first_air_date || '';
          if (dateStr) releaseYear = dateStr.split('-')[0];
        }

        if (isTv && !imdbId) {
          const infoUrl = `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${tmdbApiKey}`;
          const infoRes = await axios.get(infoUrl, { timeout: 8000 });
          if (infoRes.data) {
            movieTitle = infoRes.data.name || movieTitle;
            const dateStr = infoRes.data.first_air_date || '';
            if (dateStr) releaseYear = dateStr.split('-')[0];
          }
        }
      } catch (e) {
        console.warn("[Server] Failed to fetch TMDB details for 2Embed:", e.message);
         const mirrorEndpoints = [
        '/neon2/sources-with-title',
        '/cdn/sources-with-title',
        '/ym/sources-with-title',
        '/jett/sources-with-title',
        '/m4uhd/sources-with-title',
        '/hdmovie/sources-with-title'
      ];

      let decryptedJson = null;
      let lastError = null;

      for (const endpoint of mirrorEndpoints) {
        try {
          console.log(`[Server] Trying 2Embed mirror endpoint: ${endpoint}...`);
          const query = `?title=${encodeURIComponent(movieTitle)}&mediaType=${isTv ? 'TV Series' : 'Movie'}&year=${releaseYear}&tmdbId=${tmdbId}&imdbId=${imdbId}&enc=2&seed=${seed}${isTv ? `&seasonId=${season}&episodeId=${episode}` : ''}`;
          const sourcesUrl = `${wingsBase}${endpoint}${query}`;

          const sourcesData = await fetchVideasyProxy(sourcesUrl);
          const rawText = typeof sourcesData === 'string' ? sourcesData : JSON.stringify(sourcesData);
          if (!rawText || rawText.includes("Attention Required") || rawText.includes("502 Bad Gateway") || rawText.includes("503 Service Unavailable") || rawText.includes("Cloudflare")) {
            throw new Error("Cloudflare block or bad gateway");
          }

          // Decryption
          const f = [1116352408, 1899447441, 3049323471, 3921009573, 961987163, 1508970993, 2453635748, 2870763221, 3624381080, 310598401, 607225278, 1426881987, 1925078388, 2162078206, 2614888103, 3248222580];
          const b = [109, 118, 109, 49]; // "mvm1"
          const h = (e) => (e * (e + 1) & 1) === 0;
          const I = (e) => (e * (e + 1) & 1) === 1;

          const w = (e) => {
            e >>>= 0;
            e ^= e >>> 16;
            e = Math.imul(e, 2246822507) >>> 0;
            e ^= e >>> 13;
            e = Math.imul(e, 3266489909) >>> 0;
            return (e ^= e >>> 16) >>> 0;
          };

          const v = (e, t) => {
            e >>>= 0;
            t &= 31;
            return t === 0 ? e >>> 0 : (e << t | e >>> 32 - t) >>> 0;
          };

          const pad = rawText.replace(/-/g, "+").replace(/_/g, "/").padEnd(4 * Math.ceil(rawText.length / 4), "=");
          const binary = Buffer.from(pad, 'base64');
          const o = new Uint8Array(binary);

          const getSAndAcc = (e, t) => {
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

          const a = getSAndAcc(seed, tmdbIdNum);
          const prng = new Uint8Array(o.length);
          let idx = 0;
          for (let e = 0; e < o.length; ) {
            const t = ((eStore, tVal) => {
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

          for (let e = 0; e < o.length; e++) o[e] ^= prng[e];
          for (let e = 0; e < b.length; e++) {
            if (o[e] !== b[e]) throw Error("decrypt failed: bad seed or tampered payload");
          }

          const payload = o.subarray(b.length);
          decryptedJson = Buffer.from(payload).toString('utf8');
          console.log(`[Server] 2Embed mirror ${endpoint} resolved successfully!`);
          break;
        } catch (e) {
          console.warn(`[Server] 2Embed mirror ${endpoint} failed:`, e.message);
          lastError = e;
        }
      }

      if (!decryptedJson) {
        throw lastError || new Error("All 2Embed mirrors failed to resolve");
      }

      const resultObj = JSON.parse(decryptedJson);edJson);

      const sources = (resultObj.sources || []).map((s) => ({
        url: s.url,
        quality: s.name || s.quality || 'Server',
        isM3U8: s.url.includes('.m3u8') || s.type === 'm3u8'
      }));

      const subtitles = (resultObj.subtitles || []).map((sub) => ({
        url: sub.url,
        lang: sub.label || sub.lang || 'English'
      }));

      return res.json(rewriteLocalhostUrls({ sources, subtitles }, req));
    } catch (err) {
      console.error(`[Server] 2Embed resolution failed:`, err.message);
      return res.status(500).json({ error: `2embed failed: ${err.message}` });
    }
  }

  if (activeServer === 'vidzee') {
    try {
      console.log(`[Server] Resolving Vidzee for TMDB-${tmdbId}...`);
      
      const keyRes = await axios.get('https://core.vidzee.wtf/api-key', { timeout: 8000 });
      const encryptedKey = keyRes.data;
      
      const HARDCODED_KEY_HEX = "c4a8f1d7e2b9a6c3d0f5e8a1b7c4d9e2";
      const keyHash = crypto.createHash('sha256').update(HARDCODED_KEY_HEX).digest();
      const binaryKey = Buffer.from(encryptedKey, 'base64');
      const iv = binaryKey.subarray(0, 12);
      const tag = binaryKey.subarray(12, 28);
      const ciphertext = binaryKey.subarray(28);
      
      const decipher = crypto.createDecipheriv('aes-256-gcm', keyHash, iv);
      decipher.setAuthTag(tag);
      const decryptedKey = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');

      const referer = type === 'tv'
        ? `https://player.vidzee.wtf/embed/tv/${tmdbId}/${season}/${episode}`
        : `https://player.vidzee.wtf/embed/movie/${tmdbId}`;
      const sources = [];
      const serversToTest = [3, 4, 5, 7];
      
      for (const sr of serversToTest) {
        let url = `https://player.vidzee.wtf/api/server?id=${tmdbId}&sr=${sr}`;
        if (type === 'tv') {
          url += `&ss=${season}&ep=${episode}`;
        }
        try {
          const resSrv = await axios.get(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              'Referer': referer,
              'Accept': 'application/json'
            },
            timeout: 8000
          });
          if (resSrv.data && resSrv.data.url && resSrv.data.url.length > 0) {
            for (const item of resSrv.data.url) {
              const decoded = Buffer.from(item.link, 'base64').toString('binary');
              const parts = decoded.split(':');
              if (parts.length === 2) {
                const linkIv = Buffer.from(parts[0], 'base64');
                const linkCiphertext = Buffer.from(parts[1], 'base64');
                const paddedKey = Buffer.alloc(32);
                Buffer.from(decryptedKey).copy(paddedKey, 0, 0, 32);
                
                const linkDecipher = crypto.createDecipheriv('aes-256-cbc', paddedKey, linkIv);
                const decryptedStream = Buffer.concat([linkDecipher.update(linkCiphertext), linkDecipher.final()]).toString('utf8');
                
                if (decryptedStream && decryptedStream.startsWith('http')) {
                  const langLabel = item.lang ? ` [${item.lang}]` : '';
                  const providerLabel = resSrv.data.provider || item.name || `Server ${sr}`;
                  sources.push({
                    url: decryptedStream,
                    quality: `${providerLabel}${langLabel}`,
                    isM3U8: decryptedStream.includes('.m3u8')
                  });
                }
              }
            }
          }
        } catch (errSrv) {
          console.warn(`[Server] Vidzee server ${sr} fetch failed:`, errSrv.message);
        }
      }

      if (sources.length === 0) throw new Error("No streams resolved");
      return res.json(rewriteLocalhostUrls({ sources, subtitles: [] }, req));
    } catch (err) {
      console.error(`[Server] Vidzee resolution failed:`, err.message);
      return res.status(500).json({ error: `vidzee failed: ${err.message}` });
    }
  }

  return res.status(404).json({ error: 'Unknown server option.' });
});



// Subtitles Integration Routes

// 1. YIFY Subtitles Download & Unzip
app.get('/movies/yts-subtitles/download', async (req, res) => {
  const { link } = req.query;
  if (!link) return res.status(400).send('Missing link parameter');
  
  console.log(`[Server] YTS Subtitles Download link: ${link}`);
  try {
    const detailRes = await fetch(`https://yifysubtitles.ch${link}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    });
    if (!detailRes.ok) throw new Error(`Detail page returned status ${detailRes.status}`);
    const html = await detailRes.text();
    
    const dataLinkMatch = html.match(/class="btn-icon download-subtitle"\s+href="([^"]*)"/);
    if (!dataLinkMatch) throw new Error('Could not find download-subtitle href attribute in page HTML');
    
    const zipPath = dataLinkMatch[1];
    const zipUrl = `https://yifysubtitles.ch${zipPath}`;
    console.log(`[Server] Decoded ZIP URL: ${zipUrl}`);
    
    const pythonUrl = `http://localhost:8000/unzip-srt?url=${encodeURIComponent(zipUrl)}&referer=${encodeURIComponent(`https://yifysubtitles.ch${link}`)}`;
    const unzipRes = await fetch(pythonUrl);
    if (!unzipRes.ok) {
      const errorText = await unzipRes.text();
      throw new Error(`Python unzipper error: ${errorText}`);
    }
    
    const { filename, content } = await unzipRes.json();
    console.log(`[Server] Unzipped file: ${filename}, size: ${content.length} characters`);
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Content-Type', 'text/vtt');
    
    let vttContent = content;
    const isMicroDvd = /^\s*\{\d+\}\{\d+\}/.test(content);
    
    if (isMicroDvd) {
      const fps = 23.976;
      const lines = content.split('\n');
      const vttLines = ['WEBVTT', ''];
      
      lines.forEach((line) => {
        const match = line.match(/^\{(\d+)\}\{(\d+)\}(.*)/);
        if (match) {
          const startSec = parseInt(match[1]) / fps;
          const endSec = parseInt(match[2]) / fps;
          
          const formatTime = (seconds) => {
            const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
            const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
            const s = Math.floor(seconds % 60).toString().padStart(2, '0');
            const ms = Math.floor((seconds % 1) * 1000).toString().padStart(3, '0');
            return `${h}:${m}:${s}.${ms}`;
          };
          
          vttLines.push(`${formatTime(startSec)} --> ${formatTime(endSec)}`);
          vttLines.push(match[3].replace(/\|/g, '\n').trim());
          vttLines.push('');
        }
      });
      vttContent = vttLines.join('\n');
    } else if (!vttContent.trim().startsWith('WEBVTT')) {
      let cleanSrt = vttContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      vttContent = 'WEBVTT\n\n' + cleanSrt.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    }
    
    res.send(vttContent);
  } catch (err) {
    console.error(`[Server] YTS Subtitles Download error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// 2. YIFY Subtitles Scraper (Movies)
app.get('/movies/yts-subtitles/:imdbId', async (req, res) => {
  const { imdbId } = req.params;
  console.log(`[Server] YTS Subtitles Search: ${imdbId}`);
  try {
    const response = await fetch(`https://yifysubtitles.ch/movie-imdb/${imdbId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    });
    if (!response.ok) {
      throw new Error(`YTS Subtitles returned status ${response.status}`);
    }
    const html = await response.text();
    
    const rowRegex = /<tr[^>]*data-id="(\d+)"[^>]*>([\s\S]*?)<\/tr>/g;
    const subs = [];
    let match;
    
    while ((match = rowRegex.exec(html)) !== null) {
      const rowHtml = match[2];
      
      const langMatch = rowHtml.match(/<span class="sub-lang">([^<]*)<\/span>/);
      const language = langMatch ? langMatch[1].trim() : 'Unknown';
      
      const ratingMatch = rowHtml.match(/<span class="label[^"]*">([^<]*)<\/span>/);
      const rating = ratingMatch ? parseInt(ratingMatch[1].trim()) || 0 : 0;
      
      const linkMatch = rowHtml.match(/href="(\/subtitles\/[^"]*)"/);
      const link = linkMatch ? linkMatch[1] : '';
      
      const nameMatch = rowHtml.match(/<a href="\/subtitles\/[^"]*">([\s\S]*?)<\/a>/);
      let name = '';
      if (nameMatch) {
        name = nameMatch[1].replace(/<span[^>]*>([\s\S]*?)<\/span>/g, '').trim();
        name = name.replace(/\s+/g, ' ');
      }
      
      if (link && language) {
        subs.push({
          language,
          rating,
          link,
          name
        });
      }
    }
    
    res.json(subs);
  } catch (err) {
    console.error(`[Server] YTS Subtitles Search error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// Helper to fetch the dynamic config key from GitHub config
let remoteConfigCache = null;
let lastConfigFetchTime = 0;

async function getOpenSubtitlesApiKey() {
  const now = Date.now();
  // Cache config for 5 minutes to prevent GitHub rate-limiting
  if (remoteConfigCache && (now - lastConfigFetchTime < 5 * 60 * 1000)) {
    return remoteConfigCache.subtitles?.opensubtitles_api_key || 'JkKADcTEWRQzVl95qI2UtAXbMgJhH44R';
  }
  try {
    const res = await fetch('https://raw.githubusercontent.com/Extroos/MovieTester123/main/config.json');
    if (res.ok) {
      remoteConfigCache = await res.json();
      lastConfigFetchTime = now;
      console.log('[Server] Successfully fetched dynamic remote config. API Key found:', remoteConfigCache.subtitles?.opensubtitles_api_key ? 'Yes' : 'No');
      return remoteConfigCache.subtitles?.opensubtitles_api_key || 'JkKADcTEWRQzVl95qI2UtAXbMgJhH44R';
    }
  } catch (err) {
    console.warn('[Server] Failed to fetch remote config:', err.message);
  }
  return 'JkKADcTEWRQzVl95qI2UtAXbMgJhH44R';
}

// OpenSubtitles Search (Movies and TV Shows) - Powered by Stremio Keyless Proxy
app.get('/movies/opensubtitles/:tmdbId', async (req, res) => {
  const { tmdbId } = req.params;
  const { type = 'movie', season = '', episode = '', lang = 'en' } = req.query;
  const localPort = process.env.PORT || 3001;
  console.log(`[Server] OpenSubtitles Search: ${tmdbId}, type=${type}, S=${season}E${episode}, lang=${lang}`);
  
  try {
    // 1. Resolve TMDB ID to IMDB ID if needed
    let imdbId = tmdbId;
    const tmdbApiKey = '8265bd1679663a7ea12ac168da84d2e8';
    
    if (!tmdbId.startsWith('tt')) {
      const tmdbUrl = type === 'tv'
        ? `https://api.themoviedb.org/3/tv/${tmdbId}/external_ids?api_key=${tmdbApiKey}`
        : `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${tmdbApiKey}`;
      
      const tmdbRes = await fetch(tmdbUrl);
      if (tmdbRes.ok) {
        const tmdbData = await tmdbRes.json();
        imdbId = tmdbData.imdb_id || tmdbId;
      }
    }
    
    if (!imdbId.startsWith('tt')) {
      throw new Error(`Could not resolve IMDB ID for TMDB ID: ${tmdbId}`);
    }
    
    // 2. Query Stremio OpenSubtitles v3 Proxy
    let stremioUrl = '';
    if (type === 'tv' || type === 'series' || (season && episode)) {
      stremioUrl = `https://opensubtitles-v3.strem.io/subtitles/series/${imdbId}:${season || 1}:${episode || 1}.json`;
    } else {
      stremioUrl = `https://opensubtitles-v3.strem.io/subtitles/movie/${imdbId}.json`;
    }
    
    console.log(`[Server] Fetching from Stremio proxy: ${stremioUrl}`);
    const response = await fetch(stremioUrl);
    if (!response.ok) {
      throw new Error(`Stremio proxy returned status ${response.status}`);
    }
    
    const json = await response.json();
    const subtitles = json.subtitles || [];
    
    // 3. Map Stremio subtitles to React expected format
    const results = [];
    const threeToTwoMap = {
      eng: 'en', ara: 'ar', spa: 'es', por: 'pt', kor: 'ko', hin: 'hi', ger: 'de', fre: 'fr', ita: 'it', chi: 'zh', tur: 'tr', rus: 'ru',
      en: 'en', ar: 'ar', es: 'es', pt: 'pt', ko: 'ko', hi: 'hi', de: 'de', fr: 'fr', it: 'it', zh: 'zh', tr: 'tr', ru: 'ru'
    };
    
    const targetLangs = lang ? lang.split(',').map(l => l.trim().toLowerCase()) : [];
    
    for (const sub of subtitles) {
      const subLang3 = (sub.lang || '').toLowerCase();
      const subLang2 = threeToTwoMap[subLang3] || subLang3.substring(0, 2);
      
      if (targetLangs.length > 0 && !targetLangs.includes(subLang2) && !targetLangs.includes(subLang3)) {
        continue;
      }
      
      const dlUrl = `http://localhost:${localPort}/subtitles/convert?url=${encodeURIComponent(sub.url)}`;
      
      results.push({
        link: dlUrl,
        language: subLang2,
        name: `${sub.lang?.toUpperCase() || 'SUB'} - Release ${sub.id || 'Subtitle'}`
      });
    }
    
    res.json(results);
  } catch (err) {
    console.error(`[Server] OpenSubtitles Search error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// OpenSubtitles Download
app.get('/movies/opensubtitles/download', async (req, res) => {
  const { fileId } = req.query;
  if (!fileId) return res.status(400).send('Missing fileId parameter');
  
  console.log(`[Server] OpenSubtitles Download fileId: ${fileId}`);
  try {
    const apiKey = await getOpenSubtitlesApiKey();
    const dlApiUrl = 'https://api.opensubtitles.com/api/v1/download';
    const response = await fetch(dlApiUrl, {
      method: 'POST',
      headers: {
        'Api-Key': apiKey,
        'Content-Type': 'application/json',
        'User-Agent': 'CineMovie/1.0'
      },
      body: JSON.stringify({ file_id: parseInt(fileId) })
    });
    
    if (!response.ok) {
      throw new Error(`OpenSubtitles Download API returned status ${response.status}`);
    }
    
    const dlJson = await response.json();
    const dlLink = dlJson.link;
    if (!dlLink) throw new Error('No download link returned by OpenSubtitles');
    
    console.log(`[Server] Downloading subtitle file: ${dlLink}`);
    const subFileRes = await fetch(dlLink, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });
    if (!subFileRes.ok) throw new Error(`Failed to fetch subtitle file: ${subFileRes.statusText}`);
    
    const text = await subFileRes.text();
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Content-Type', 'text/vtt');
    
    let vttContent = text;
    if (dlLink.toLowerCase().includes('.srt') || !text.trim().startsWith('WEBVTT')) {
      let cleanSrt = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      vttContent = 'WEBVTT\n\n' + cleanSrt.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    }
    
    res.send(vttContent);
  } catch (err) {
    console.error(`[Server] OpenSubtitles Download error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});


app.get('/subtitles/convert', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('Missing url parameter');
  
  try {
    const subRes = await fetch(url);
    if (!subRes.ok) throw new Error(`Failed to fetch subtitle: ${subRes.status}`);
    const content = await subRes.text();
    
    let vttContent = content;
    if (!vttContent.trim().startsWith('WEBVTT')) {
      let cleanSrt = vttContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      vttContent = 'WEBVTT\n\n' + cleanSrt.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    }
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Content-Type', 'text/vtt');
    res.send(vttContent);
  } catch (err) {
    console.error(`[Server] Subtitle convert error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// 3. OpenSubtitles Login
app.post('/subtitles/opensubtitles/login', async (req, res) => {
  const { username, password } = req.body;
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) return res.status(400).send('Missing Api-Key header');
  if (!username || !password) return res.status(400).send('Missing credentials');
  
  console.log(`[Server] OpenSubtitles Login for user: ${username}`);
  try {
    const loginRes = await fetch('https://api.opensubtitles.org/api/v1/login', {
      method: 'POST',
      headers: {
        'Api-Key': apiKey,
        'User-Agent': 'CineMovie v1.4.0',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });
    
    if (!loginRes.ok) {
      const errorText = await loginRes.text();
      throw new Error(`OpenSubtitles Login failed with status ${loginRes.status}: ${errorText}`);
    }
    
    const loginData = await loginRes.json();
    res.json(loginData);
  } catch (err) {
    console.error(`[Server] OpenSubtitles Login error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// 4. OpenSubtitles Search
app.get('/subtitles/opensubtitles/search', async (req, res) => {
  const { tmdbId, type, season, episode, languages } = req.query;
  const apiKey = req.headers['x-api-key'];
  const token = req.headers['x-auth-token'];
  
  if (!apiKey) return res.status(400).send('Missing Api-Key header');
  if (!tmdbId) return res.status(400).send('Missing tmdbId query param');
  
  console.log(`[Server] OpenSubtitles Search: TMDB ID ${tmdbId}, Type: ${type}, Languages: ${languages}`);
  try {
    const queryParams = new URLSearchParams();
    queryParams.append('tmdb_id', tmdbId);
    queryParams.append('languages', languages || 'en');
    queryParams.append('type', type === 'tv' ? 'episode' : 'movie');
    
    if (type === 'tv' && season && episode) {
      queryParams.append('season_number', season);
      queryParams.append('episode_number', episode);
    }
    
    const searchUrl = `https://api.opensubtitles.org/api/v1/subtitles?${queryParams.toString()}`;
    const headers = {
      'Api-Key': apiKey,
      'User-Agent': 'CineMovie v1.4.0',
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const osRes = await fetch(searchUrl, { headers });
    if (!osRes.ok) {
      const errorText = await osRes.text();
      throw new Error(`OpenSubtitles returned status ${osRes.status}: ${errorText}`);
    }
    
    const osData = await osRes.json();
    const subs = (osData.data || []).map(item => {
      const file = item.attributes.files?.[0];
      return {
        id: file ? file.file_id : null,
        fileName: file ? file.file_name : item.attributes.release,
        language: item.attributes.language,
        release: item.attributes.release,
        rating: item.attributes.ratings || 0,
        votes: item.attributes.votes || 0
      };
    }).filter(s => s.id !== null);
    
    res.json(subs);
  } catch (err) {
    console.error(`[Server] OpenSubtitles Search error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// 5. OpenSubtitles Download
app.get('/subtitles/opensubtitles/download', async (req, res) => {
  const { fileId } = req.query;
  const apiKey = req.headers['x-api-key'];
  const token = req.headers['x-auth-token'];
  
  if (!apiKey) return res.status(400).send('Missing Api-Key header');
  if (!token) return res.status(400).send('Missing Auth-Token header');
  if (!fileId) return res.status(400).send('Missing fileId parameter');
  
  console.log(`[Server] OpenSubtitles Download request for File ID: ${fileId}`);
  try {
    const dlLinkRes = await fetch('https://api.opensubtitles.org/api/v1/download', {
      method: 'POST',
      headers: {
        'Api-Key': apiKey,
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'CineMovie v1.4.0',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ file_id: parseInt(fileId) })
    });
    
    if (!dlLinkRes.ok) {
      const errorText = await dlLinkRes.text();
      throw new Error(`OpenSubtitles Download request returned ${dlLinkRes.status}: ${errorText}`);
    }
    
    const dlLinkData = await dlLinkRes.json();
    const downloadUrl = dlLinkData.link;
    console.log(`[Server] OpenSubtitles Download link resolved: ${downloadUrl}`);
    
    const pythonProxyUrl = `http://localhost:8000/local-proxy?url=${encodeURIComponent(downloadUrl)}&referer=${encodeURIComponent('https://opensubtitles.org/')}&origin=${encodeURIComponent('https://opensubtitles.org')}`;
    console.log(`[Server] Routing OpenSubtitles download through Python proxy: ${downloadUrl}`);
    const subRes = await fetch(pythonProxyUrl);
    if (!subRes.ok) throw new Error(`Failed to download subtitle file via proxy: ${subRes.status}`);
    const content = await subRes.text();
    
    let vttContent = content;
    if (!vttContent.trim().startsWith('WEBVTT')) {
      let cleanSrt = vttContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      vttContent = 'WEBVTT\n\n' + cleanSrt.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    }
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Content-Type', 'text/vtt');
    res.send(vttContent);
  } catch (err) {
    console.error(`[Server] OpenSubtitles Download error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});



app.get('/health', (req, res) => {
  res.json({ status: 'ok', server: 'CineMovie Express Backend' });
});

app.get('/check-version', (req, res) => {
  res.json({ version: '1.1.4' });
});

app.get('/home', (req, res) => {
  res.json({ status: 'ok', message: 'CineMovie Express Backend Home' });
});

app.listen(port, () => {
  console.log(`[Server] Streaming local server running on http://localhost:${port}`);
});
