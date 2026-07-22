# 🎬 CineMovie — Premium Local-First Streaming & Media Platform

![CineMovie Banner](https://raw.githubusercontent.com/Extroos/MovieTester123/main/assets/banner.png)

> **CineMovie** is a state-of-the-art, local-first streaming and media aggregator engineered for high-performance playback on **Android Mobile**, **Android TV**, and **Web**.

---

## ✨ Key Features & Capabilities

### ⚡ Hybrid Native & JS Streaming Engine
- **Serverless Extraction:** Dynamic Over-The-Air (OTA) decryption plugins for high-speed HLS adaptive streaming.
- **WAF & CORS Proxying:** Local port 8000 HLS proxy engine with dynamic origin/referer header injection for Cloudflare bypass.
- **Zero Buffering:** Auto-fallback server mirrors ensuring 99.9% playback reliability.

### 📺 Android TV & Mobile Optimization
- **Dual Display Modes:** Native Leanback / AOSP TV box hardware detection with dynamic landscape orientation locking.
- **100% D-Pad Remote Support:** Smooth remote focus glows, custom keymaps, and full TV controller navigation.
- **120Hz Refresh Rate Unlock:** Dynamic display rate unlocking (90Hz / 120Hz) bypassing vendor battery caps.

### 📥 Offline Downloads & Device Gallery Export
- **Dual Storage Engine:** Store content internally inside private app storage or export directly to **Device Gallery / Documents** (`CineMovie_[Title].mp4`).
- **Scoped Storage Compliant:** Fully compatible with Android 13+, 14, and 15 storage policies (`READ_MEDIA_VIDEO`, `POST_NOTIFICATIONS`).
- **Background Downloads:** Powered by native Android foreground services for uninterrupted background downloads.

### 🔒 Profiles, Kids Mode & PIN Protection
- **Multi-Profile System:** Create and customize up to 5 profiles with custom avatars and colors.
- **4-Digit PIN Security:** Lock individual profiles with encrypted PIN credentials.
- **Automatic Kids Mode:** Intelligent parental filters restricting titles by certification rating (R/TV-MA) and genre metadata.

### 💬 Watch Together & Social Sync
- **Real-Time Watch Parties:** Synchronize playback with friends powered by low-latency Supabase realtime channels.
- **Live Reactions:** Send real-time emoji reactions, host controls, and room notifications.

### 🌐 Multi-Language Subtitles & Customization
- **Multi-Source Subtitles:** Integrated OpenSubtitles, Stremio, and YIFY subtitle providers.
- **Player Customization:** Live subtitle font sizing, background opacity, vertical position offsets, and encoding detection.

---

## 📡 Remote Manifests & OTA Configs

This repository hosts the official distribution manifests for CineMovie:

- [`version.json`](https://raw.githubusercontent.com/Extroos/MovieTester123/main/version.json) — Latest app version manifest & update download links.
- [`config.json`](https://raw.githubusercontent.com/Extroos/MovieTester123/main/config.json) — Dynamic OTA server gateways, headers, and extractor configs.

---

## 📱 Installation & Distribution

Download the latest release APK directly:
- **Latest Release:** [Cinemovie.v0.8.5.apk](https://github.com/Extroos/CineMovie/releases/latest/download/Cinemovie.v0.8.5.apk)

---

<p align="center">
  <i>CineMovie — Built for Cinema Enthusiasts</i>
</p>
