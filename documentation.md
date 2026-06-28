# Local Hybrid Streaming Engine & Proxy Debugging Documentation

This document chronicles the step-by-step resolution of the local streaming engine and Express/Python proxy issues from scratch, explaining the root causes and technical implementations for each fix.

---

## 1. Registering the `'test-server'` Option (HTTP 404 Route Block)
### The Problem
When selecting the new local streaming engine ("test server") option in the frontend player, the player would fetch the streams route from the Express backend, but the Express server threw `Server HTTP 404: Unknown server option` and rejected the playback request.
### The Fix
We registered `'test-server'` in the server's routing validator and switch-case logic inside [server.js](file:///c:/Users/user/Desktop/CineMovie/server.js) so it successfully routes play requests to the native provider execution functions instead of rejecting them.

---

## 2. Porting Native JS Plugins to Node (Python Fallback 404 & Node HTTP 500)
### The Problem
The Express backend originally forwarded player requests to a Python resolver microservice to parse the scraper plugins. The microservice returned HTTP 404/500 errors because of sync issues between the Node scraper logic and the Python endpoints.
### The Fix
We bypassed the Python middleman scraper entirely for web provider resolution. Using Node's native `vm` and `crypto` modules directly in [server.js](file:///c:/Users/user/Desktop/CineMovie/server.js), we loaded the JS provider plugins (`filemoon.js`, `streamtape.js`, `vidplay.js`) directly from the assets folder and executed them natively in Node. This resolved the dependency on external scraping services.

---

## 3. Bypassing Cloudflare WAF on Video Segments (403 Forbidden)
### The Problem
Even though the master and level `.m3u8` playlists parsed successfully, the player failed during actual playback. Concurrent requests to load the `.ts` (or `.html`) video segments from the CDN `smartbusinessframework.site` through the `/local-proxy` endpoint were blocked by Cloudflare with a `403 Forbidden` error.
### The Cause
The CDN uses strict anti-hotlinking rules on the `/content/` segment paths. When it saw browser-based cross-origin request headers (specifically `Referer: https://brightpathsignals.com/` and `Origin`), Cloudflare challenged the request.
### The Fix
Native media players (like ExoPlayer) do not send `Referer` or `Origin` headers when playing HLS streams, which CDNs allow. We updated [temp_decryptor/main.py](file:///c:/Users/user/Desktop/CineMovie/temp_decryptor/main.py) to check if the target stream URL belongs to the `vidsrc-pm` signature (by matching known CDN hostnames like `smartbusinessframework.site`, `lifestylefreedomlab.site`, or path prefixes like `/mbzqN9iiy/` and `/WnVM9YFN1/`). If matched, the proxy completely strips the outgoing `Referer` and `Origin` headers, making the request resemble a native mobile player and cleanly bypassing the Cloudflare WAF block.

---

## 4. Resolving Playlist URL Rewriter Crash (TypeError: quote_from_bytes)
### The Problem
After stripping the referer and origin, the Python proxy threw a `TypeError: quote_from_bytes() expected bytes` exception, resulting in an HTTP 500 error when loading the master playlist.
### The Cause
In [temp_decryptor/main.py](file:///c:/Users/user/Desktop/CineMovie/temp_decryptor/main.py), we set `ref_to_use = None` and `orig_to_use = None`. However, the playlist URL rewriter tried to encode these variables:
```python
params_suffix = f"&referer={urllib.parse.quote(ref_to_use)}&origin={urllib.parse.quote(orig_to_use)}"
```
Since `urllib.parse.quote` cannot accept `None`, it threw a TypeError.
### The Fix
We modified the playlist parser to build the `params_suffix` query parameters conditionally. It now only appends the referer and origin query keys if they are not `None`.

---

## 5. Preventing Truncated HLS Segments (Fatal Hls.js bufferAppendError)
### The Problem
During playback, the browser console threw a fatal Hls.js error: `mediaError (bufferAppendError) on sourceBufferName: audio`. The stream would freeze and attempt to recover media loops indefinitely.
### The Cause
In Node Express, the `req.on('close')` event is fired when a request has completed normally, not just when a client aborts. The proxy in [server.js](file:///c:/Users/user/Desktop/CineMovie/server.js) was immediately aborting the underlying Axios connection to Python when `req.on('close')` fired. Because the connection was aborted prematurely, HLS segments were cut off by a few final bytes, resulting in corrupted files missing trailing audio frames.
### The Fix
We modified the Express close listener to check if the response was fully flushed:
```javascript
req.on('close', () => {
  if (!res.writableFinished) {
    abortController.abort();
  }
});
```
This ensures that the download is only cancelled if the client *prematurely* aborts, allowing normal segment requests to fetch all trailing bytes successfully.

---

## 6. Fixing Raw Brotli Compression Delivery (Fatal Hls.js fragParsingError)
### The Problem
The player would fail to play with the console error: `Failed to find demuxer by probing fragment data`.
### The Cause
The client browser sends `Accept-Encoding: gzip, deflate, br` by default. The CDN compresses the video segments using Brotli (`br`) compression. However, the Python virtual environment lacked the external `brotli` pip library. 
As a result, Python's `httpx` and `curl_cffi` clients could not decompress the Brotli response and returned the raw Brotli compressed stream bytes directly to the browser. The browser could not demux these compressed bytes as video, throwing the parsing error.
### The Fix
Python has native, built-in standard library support to decompress `gzip` and `deflate` compression without needing any third-party packages. We updated [temp_decryptor/main.py](file:///c:/Users/user/Desktop/CineMovie/temp_decryptor/main.py) to filter out the `'br'` string from the incoming `Accept-Encoding` header. The CDN then responds in gzip/deflate, which Python automatically decompresses natively before serving clean, raw media bytes to the browser player.
