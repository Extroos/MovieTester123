/**
 * OTA Plugin: vixsrc
 * Repository: https://github.com/Extroos/MovieTester123
 *
 * HOW TO FIX when VixSrc breaks or moves domain:
 *   1. Update config.json → gateways.vixsrc to the new domain
 *   2. Update config.json → gateways.vixsrc_mirrors[] with mirror list
 *   3. git push → all users auto-fix within 2 minutes. No APK rebuild needed.
 *
 * Returns { embedUrl } to load in WebView iframe player.
 * Return null to attempt native scraping (fallback).
 */
return (async function() {
  // Use mirror list if available, otherwise fall back to single gateway
  var mirrors = (config.gateways && config.gateways.vixsrc_mirrors) || [];
  var base = (mirrors.length > 0 ? mirrors[0] : null)
    || (config.gateways && config.gateways.vixsrc)
    || 'https://vixsrc.to';
  base = base.replace(/\/$/, '');

  var tmdb = params.tmdbId;
  var isTV = params.type === 'tv';
  var season = params.season || 1;
  var episode = params.episode || 1;

  var embedUrl = isTV
    ? base + '/tv/' + tmdb + '/' + season + '/' + episode
    : base + '/movie/' + tmdb;

  return { embedUrl: embedUrl };
})();
