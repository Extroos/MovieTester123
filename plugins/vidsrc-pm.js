/**
 * OTA Plugin: vidsrc-pm
 * CineMovie — https://github.com/Extroos/MovieTester123
 *
 * Called by the app BEFORE native VidSrc PM scraper.
 * Receives: params = { tmdbId, type, season, episode }
 *           config  = full config.json object
 *
 * Return { sources: [...], subtitles: [...] } to override native code.
 * Return null to fall back to native scraper (default behaviour).
 *
 * HOW TO UPDATE: edit this file + push to main — no APK rebuild needed.
 */

// Uncomment and fill in if the API domain or endpoint changes:
// const baseApi = (config.gateways && config.gateways.vidsrc_pm) || 'https://streamdata.vaplayer.ru';
// const { tmdbId, type, season, episode } = params;
// const param = tmdbId.startsWith('tt') ? 'imdb' : 'tmdb';
// let url = `${baseApi}/api.php?${param}=${tmdbId}&type=${type}`;
// if (type === 'tv') url += `&season=${season}&episode=${episode}`;
// try {
//   const res = await fetch(url);
//   if (!res.ok) return null;
//   const data = await res.json();
//   if (data && data.sources) return data;
// } catch (e) {}

return null; // use native scraper
