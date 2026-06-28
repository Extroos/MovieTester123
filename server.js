import express from 'express';
import cors from 'cors';
import nacl from 'tweetnacl';
import { Readable } from 'stream';
import axios from 'axios';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import fs from 'fs';
import vm from 'vm';

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

app.use(cors());
app.use(express.json());

// WTF Decryption and Resolution Configuration
const wtfProxyBase = "http://localhost:8000/local-proxy";

async function fetchWtfProxy(url, headers = {}, refererUrl = 'https://vidsrc.wtf/') {
  const fullUrl = `${wtfProxyBase}?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(refererUrl)}&origin=${encodeURIComponent('https://vidsrc.wtf')}`;
  const res = await axios.get(fullUrl, { headers, validateStatus: () => true });
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
          return hash.buffer;
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



function formatVidlinkResponse(data, gateway = 'https://vidlink.pro') {
  if (!data?.stream) {
    throw new Error("No stream object in Vidlink response");
  }

  const sources = [];
  const cleanGateway = gateway.replace(/\/$/, '');
  const referer = `${cleanGateway}/`;
  const origin = cleanGateway;

  if (data.stream.playlist) {
    const originalPlaylist = data.stream.playlist;
    const proxiedPlaylist = `http://localhost:8000/local-proxy?url=${encodeURIComponent(originalPlaylist)}&referer=${encodeURIComponent(referer)}&origin=${encodeURIComponent(origin)}`;
    sources.push({
      url: proxiedPlaylist,
      quality: '1080',
      isM3U8: data.stream.type === 'hls' || originalPlaylist.includes('.m3u8')
    });
  } else if (data.stream.qualities) {
    // Direct MP4 file stream type with multiple resolutions
    Object.entries(data.stream.qualities).forEach(([quality, qObj]) => {
      if (qObj && qObj.url) {
        const proxiedUrl = `http://localhost:8000/local-proxy?url=${encodeURIComponent(qObj.url)}&referer=${encodeURIComponent(referer)}&origin=${encodeURIComponent(origin)}`;
        sources.push({
          url: proxiedUrl,
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
  const vidlinkSubs = captionsList.map(c => {
    let subUrl = c.url || '';
    if (subUrl && !subUrl.startsWith('http://') && !subUrl.startsWith('https://')) {
      if (subUrl.startsWith('//')) {
        subUrl = `https:${subUrl}`;
      } else if (subUrl.startsWith('/')) {
        subUrl = `${cleanGateway}${subUrl}`;
      } else {
        subUrl = `${cleanGateway}/${subUrl}`;
      }
    }
    return {
      url: subUrl,
      lang: c.language || 'Unknown'
    };
  });
  
  return {
    sources: sources,
    subtitles: vidlinkSubs
  };
}

async function resolveVidlinkStream(tmdbId, type, season = 1, episode = 1) {
  const url = type === 'tv'
    ? `http://localhost:8000/tv/${tmdbId}/${season}/${episode}`
    : `http://localhost:8000/movie/${tmdbId}`;
    
  console.log(`[Express] Calling Python resolver: ${url}`);
  
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Python resolver returned status ${res.status}`);
  }
  const data = await res.json();
  return formatVidlinkResponse(data);
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

// Local Residential CORS Proxy (Delegates to Python curl_cffi proxy on port 8000)
app.get('/local-proxy', async (req, res) => {
  const targetUrl = req.query.url;
  const referer = req.query.referer || 'https://vidlink.pro/';
  const origin = req.query.origin || 'https://vidlink.pro';
  
  if (!targetUrl) {
    return res.status(400).send('Missing url parameter');
  }
  
  const abortController = new AbortController();
  
  req.on('close', () => {
    if (!res.writableFinished) {
      console.log(`[Express Proxy] Client disconnected prematurely, aborting background stream download for: ${targetUrl}`);
      abortController.abort();
    }
  });

  try {
    const pythonProxyUrl = `http://localhost:8000/local-proxy?url=${encodeURIComponent(targetUrl)}&referer=${encodeURIComponent(referer)}&origin=${encodeURIComponent(origin)}`;
    console.log(`[Express Proxy] Forwarding to Python: ${targetUrl}`);
    
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
      timeout: 30000,
      signal: abortController.signal,
      validateStatus: () => true // Forward all status codes directly
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
    console.error(`[Express Proxy] Error forwarding to Python:`, e.message);
    res.status(500).send(e.message);
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
  const { tmdbId } = req.params;
  const { type = 'movie', s = 1, e = 1, title, server = 'auto', sub_server, raw } = req.query;
  const season = parseInt(s);
  const episode = parseInt(e);
  
  console.log(`[Server] Watch request: ID ${tmdbId}, Type: ${type}, S: ${season}, E: ${episode}, Server: ${server}`);
  
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

  // Handle explicit vidsrc-pm request
  if (server === 'vidsrc-pm') {
    try {
      const pythonUrl = type === 'tv'
        ? `http://localhost:8000/vidsrc-pm/tv/${tmdbId}/${season}/${episode}`
        : `http://localhost:8000/vidsrc-pm/movie/${tmdbId}`;
      const res2 = await fetch(pythonUrl);
      if (!res2.ok) {
        throw new Error(`Python vidsrc-pm API returned status ${res2.status}`);
      }
      const result = await res2.json();
      return res.json(rewriteLocalhostUrls(result, req));
    } catch (err) {
      return res.status(500).json({ error: `vidsrc-pm failed: ${err.message}` });
    }
  }

  // Handle explicit test-server request on Web/Desktop
  // Handle explicit test-server request on Web/Desktop (Native Node.js execution)
  // Handle explicit test-server request on Web/Desktop (Native Node.js execution with robust failover)
  if (server === 'test-server') {
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
            
            // Fallback: If subtitles list is empty, fetch YTS subtitles on PC
            if (subtitles.length === 0) {
              try {
                let imdbId = streamData.imdb_id;
                if (!imdbId && tmdbId.toString().startsWith('tt')) {
                  imdbId = tmdbId;
                }
                if (!imdbId) {
                  const tmdbType = type === 'tv' ? 'tv' : 'movie';
                  const extRes = await fetch(`https://api.themoviedb.org/3/${tmdbType}/${tmdbId}/external_ids?api_key=15d2ea6d0dc1d476efbca3de7e9b73d2`);
                  if (extRes.ok) {
                    const extData = await extRes.json();
                    imdbId = extData.imdb_id;
                  }
                }
                if (imdbId && imdbId.startsWith('tt')) {
                  const localPort = process.env.PORT || 3001;
                  console.log(`[Server] Scraping YTS subtitles for PC resolution (IMDB: ${imdbId})...`);
                  const ytsRes = await fetch(`http://localhost:${localPort}/movies/yts-subtitles/${imdbId}`);
                  if (ytsRes.ok) {
                    const ytsSubs = await ytsRes.json();
                    for (const s of ytsSubs) {
                      subtitles.push({
                        url: `http://localhost:${localPort}/movies/yts-subtitles/download?link=${encodeURIComponent(s.link)}`,
                        lang: s.name ? `${s.language} (${s.name})` : s.language
                      });
                    }
                  }
                }
              } catch (ytsErr) {
                console.warn(`[Server] Failed to scrape YTS subtitles on PC:`, ytsErr.message);
              }
            }
            
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
  if (server === 'vidsrc-wtf-1' || server === 'vidsrc-wtf-2' || server === 'vidsrc-wtf-3' || server === 'vidsrc-wtf-4') {
    try {
      const isTv = type === 'tv';
      const apiType = server === 'vidsrc-wtf-2' ? 'wtf-2' : (server === 'vidsrc-wtf-4' ? 'wtf-4' : (server === 'vidsrc-wtf-3' ? 'wtf-3' : 'wtf-1'));
      console.log(`[Server] Resolving WTF stream: API type ${apiType}, TMDB ${tmdbId}, TV: ${isTv}`);
      
      if (apiType === 'wtf-1' || apiType === 'wtf-3') {
        // Expose all available WTF sub-servers to allow clean streams to be selected by quality options in the UI
        const baseQuery = `/meta/tmdb/watch/${tmdbId}?type=${type}&s=${season}&e=${episode}&server=${server}&raw=true`;
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
  if (server === 'vidsrc-fyi') {
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
  if (server === 'vidsrc-pk') {
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
  if (server === 'vidsrc-sbs') {
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

  // Map single-gateway server IDs to specific Vidlink domain gateways
  const GATEWAY_MAP = {
    'vidlink-pro': 'https://vidlink.pro',
    'vidlink-org': 'https://vidlink.org',
    'vidlink-net': 'https://vidlink.net',
  };

  // Explicit single-gateway requests — bypass the Python multi-failover and hit one gateway directly
  if (GATEWAY_MAP[server]) {
    const baseUrl = GATEWAY_MAP[server];
    try {
      const pythonUrl = type === 'tv'
        ? `http://localhost:8000/tv-single/${tmdbId}/${season}/${episode}?gateway=${encodeURIComponent(baseUrl)}`
        : `http://localhost:8000/movie-single/${tmdbId}?gateway=${encodeURIComponent(baseUrl)}`;
      const res2 = await fetch(pythonUrl);
      if (!res2.ok) {
        throw new Error(`Python gateway returned status ${res2.status}`);
      }
      const result = await res2.json();
      const formatted = formatVidlinkResponse(result, baseUrl);
      return res.json(rewriteLocalhostUrls(formatted, req));
    } catch (err) {
      const status = err.message.includes("No stream object") || err.message.includes("No usable stream") ? 404 : 500;
      return res.status(status).json({ error: `${server} failed: ${err.message}` });
    }
  }

  // auto + vidlink: use the Python multi-gateway failover (tries all 4 domains sequentially)
  // For 'auto' (universal player), we now prioritize fallback scrapers (VidSrc, Vidify) and bypass vidlink.pro!
  if (server === 'vidlink') {
    try {
      const result = await resolveVidlinkStream(tmdbId, type, season, episode);
      if (result) {
        console.log(`[Server] Success via Vidlink multi-gateway`);
        return res.json(rewriteLocalhostUrls(result, req));
      }
    } catch (err) {
      console.warn(`[Server] Vidlink multi-gateway failed: ${err.message}`);
      return res.status(500).json({ error: `Vidlink resolution failed: ${err.message}` });
    }
  }

  // universal / auto failover: try VidSrc PM first, then VidSrc fallback, then Vidify
  if (server === 'auto') {
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
  if (server === 'vidsrc') {
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
  if (server === 'vidify') {
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
  
  return res.status(404).json({ error: 'Unknown server option.' });
});



// Subtitles Integration Routes

// 1. YIFY Subtitles Download & Unzip
app.get('/movies/yts-subtitles/download', async (req, res) => {
  const { link } = req.query;
  if (!link) return res.status(400).send('Missing link parameter');
  
  console.log(`[Server] YTS Subtitles Download link: ${link}`);
  try {
    const detailRes = await fetch(`https://yifysubtitles.org${link}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    if (!detailRes.ok) throw new Error(`Detail page returned status ${detailRes.status}`);
    const html = await detailRes.text();
    
    const dataLinkMatch = html.match(/class="btn-icon download-subtitle"\s+href="([^"]*)"/);
    if (!dataLinkMatch) throw new Error('Could not find download-subtitle href attribute in page HTML');
    
    const zipPath = dataLinkMatch[1];
    const zipUrl = `https://yifysubtitles.ch${zipPath}`;
    console.log(`[Server] Decoded ZIP URL: ${zipUrl}`);
    
    const pythonUrl = `http://localhost:8000/unzip-srt?url=${encodeURIComponent(zipUrl)}`;
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
    const response = await fetch(`https://yifysubtitles.org/movie-imdb/${imdbId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
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
