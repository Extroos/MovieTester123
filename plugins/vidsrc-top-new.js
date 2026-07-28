/**
 * OTA Plugin: vidsrc-top-new
 * Repository: https://github.com/Extroos/MovieTester123
 *
 * HOW TO FIX when VidSrc Top breaks:
 *   1. Update config.json → gateways.vidsrc_top_new to new domain
 *   2. Update config.json → gateways.vidsrc_top_referers[] with working referers
 *   3. git push → all users auto-fix within 2 minutes. No APK rebuild needed.
 *
 * params: { tmdbId, type, season, episode }
 * config: full OTA config.json object
 * Return { sources, subtitles } to override native scraper, or null to use native.
 */
return (async function() {
  // VidSrc Top uses the same vaplayer backend as VidSrc PM but with different referers
  var vaplayer = (config.gateways && config.gateways.vidsrc_pm) || 'https://streamdata.vaplayer.ru';
  var referers = (config.gateways && config.gateways.vidsrc_top_referers) || [
    'https://nextgencloudfabric.com/',
    'https://brightpathsignals.com/',
    'https://player.autoembed.co/'
  ];

  var param = (params.tmdbId + '').startsWith('tt') ? 'imdb' : 'tmdb';
  var apiUrl = vaplayer.replace(/\/$/, '') + '/api.php?' + param + '=' + params.tmdbId + '&type=' + params.type;
  if (params.type === 'tv') {
    apiUrl += '&season=' + (params.season || 1) + '&episode=' + (params.episode || 1);
  }

  var localProxy = 'http://localhost:3001';

  for (var i = 0; i < referers.length; i++) {
    var referer = referers[i];
    try {
      var origin;
      try { origin = new URL(referer).origin; } catch(e) { origin = referer.replace(/\/$/, ''); }
      var proxyUrl = localProxy + '/local-proxy?url=' + encodeURIComponent(apiUrl)
        + '&referer=' + encodeURIComponent(referer)
        + '&origin=' + encodeURIComponent(origin);

      var res = await fetch(proxyUrl, { cache: 'no-store' });
      if (!res.ok) continue;

      var data = await res.json();
      var code = data.status_code == 200 || data.status_code === '200';
      var streamUrls = data.data && data.data.stream_urls;

      if (code && streamUrls && streamUrls.length > 0) {
        var sources = streamUrls.map(function(url, idx) {
          var sep = url.indexOf('?') >= 0 ? '&' : '?';
          return {
            url: url + sep + 'origin_referer=' + encodeURIComponent(referer),
            quality: idx === 0 ? 'Auto (1080p)' : 'Backup ' + idx,
            isM3U8: true,
            provider: 'vidsrc-top-new'
          };
        });
        var rawSubs = data.default_subs || (data.data && data.data.default_subs) || [];
        var subtitles = rawSubs.map(function(s) {
          return {
            url: s.url || s.file || '',
            lang: s.lang || s.label || 'English',
            label: s.lang || s.label || 'English'
          };
        });
        return { sources: sources, subtitles: subtitles };
      }
    } catch(e) {
      // try next referer
    }
  }

  return null; // fall back to native scraper
})();
