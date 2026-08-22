# CineMovie OTA Update Repository

This repository powers **over-the-air (OTA) updates** for the CineMovie Android TV app.

> ⚠️ **This repo contains NO source code.** Source code is private.

---

## What this repo controls (no APK rebuild needed)

| File | Purpose |
|---|---|
| `config.json` | Server list, gateway URLs, headers, enabled/disabled servers |
| `version.json` | Latest app version + APK download URL for update notification |
| `plugins/{server-id}.js` | Override scraping logic for any server when it breaks |

---

## Available plugin files

| Plugin file | Server |
|---|---|
| `plugins/vidsrc-pm.js` | VidSrc PM |
| `plugins/vidsrc-wtf-2.js` | VidSrc Multi-Lang |
| `plugins/vidsrc-top-new.js` | VidSrc Top |
| `plugins/vixsrc.js` | VixSrc |
| `plugins/castle.js` | Castle (Direct HLS) |

---

## How to enable/disable a server without APK

In `config.json`, edit `enabled_servers`:

```json
"enabled_servers": ["vidsrc-pm", "vidsrc-wtf-2", "vidsrc-top-new", "vixsrc", "castle"]
```

Only the servers listed here will appear in the player UI. Remove an ID to hide it instantly.

---
