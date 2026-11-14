# CineMovie OTA Update Repository

This repository powers **over-the-air (OTA) updates** for the CineMovie Android & Android TV app.

> ⚠️ **This repo contains NO source code.** Source code is private.

---

## What this repo controls (no APK rebuild needed)

| File | Purpose |
|---|---|
| `config.json` | Server list, gateway URLs, headers, priority order, enabled/disabled servers |
| `version.json` | Latest app version + APK download URL for in-app update notification |
| `plugins/{server-id}.js` | Override scraping logic for any server when upstream ciphers/domains change |

---

## Available plugin files

| Plugin file | Server |
|---|---|
| `plugins/vixsrc.js` | VixSrc |
| `plugins/videasy.js` | Videasy Pro (defers to native v0.9.2 cluster unless hotfix needed) |
| `plugins/vidsrc-pm.js` | VidSrc PM |
| `plugins/vidsrc-top-new.js` | VidSrc Top (defers to native v0.9.2 Nexa extractor unless hotfix needed) |
| `plugins/vidsrc-wtf-2.js` | VidSrc Multi-Lang (legacy override) |

---

## How to enable/disable a server without APK

In `config.json`, edit `enabled_servers` and `disabled_servers`:

```json
"enabled_servers": [
  "vixsrc",
  "pass",
  "videasy",
  "stellar",
  "cloudnestra",
  "mapple",
  "vidsrc-pm",
  "vidsrc-top-new",
  "frembed",
  "anikoto",
  "allanime",
  "kisskh"
]
```

Only enabled active servers appear in the player and download server selectors.

---
