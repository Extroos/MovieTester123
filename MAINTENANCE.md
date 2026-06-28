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

When a streaming provider changes their domain name, header requirements, or encryption key ciphers:

1. **Update the JSON file** in your public GitHub repository.
2. Ensure you use the **raw link** format (e.g., `https://raw.githubusercontent.com/username/repository/main/config.json`).
3. The app fetches and updates this JSON instantly at startup.
4. Users can manually override or refresh the OTA configuration path inside **Player Settings → Servers → OTA Engine Configuration**.
