import express from 'express';
import cors from 'cors';
import nacl from 'tweetnacl';
import { Readable } from 'stream';
import axios from 'axios';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

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

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());



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
    console.log(`[Express Proxy] Client disconnected, aborting background stream download for: ${targetUrl}`);
    abortController.abort();
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
  const { type = 'movie', s = 1, e = 1, title, server = 'auto' } = req.query;
  const season = parseInt(s);
  const episode = parseInt(e);
  
  console.log(`[Server] Watch request: ID ${tmdbId}, Type: ${type}, S: ${season}, E: ${episode}, Server: ${server}`);
  
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

  // Map single-gateway server IDs to specific Vidlink domain gateways
  const GATEWAY_MAP = {
    'vidlink-pro': 'https://vidlink.pro',
    'vidlink-me': 'https://vidlink.me',
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
      return res.status(500).json({ error: `${server} failed: ${err.message}` });
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

  // Handle explicit test-server request on Web/Desktop
  if (server === 'test-server') {
    try {
      const pythonUrl = type === 'tv'
        ? `http://localhost:8000/fallback/tv/${tmdbId}/${season}/${episode}`
        : `http://localhost:8000/fallback/movie/${tmdbId}`;
      const res2 = await fetch(pythonUrl);
      if (!res2.ok) {
        throw new Error(`Python fallback API returned status ${res2.status}`);
      }
      const result = await res2.json();
      return res.json(rewriteLocalhostUrls(result, req));
    } catch (err) {
      return res.status(500).json({ error: `test-server failed: ${err.message}` });
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
    const detailRes = await fetch(`https://yts-subs.com${link}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    if (!detailRes.ok) throw new Error(`Detail page returned status ${detailRes.status}`);
    const html = await detailRes.text();
    
    const dataLinkMatch = html.match(/data-link="([^"]*)"/);
    if (!dataLinkMatch) throw new Error('Could not find data-link attribute in page HTML');
    
    const base64Link = dataLinkMatch[1];
    const zipUrl = Buffer.from(base64Link, 'base64').toString('utf-8');
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
    const response = await fetch(`https://yts-subs.com/movie-imdb/${imdbId}`, {
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

app.listen(port, () => {
  console.log(`[Server] Streaming local server running on http://localhost:${port}`);
});
