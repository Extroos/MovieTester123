/**
 * OTA Plugin: vixsrc
 * CineMovie — https://github.com/Extroos/MovieTester123
 *
 * Called BEFORE the native VixSrc scraper (vixsrc.to).
 * Receives: params = { tmdbId, type, season, episode }
 *           config  = full config.json object
 *
 * Return { sources: [...], subtitles: [...] } to override native code.
 * Return null to fall back to native scraper (default behaviour).
 *
 * HOW TO UPDATE: edit this file + push to main — no APK rebuild needed.
 */

// Uncomment and update if vixsrc.to domain rotates:
// const mirrors = (config.gateways && config.gateways.vixsrc_mirrors) || ['https://vixsrc.to'];
// const base = mirrors[0];
// const { tmdbId, type, season, episode } = params;
// ... custom scrape logic ...

return null; // use native scraper
