/**
 * OTA Plugin: autoembed
 * Repository: https://github.com/Extroos/MovieTester123
 *
 * HOW TO FIX when AutoEmbed breaks or moves domain:
 *   1. Update config.json → gateways.autoembed to the new domain
 *   2. git push → all users auto-fix within 2 minutes. No APK rebuild needed.
 *
 * Returns { embedUrl } to load in WebView iframe player or { sources } for native stream.
 */
return (async function() {
  var base = (config.gateways && config.gateways.autoembed) || 'https://player.autoembed.co';
  base = base.replace(/\/$/, '');

  var tmdb = params.tmdbId;
  var isTV = params.type === 'tv';
  var season = params.season || 1;
  var episode = params.episode || 1;

  var embedUrl = isTV
    ? base + '/embed/tv/' + tmdb + '/' + season + '/' + episode
    : base + '/embed/movie/' + tmdb;

  return { embedUrl: embedUrl };
})();
