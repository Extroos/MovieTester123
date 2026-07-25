/**
 * OTA Plugin: vidsrc-top-new
 * CineMovie — https://github.com/Extroos/MovieTester123
 *
 * Called BEFORE the native VidSrc Top scraper (vid-src.top).
 * Receives: params = { tmdbId, type, season, episode }
 *           config  = full config.json object
 *
 * Return { sources: [...], subtitles: [...] } to override native code.
 * Return null to fall back to native scraper (default behaviour).
 *
 * HOW TO UPDATE: edit this file + push to main — no APK rebuild needed.
 */

// Uncomment and update if vid-src.top domain rotates or embed path changes:
// const base = (config.gateways && config.gateways.vidsrc_top_new) || 'https://vid-src.top';
// const { tmdbId, type, season, episode } = params;
// const embedUrl = type === 'tv'
//   ? `${base}/embed/tv/${tmdbId}/${season}/${episode}`
//   : `${base}/embed/movie/${tmdbId}`;
// ... custom scrape logic ...

return null; // use native scraper
