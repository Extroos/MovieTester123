/**
 * OTA Plugin: vidsrc-wtf-2 (VidSrc Multi-Lang)
 * Repository: https://github.com/Extroos/MovieTester123
 *
 * HOW TO FIX when Multi-Lang embed provider breaks:
 *   OPTION A (instant): Edit this file, hardcode the new embed URL, push.
 *   OPTION B (OTA rotation): Edit config.json → change multilang_providers[0]
 *     to the new working provider → push → all users auto-fix in 2 min.
 *
 * Provider list is read from config.json → multilang_providers[].
 * Each provider has: { id, movieUrl, tvUrl, priority }
 * URLs use {tmdb}, {season}, {episode} as placeholders.
 *
 * Return { embedUrl } to load in WebView iframe player.
 * Return null to attempt native scraping (not recommended for this server).
 */
return (async function() {
  var providers = (config.multilang_providers || []).slice();

  if (providers.length === 0) {
    // Hard fallback if OTA config is not loaded yet
    var tmdb = params.tmdbId;
    var isTV = params.type === 'tv';
    return {
      embedUrl: isTV
        ? 'https://vidsrc.me/embed/tv?tmdb=' + tmdb + '&season=' + (params.season || 1) + '&episode=' + (params.episode || 1)
        : 'https://vidsrc.me/embed/movie?tmdb=' + tmdb
    };
  }

  // Sort by priority (lowest number = highest priority)
  providers.sort(function(a, b) {
    return ((a.priority === undefined ? 99 : a.priority)) - ((b.priority === undefined ? 99 : b.priority));
  });

  var provider = providers[0];
  var tmdb = params.tmdbId;
  var isTV = params.type === 'tv';
  var season = params.season || 1;
  var episode = params.episode || 1;

  var template = isTV ? provider.tvUrl : provider.movieUrl;
  var embedUrl = template
    .replace(/\{tmdb\}/g, tmdb)
    .replace(/\{imdb\}/g, params.imdbId || tmdb)
    .replace(/\{season\}/g, String(season))
    .replace(/\{episode\}/g, String(episode));

  return { embedUrl: embedUrl, providerId: provider.id };
})();
