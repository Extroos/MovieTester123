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

## How to update a server when it breaks

1. Edit `plugins/{server-id}.js` with the new scraping logic
2. Update the gateway domain in `config.json → gateways` if needed
3. Commit & push to `main`
4. **The app picks up changes within ~2 minutes — no new APK**

### Plugin contract

Each plugin file receives:
- `params` — `{ tmdbId, type, season, episode }`
- `config` — the full `config.json` object

It must return:
- `{ sources: [...], subtitles: [...] }` — to override the native scraper
- `null` — to let the native scraper run as fallback

---

## Available plugin files

| Plugin file | Server |
|---|---|
| `plugins/vidsrc-pm.js` | VidSrc PM |
| `plugins/vidsrc-wtf-2.js` | VidSrc Multi-Lang |
| `plugins/vidsrc-top-new.js` | VidSrc Top |
| `plugins/vixsrc.js` | VixSrc |

---

## How to enable/disable a server without APK

In `config.json`, edit `enabled_servers`:

```json
"enabled_servers": ["vidsrc-pm", "vidsrc-wtf-2", "vidsrc-top-new"]
```

Only the servers listed here will appear in the player UI. Remove an ID to hide it instantly.

---

