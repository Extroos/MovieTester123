# CineMovie OTA Configuration and Extractor Maintenance Guide

This document maps out the system architecture and explains how to update the dynamic extractors, domains, headers, and endpoints Over-The-Air (OTA) without requiring app rebuilds or APK re-releases.

---

## 1. System Architecture Map

The streaming pipeline consists of the following critical files:

1. **Sniffer / WebView Interceptor:**
   - [BackgroundRequestObserver.kt](file:///c:/Users/user/Desktop/CineMovie/android/app/src/main/java/com/cinemovie/app/BackgroundRequestObserver.kt): Sets up an off-screen native `WebView` instance to load target embed URLs and sniffs network requests for valid media formats (e.g. `.m3u8`, `.mp4`).

2. **Native Aggregator Plugin:**
   - [NativeStreamingEnginePlugin.kt](file:///c:/Users/user/Desktop/CineMovie/android/app/src/main/java/com/cinemovie/app/NativeStreamingEnginePlugin.kt): Standardizes local proxy segment rewriting, runs the local Socket Proxy Server on port 8000 (handling `Referer` and `Origin` header spoofing), and drives the fallback cascade logic.

3. **Subtitle Scrapers:**
   - [NativeStreamingEnginePlugin.kt](file:///c:/Users/user/Desktop/CineMovie/android/app/src/main/java/com/cinemovie/app/NativeStreamingEnginePlugin.kt) (`scrapeYtsSubtitles`): Scrapes and downloads SRT/Zip subtitle tracks from configured indexers.

4. **Player Interface & Settings UI:**
   - [PlayerSettings.tsx](file:///c:/Users/user/Desktop/CineMovie/src/components/features/player/LocalVideoPlayer/PlayerSettings.tsx): Contains the server settings panel where developers can set or override the raw GitHub JSON configuration URL.

---

## 2. Dynamic OTA JSON Configuration Schema

The OTA JSON file hosted on GitHub defines all domains, URLs, scraping regexes, stream sniffer matching patterns, and HTTP request headers.

### Configuration Schema Example:
```json
{
  "embed_urls": {
    "vidsrc_to_movie": "https://vidsrc.to/embed/movie/",
    "vidsrc_to_tv": "https://vidsrc.to/embed/tv/",
    "vidsrc_pm_movie": "https://streamdata.vaplayer.ru/api.php?tmdb={id}&type=movie",
    "vidsrc_pm_tv": "https://streamdata.vaplayer.ru/api.php?tmdb={id}&type=tv&season={season}&episode={episode}",
    "vidlink_gateways": [
      "https://vidlink.pro",
      "https://vidlink.me",
      "https://vidlink.org",
      "https://vidlink.net"
    ]
  },
  "stream_patterns": [
    ".m3u8",
    ".mp4",
    "filemoon"
  ],
  "extractor_domains": {
    "filemoon": "filemoon.sx",
    "filemoon_embed": "https://filemoon.to/e/"
  },
  "subtitles": {
    "yts_subtitles_url": "https://yifysubtitles.org/movie-imdb/",
    "yts_subtitles_ch": "https://yifysubtitles.ch"
  },
  "headers": {
    "vidlink_referer": "https://vidlink.pro/",
    "vidlink_origin": "https://vidlink.pro"
  }
}
```

---

## 3. Maintenance and Hotfixing Steps

### When a Streaming Domain or Header Changes
If a streaming gateway changes its domain name or headers, you do **NOT** need to update the Kotlin source code or compile a new APK. Simply:
1. Open the [config.json](file:///c:/Users/user/Desktop/CineMovie/config.json) file in your repository.
2. Edit the gateway domain or header credentials (e.g. change `"vidlink": "https://vidlink.pro"` to the new URL).
3. Commit and push the changes to GitHub:
   ```bash
   git add config.json
   git commit -m "update vidlink domain gateway"
   git push origin main
   ```
4. All active user devices will automatically download the updated [config.json](https://raw.githubusercontent.com/Extroos/MovieTester123/main/config.json) during the next app startup.

---

## 4. How to Add a New Server (Guide for Future AI Agents)

If you are a future AI agent tasked with adding a new server (e.g., `"vidsrc-xyz"`):

### Step 1: Add it to the UI list
Open [PlayerSettings.tsx](file:///c:/Users/user/Desktop/CineMovie/src/components/features/player/LocalVideoPlayer/PlayerSettings.tsx) and add it to the server selection list inside the map (under the `"Ad-Free Native Streams"` section or `"With Ads / External Iframe"` section):
```typescript
{ id: 'vidsrc-xyz', name: 'VidSrc XYZ', description: 'Description of the server', badge: 'Ad-Free Native' }
```

### Step 2: Register Display Name & Server ID Types
Open [index.tsx](file:///c:/Users/user/Desktop/CineMovie/src/components/features/player/LocalVideoPlayer/index.tsx):
1. Add the server ID to the `selectedServer` type unions.
2. Add the display name inside `SERVER_DISPLAY_NAMES` map:
   ```typescript
   'vidsrc-xyz': 'VidSrc XYZ'
   ```
3. Update `handleServerChange` to support `vidsrc-xyz` and invoke the scraper.
4. If the new server is ad-free, add it to the `isAdFree` check array so it doesn't render inside the iframe.

### Step 3: Implement the Scraper
* **Option A (Native Kotlin Sniffer):** In [NativeStreamingEnginePlugin.kt](file:///c:/Users/user/Desktop/CineMovie/android/app/src/main/java/com/cinemovie/app/NativeStreamingEnginePlugin.kt), add the resolver case to direct the sniffer WebView to load the new embed target.
* **Option B (Hybrid JS Decrypter):** Create a new javascript file under `android/app/src/main/assets/plugins/` (e.g., `vidsrc_xyz.js`) to handle decryptions.

*Note on `test-server` ID:* The internal ID of `"VidSrc.to"` remains `"test-server"` to maintain compatibility with existing user cache/local storage; modifying it globally would break the default selected server configuration of already installed apps.

### Step 4: Build and Push
Push all code to GitHub and rebuild the production bundle:
```bash
git add .
git commit -m "feat: add vidsrc-xyz server"
git push origin main
npm run build:apk-release
```
