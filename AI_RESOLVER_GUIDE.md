# Custom HLS Stream Resolvers for CineMovie

This guide explains how the native player stream resolvers for **VidSrc (WTF, FYI, PK, SBS)** and **Vidlink** are designed, integrated, and how they function. It serves as a comprehensive reference for future developers and AI agents.

---

## 1. Architectural Overview

CineMovie supports playing streams natively in a custom React/HTML5 video player layout (avoiding ad-laden, clickjacking-prone iframes). 

```
                                [ CineMovie React Frontend ]
                                             │
                       Client-side player requests watch endpoint
                                             │
                                             ▼
                                 [ Node Express Backend ] (Port 3001)
                                             │
                      Decryption / Scrambling / Failover Management
                                             │
                     ┌───────────────────────┴───────────────────────┐
                     ▼                                               ▼
             [ WTF WASM Solver ]                          [ FastAPI Decryptor ] (Port 8000)
       Evaluates Makima.wasm and chunk 46           Resolves Vidlink & VidSrc fallbacks
```

1. **Client-side UI (`LocalVideoPlayer/index.tsx`)**:
   - Manages player state, settings (subtitle size/opacity, qualities), and custom controls.
   - For native streams (everything except premium iframe wrappers), the player queries the local Express backend endpoint: `http://localhost:3001/meta/tmdb/watch/:tmdbId`.
   - On native mobile/Capacitor, client-side scrapers are prioritized where possible, but calls fallback to the Express server running on the device.
2. **Express Backend (`server.js`)**:
   - Exposes `/meta/tmdb/watch/:tmdbId` to act as the master coordinator.
   - For **WTF** APIs, it loads `wtf_chunk_46_decrypted.js` and `makima.wasm` to perform cryptographic handshakes and decrypt playback manifests.
   - For **FYI, PK, and SBS**, it manages multi-tier failover chains calling WTF, Vidify, or Python fallback scraper endpoints.
3. **FastAPI Decryptor (`temp_decryptor/main.py`)**:
   - Spawns automatically on port 8000 when Node starts.
   - Houses scrapers implemented in Python (using `curl_cffi` to mimic real browser TLS fingerprints and bypass Cloudflare).
   - Handles decrypting Vidlink tokens, scraping VidSrc, and resolving Vidify embeds.

---

## 2. Decryption & Resolution Mechanics

### A. VidSrc WTF (API 1, 2, 3, 4)
* **Underlying Logic**: WTF uses an obfuscated Next.js webpack build that interacts with a WebAssembly binary (`makima.wasm`). It issues an Altcha challenge (Proof of Work) and utilizes custom WASM algorithms (`decryptPepper`, `decryptEnvelope`) to decrypt stream playbooks.
* **Our Solution**:
  - We extracted and decrypted the Webpack chunks (specifically chunk 46) and saved the exports as `wtf_chunk_46_decrypted.js`.
  - In `server.js`, we emulate the window environment (`global.window`, `global.self`, custom `global.fetch`) and evaluate/run the extracted functions dynamically.
  - We stub `global.crypto.subtle` inside Node.js using native `crypto` modules to satisfy WASM cryptographic requirements.
  - Express coordinates the fetch calls to the `https://api.vidsrc.wtf` Altcha challenges, passes them to the evaluated webpack function, executes WASM-based decryption, and recovers the direct HLS stream.

### B. VidSrc FYI (`vidsrc-fyi`)
* **Underlying Logic**: FYI historically embeds a `vsembed.ru` iframe. Under the hood, this loads a stream from a `cloudnestra` CDN. However, `cloudnestra` frequently forces Cloudflare Turnstile verification, blocking automated server-side HTTP clients.
* **Our Solution**:
  - Excluded `vidsrc-fyi` from client-side `iframeServers` so the player resolves natively.
  - In the Express backend watch handler, we implemented a robust failover chain:
    1. **WTF API 1**: Attempt to decrypt WTF API 1.
    2. **WTF API 2**: Fallback to WTF API 2 (Multi-Language).
    3. **Python Vidify**: Fallback to Python Vidify scraper.
    4. **Python Fallback**: Run fallback `vidsrc.me` scraper (Python `curl_cffi` to bypass Turnstile if possible).
  - This ensures FYI always resolves to a working, ad-free HLS stream.

### C. VidSrc PK (`vidsrc-pk`)
* **Underlying Logic**: PK embeds a player wrapper that dynamically resolves stream providers. Analysis of its Next.js chunks showed it leverages WTF API 1, WTF API 2, and Vidify under the hood.
* **Our Solution**:
  - Excluded `vidsrc-pk` from client-side `iframeServers`.
  - In `server.js`, routed watch requests through the WTF-1 ➔ WTF-2 ➔ Vidify failover chain.

### D. VidSrc SBS (`vidsrc-sbs`)
* **Underlying Logic**: SBS loads streams via sub-servers like `nxsha.app` and `cinesrc.st` using double-staged proof-of-work challenges.
* **Our Solution**:
  - Excluded `vidsrc-sbs` from client-side `iframeServers`.
  - Routed watch requests through the WTF-1 ➔ WTF-2 ➔ Vidify ➔ Fallback failover chain to guarantee successful stream delivery.

---

## 3. Step-by-Step of What We Did

1. **Cleaned up Client Player**:
   - Modified `src/components/features/player/LocalVideoPlayer/index.tsx` to remove `vidsrc-fyi`, `vidsrc-pk`, and `vidsrc-sbs` from `iframeServers`. This forces them to invoke the native custom video player.
   - Updated the native/mobile check to ensure only client-resolved endpoints (`vidlink-pro`, `vidsrc-pm`, `universal`) execute browser scraping. Backend-resolved servers (WTF-1/2/3, FYI, PK, SBS) correctly query the local Express server.
2. **Implemented Express Watch Routing**:
   - In `server.js`, added custom cases for `vidsrc-fyi`, `vidsrc-pk`, and `vidsrc-sbs` within the `/meta/tmdb/watch/:tmdbId` route.
   - Configured robust try-catch blocks to run downstream failovers (WTF-1 ➔ WTF-2 ➔ Vidify ➔ Fallback) to guarantee that if one provider is blocked or down, the stream resolves seamlessly.
3. **Optimized Local Proxying**:
   - Ensured all resolved stream URLs are automatically proxied via `/local-proxy` (which delegates to the FastAPI `curl_cffi` proxy on port 8000) to strip CORS restrictions, inject correct headers (like `Referer` and `Origin`), and handle video range requests properly.

---

## 4. How to Test and Maintain

* **Test file to inspect**: `test_modified_scrapers.py` contains standalone scraper functions for VidSrc fallback and Vidify, using Python's `curl_cffi`. Use this file to understand or debug HTTP headers/Turnstile updates.
* **Verifying Express endpoints**:
  You can verify the watch routes anytime by running a simple node query:
  ```bash
  node -e "fetch('http://localhost:3001/meta/tmdb/watch/533535?type=movie&server=vidsrc-fyi').then(res => res.json()).then(console.log)"
  ```
  It should return a JSON containing the HLS proxy URL and status 200.

---

## 5. Chromecast Casting, Subtitles & Timeline Syncing

### A. Architectural Flow
Casting from a Capacitor-based mobile app to a physical Chromecast TV requires bridging the phone's sandboxed environment, external CDN CORS/Referer protections, and Chromecast's strict receiver player expectations.

```
 [ Phone Player: Hls.js ] ──────────────► [ SystemCastPlugin.java ] (Native Java Proxy)
                                                 │
                                                 │ Starts HTTP Server on Phone IP
                                                 ▼
 [ Chromecast TV ] ◄─────────────────── [ Phone IP:mProxyPort/proxy ]
                                                 │
                                                 ▼ Intercepts and Rewrites Playlists
                                        - Propagates CDN token signatures recursively
                                        - Filters manifest to highest-quality variant
                                        - Proxies segment, key, and subtitle requests
```

1. **Native Capacitor Plugin (`SystemCastPlugin.java`)**:
   - Spawns a local Java-based HTTP server socket (`ServerSocket`) on a dynamic port (`mProxyPort`, e.g. `8085`).
   - The React frontend registers listeners (`onCastStatusChanged`, `onCastProgressChanged`) and pushes settings to the TV via `SystemCast.launchCastSettings`.
2. **Double-Proxied Casting**:
   - The TV cannot access localhost or local decrypted files on the phone. Instead, the TV plays streams through the phone's IP address.
   - The media URL loaded on Chromecast is formatted as:
     `http://<phoneIP>:<mProxyPort>/proxy?url=<targetUrl>`
   - The native Java proxy intercepts the TV's requests, adds the required headers (`Origin`, `Referer`, high-quality `User-Agent` bot-bypass parameters), and forwards the data to the target backend or remote CDN.

### B. Bug & Resolution History

#### 1. Relative URL Resolution & Token Stripping (`403 Forbidden`)
* **The Problem**: HLS master and media manifests contain relative paths for segments (`.ts`/`.mp4`), keys (`.key`), and fragment maps (`#EXT-X-MAP`). When resolving these URLs against a backend-proxied URL (e.g. `https://cinemovie-backend.com/local-proxy?url=https%3A%2F%2Fcdn.com%2Fstream%2Fmaster.m3u8%3Ftoken%3Dxyz`), standard Java/Python URI resolvers strip the `token=xyz` parameter from the base URL. Without this CDN token, subsequent segment and key requests return `403 Forbidden`, causing playback to fail or skip segments.
* **Our Solution**:
  - **FastAPI Proxy (`main.py`)**: Replaced standard `urllib.parse.urljoin` with `resolve_relative_url`. This custom helper extracts the `base_query` string (e.g. the CDN token signature) and merges it into all resolved relative segment, key, and map URLs.
  - **Java Proxy (`SystemCastPlugin.java`)**:
    1. Rewrote `extractProxyTargetUrl` to recursively decode the target URL parameter until it extracts the original, raw remote CDN URL (supporting nesting of `/proxy` and `/local-proxy` prefixes).
    2. Enhanced `resolveRelativeUrl` to detect if the target is already a proxied URL. If so, it extracts the nested CDN URL, resolves it relative to the base CDN URL, merges the token query parameters into the nested URL, and then re-wraps it back inside the local proxy path (preserving original referer/origin parameters).
    3. Called `resolveRelativeUrl` on absolute segment lines starting with `http` (returned by the Python server) to ensure CDN tokens are merged into segment paths before serving to the TV.

#### 2. TV Playback Jumps & Timeline Skips (`ABR Quality Drift`)
* **The Problem**: When the TV starts playing, it initially loads a lower-quality stream to play quickly, then performs an Adaptive Bitrate (ABR) quality switch (e.g. switching to 1080p) after ~30 seconds. In many free streaming sources, different quality variants have slightly different timeline cuts (e.g., intro or recap cards of different lengths). When the player switches quality, the playhead jumps to the new variant's timeline, causing a sudden skip of 15 to 45 seconds in the video scene, while the seek bar remains out of sync.
* **Our Solution**:
  - Implemented **HLS Master Manifest Quality Filtering** in `SystemCastPlugin.java`.
  - When the TV player requests the master manifest, the Java proxy parses all variant stream descriptions (`#EXT-X-STREAM-INF`).
  - It extracts the `BANDWIDTH` attributes, identifies the single highest quality variant stream (usually 1080p), and constructs a new master manifest containing **only that variant**.
  - Since the TV player is served a master manifest with only one quality option, it is forced to load the highest quality stream immediately. ABR quality switching is disabled, completely preventing timeline jumps, visual skips, or quality-switch drifts.

#### 3. Subtitle Formatting & Delay Customization
* **The Problem**: Subtitles side-loaded on Chromecast via `MediaTrack` often suffer from CORS blocks or timing offsets.
* **Our Solution**:
  - In `VideoPlayer.tsx`, subtitle URLs (`.vtt`) are proxied through the local Java proxy:
    `http://<phoneIP>:<mProxyPort>/proxy?url=<vttUrl>&delay=<delay>`
  - If a non-zero `delay` parameter is detected, the Java proxy parses the WebVTT text line-by-line and shifts the timestamps (using `shiftVttTimestamps` helper) by the configured seconds before returning the file to the TV.
  - Subtitle styling configurations (size, background opacity, colors) are pushed natively using the Google Cast SDK's `TextTrackStyle` objects in the `setSubtitleStyle` PluginMethod.

