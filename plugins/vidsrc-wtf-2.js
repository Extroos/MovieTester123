/**
 * OTA Plugin: vidsrc-wtf-2 (Multi-Lang)
 * CineMovie — https://github.com/Extroos/MovieTester123
 *
 * Called BEFORE the native VidSrc Multi-Lang scraper (viduki.net).
 * Receives: params = { tmdbId, type, season, episode }
 *           config  = full config.json object
 *
 * Return { sources: [...], subtitles: [...] } to override native code.
 * Return null to fall back to native scraper (default behaviour).
 *
 * HOW TO UPDATE: edit this file + push to main — no APK rebuild needed.
 */

// Uncomment and update if the gateway domain or API endpoint changes:
// const domain = (config.gateways && config.gateways.vidsrc_wtf) || 'viduki.net';
// const { tmdbId, type, season, episode } = params;
// ... custom scrape logic ...

return null; // use native scraper
