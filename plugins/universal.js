/**
 * OTA Plugin: universal (Vidsrc.to)
 * CineMovie — https://github.com/Extroos/MovieTester123
 *
 * Called BEFORE the native VidSrc.to fallback scraper.
 * Receives: params = { tmdbId, type, season, episode }
 *           config  = full config.json object
 *
 * Return { sources: [...], subtitles: [...] } to override native code.
 * Return null to fall back to native scraper (default behaviour).
 *
 * HOW TO UPDATE: edit this file + push to main — no APK rebuild needed.
 */

// Uncomment and update if vidsrc.to changes its embed URL structure:
// const base = (config.gateways && config.gateways.vidsrc_to) || 'https://vidsrc.to';
// const { tmdbId, type, season, episode } = params;
// const embedUrl = type === 'tv'
//   ? `${base}/embed/tv/${tmdbId}/${season}-${episode}`
//   : `${base}/embed/movie/${tmdbId}`;
// ... custom scrape logic ...

return null; // use native scraper
