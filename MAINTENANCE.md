# CineMovie OTA Configuration and Extractor Maintenance Guide

################################################################################
⚠️ WARNING: LOCAL TESTING MODE IS ACTIVE!
Remote OTA configuration fetching is currently turned off to allow local configuration testing.
To re-enable fetching from GitHub before building production release APKs, set:
- ENABLE_REMOTE_OTA = true
in these files:
1. Frontend: [RemoteConfigService.ts](file:///c:/Users/user/Desktop/CineMovie/src/services/streaming/RemoteConfigService.ts) (line 15)
2. Native Engine: [NativeStreamingEnginePlugin.kt](file:///c:/Users/user/Desktop/CineMovie/android/app/src/main/java/com/cinemovie/app/NativeStreamingEnginePlugin.kt) (line 51)
################################################################################

This document maps out the system architecture and explains how to update the dynamic extractors, domains, headers, and endpoints Over-The-Air (OTA) without requiring app rebuilds or APK re-releases.

---

## 1. System Architecture Map

The streaming pipeline consists of the following critical files:

1. **Sniffer / WebView Interceptor:**
   - [BackgroundRequestObserver.kt](file:///c:/Users/user/Desktop/CineMovie/android/app/src/main/java/com/cinemovie/app/BackgroundRequestObserver.kt): Sets up an off-screen native `WebView` instance to load target embed URLs and sniffs network requests for valid media formats (e.g. `.m3u8`, `.mp4`).

2. **Native Aggregator Plugin:**
   - [NativeStreamingEnginePlugin.kt](file:///c:/Users/user/Desktop/CineMovie/android/app/src/main/java/com/cinemovie/app/NativeStreamingEnginePlugin.kt): Standardizes local proxy segment rewriting, runs the local Socket Proxy Server on port 8000 (handling `Referer` and `Origin` header spoofing), drives the fallback cascade logic, and reads the `gateways` section from the OTA config to resolve domain headers dynamically.

3. **Remote Config Service (JS):**
   - [RemoteConfigService.ts](file:///c:/Users/user/Desktop/CineMovie/src/services/streaming/RemoteConfigService.ts): Fetches and caches the `config.json` from GitHub every 5 minutes. Exposes `getGateway(key)` to all player components so domains are resolved dynamically at runtime with no rebuild needed.

4. **Subtitle Scrapers:**
   - [NativeStreamingEnginePlugin.kt](file:///c:/Users/user/Desktop/CineMovie/android/app/src/main/java/com/cinemovie/app/NativeStreamingEnginePlugin.kt) (`scrapeYtsSubtitles`): Scrapes and downloads SRT/Zip subtitle tracks from configured indexers.

5. **Player Interface & Settings UI:**
   - [PlayerSettings.tsx](file:///c:/Users/user/Desktop/CineMovie/src/components/features/player/LocalVideoPlayer/PlayerSettings.tsx): Contains the server settings panel where developers can set or override the raw GitHub JSON configuration URL.

---

## 2. Dynamic OTA JSON Configuration Schema

The OTA JSON file hosted on GitHub (`https://raw.githubusercontent.com/Extroos/MovieTester123/main/config.json`) defines all domains, headers, stream patterns, and subtitle endpoints.

Both the **Kotlin native proxy** and the **JS RemoteConfigService** read this file on every app startup (cached 5 minutes on the JS side, refreshed on every native init).

### Current Configuration Schema:
```json
{
  "gateways": {
    "vidlink": "https://vidlink.pro",
    "cloudnestra": "https://cloudnestra.com",
    "vidsrc_wtf": "https://vidsrc.wtf",
    "vidsrc_sbs": "https://vidsrc.sbs",
    "vidsrc_pk": "https://embed.vidsrc.pk",
    "vidsrc_fyi": "https://vidsrc.fyi"
  },
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
    "vidlink_origin": "https://vidlink.pro",
    "cloudnestra_referer": "https://cloudnestra.com/",
    "cloudnestra_origin": "https://cloudnestra.com",
    "vidsrc_wtf_referer": "https://vidsrc.wtf/",
    "vidsrc_wtf_origin": "https://vidsrc.wtf",
    "vidsrc_sbs_referer": "https://vidsrc.sbs/",
    "vidsrc_sbs_origin": "https://vidsrc.sbs",
    "vidsrc_pk_referer": "https://embed.vidsrc.pk/",
    "vidsrc_pk_origin": "https://embed.vidsrc.pk",
    "vidsrc_fyi_referer": "https://vidsrc.fyi/",
    "vidsrc_fyi_origin": "https://vidsrc.fyi",
    "vidsrc_me_referer": "https://vidsrc.me/",
    "vidsrc_me_origin": "https://vidsrc.me",
    "brightpath_referer": "https://brightpathsignals.com/",
    "brightpath_origin": "https://brightpathsignals.com"
  }
}
```

> **Important:** The `gateways` section is the primary place to update mirror domains. The `headers` section is used as a secondary override for specific header values and is less commonly needed.

---

## 3. Maintenance and Hotfixing Steps

### When a Streaming Domain Changes (Most Common)
If a streaming gateway changes its domain name, you do **NOT** need to update the Kotlin source code or compile a new APK. Simply:

1. Open the [config.json](file:///c:/Users/user/Desktop/CineMovie/config.json) file in your repository.
2. Edit the gateway URL under the `"gateways"` key (e.g. change `"vidsrc_sbs": "https://vidsrc.sbs"` to the new mirror URL).
3. Commit and push the changes to GitHub:
   ```bash
   git add config.json
   git commit -m "fix: update vidsrc_sbs gateway domain"
   git push origin main
   ```
4. All active user devices will automatically download the updated config during the next app startup (within ~5 minutes of the push).

### To Disable a Server Temporarily
Set the gateway value to an empty string `""` — the player will fail gracefully and display a server error:
```json
"vidsrc_fyi": ""
```

### When Headers Need Updating
If a server changes its expected `Referer` or `Origin` credentials, update both the `gateways` URL (which auto-derives headers) and, if needed, the specific `headers` key:
```json
"vidsrc_wtf_referer": "https://new-mirror.wtf/",
"vidsrc_wtf_origin": "https://new-mirror.wtf"
```

---

## 4. How to Add a New Server (Guide for Future AI Agents)

If you are a future AI agent tasked with adding a new server (e.g., `"vidsrc-xyz"`):

### Step 1: Add the gateway to config.json
Open [config.json](file:///c:/Users/user/Desktop/CineMovie/config.json) and add the new gateway under `"gateways"`:
```json
"vidsrc_xyz": "https://vidsrc.xyz"
```
Then update the `"headers"` section with matching referer/origin keys:
```json
"vidsrc_xyz_referer": "https://vidsrc.xyz/",
"vidsrc_xyz_origin": "https://vidsrc.xyz"
```

### Step 2: Add it to the UI list
Open [PlayerSettings.tsx](file:///c:/Users/user/Desktop/CineMovie/src/components/features/player/LocalVideoPlayer/PlayerSettings.tsx) and add it to the server selection list inside the `ALL_SERVERS` array (under `"Ad-Free Native Streams"` or `"With Ads / External Iframe"`):
```typescript
{ id: 'vidsrc-xyz', name: 'VidSrc XYZ', description: 'Description of the server', badge: 'Ad-Free Native', isAdFree: true }
```

### Step 3: Register Display Name & Server ID Types
Open [index.tsx](file:///c:/Users/user/Desktop/CineMovie/src/components/features/player/LocalVideoPlayer/index.tsx):
1. Add the server ID to the `selectedServer` type unions.
2. Add the display name inside `SERVER_DISPLAY_NAMES` map:
   ```typescript
   'vidsrc-xyz': 'VidSrc XYZ'
   ```
3. In the `resolveStream` function, add the scraper call (using `scrapeWtfStream` for WTF-compatible mirrors or a new dedicated scraper):
   ```typescript
   } else if (serverId === 'vidsrc-xyz') {
     const gwUrl = await getGateway('vidsrc_xyz').catch(() => 'https://vidsrc.xyz');
     const gwOrigin = gwUrl.replace(/\/$/, '');
     const domainToUse = new URL(gwOrigin).hostname;
     const result = await scrapeWtfStream(String(tmdbId), 'wtf-1', null, isTV, season, episode, domainToUse);
     // ... handle result
   }
   ```
4. If the new server is ad-free native, make sure `isAdFree: true` is set in `ALL_SERVERS` so it doesn't fall through to the iframe fallback.

### Step 4: Update the native proxy (Kotlin)
The Kotlin proxy auto-derives headers from `remoteConfig.gateways`, so as long as the new gateway is added to `config.json`, headers will be correctly assigned automatically — **no Kotlin code changes needed** for standard WTF-compatible mirrors.

For entirely new streaming backends (non-WTF), add a dedicated case in [NativeStreamingEnginePlugin.kt](file:///c:/Users/user/Desktop/CineMovie/android/app/src/main/java/com/cinemovie/app/NativeStreamingEnginePlugin.kt).

### Step 5: Build and Push
```bash
git add .
git commit -m "feat: add vidsrc-xyz server"
git push origin main
npm run build:apk-release
```

> **Note on `test-server` ID:** The internal ID of `"VidSrc.to"` remains `"test-server"` to maintain compatibility with existing user cache/local storage; modifying it globally would break the default selected server configuration of already installed apps.

---

## 5. JS RemoteConfigService Quick Reference

The [RemoteConfigService.ts](file:///c:/Users/user/Desktop/CineMovie/src/services/streaming/RemoteConfigService.ts) exposes these utility functions:

| Function | Returns | Description |
|---|---|---|
| `getRemoteConfig()` | `Promise<RemoteConfig>` | Full config object (cached) |
| `getGateway('vidsrc_wtf')` | `Promise<string>` | Full URL e.g. `https://vidsrc.wtf` |
| `getGatewayHost('vidsrc_pk')` | `Promise<string>` | Hostname only e.g. `embed.vidsrc.pk` |
| `getAllGateways()` | `Promise<GatewayConfig>` | All gateways merged with defaults |
| `refreshRemoteConfig()` | `Promise<RemoteConfig>` | Force fresh fetch, bypass cache |

Cache TTL is **5 minutes** via `localStorage`. A background refresh is triggered automatically on cache hit to stay fresh.
