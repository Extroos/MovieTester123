/**
 * OTA Plugin: vidsrc-pm
 * Repository: https://github.com/Extroos/MovieTester123
 *
 * HOW TO FIX when VidSrc PM breaks:
 *   1. Update config.json → gateways.vidsrc_pm to new API URL
 *   2. Update config.json → gateways.vidsrc_pm_referers[] with working referers
 *   3. Or update the API logic directly in this file
 *   4. git push → all users auto-fix within 2 minutes. No APK rebuild needed.
 *
 * params: { tmdbId, type, season, episode }
 * config: full OTA config.json object
 * Return { sources, subtitles } to override native scraper, or null to use native.
 */
return (async function() {
  var localProxy = 'http://localhost:3001';
  var tmdbId = params.tmdbId;
  var isTv = params.type === 'tv';
  var season = params.season || 1;
  var episode = params.episode || 1;

  // 1. Primary: Speedracelight Yoru (Authentic 4K / 2K / 1080p uncompressed CDN)
  try {
    var VF = [1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580];
    var VH = [109,118,109,49];
    var vb = function(e) { return (e*(e+1)&1) == 0; };
    var vI = function(e) { return (e*(e+1)&1) == 1; };
    var vw = function(e) { e >>>= 0; e ^= e >>> 16; e = Math.imul(e, 2246822507) >>> 0; e ^= e >>> 13; e = Math.imul(e, 3266489909) >>> 0; return (e ^= e >>> 16) >>> 0; };
    var vv = function(e, t) { return (e >>>= 0, 0 == (t &= 31)) ? e >>> 0 : (e << t | e >>> 32 - t) >>> 0; };

    var decryptVideasy = function(cipherBase64, seed, mediaId) {
      var r = (function(e) {
        var t = e.replace(/-/g, "+").replace(/_/g, "/").padEnd(4 * Math.ceil(e.length / 4), "=");
        var binary = atob(t);
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
      })(cipherBase64);

      var o = (function(e, t, s) {
        var a = (function(e, t) {
          if (vI(e.length)) {
            return {
              S: (function(e) {
                var t = Array(256);
                for (var i = 0; i < 256; i++) t[i] = i;
                var s = 0;
                for (var a = 0; a < 256; a++) {
                  s = s + t[a] + e.charCodeAt(a % e.length) & 255;
                  var r = t[a];
                  t[a] = t[s]; t[s] = r;
                }
                return t;
              })(e),
              acc: (function(e) {
                var t = 1732584193;
                for (var s = 0; s < e.length; s++) t = vv((t ^ Math.imul(e.charCodeAt(s), VF[15 & s])) >>> 0, 5);
                return vw(t);
              })(e)
            };
          }
          var sArr = Array(61);
          var aVal = vw((function(e) {
            var t = 2166136261;
            for (var s = 0; s < e.length; s++) t = Math.imul(t ^ e.charCodeAt(s), 16777619) >>> 0;
            return vw(t);
          })(e) ^ vw(t >>> 0 ^ 2654435769)) >>> 0;
          for (var i = 0; i < 8; i++) {
            if (vb(i)) {
              var tIdx = aVal % 61;
              aVal = vv(aVal + 2654435769 >>> 0, 7 + (7 & i));
              sArr[tIdx] = (aVal ^ vw(aVal)) >>> 0;
              aVal = vw(aVal + tIdx >>> 0);
            } else {
              sArr[i] = VF[15 & i];
            }
          }
          return { S: sArr, acc: vw(2779096485 ^ aVal) >>> 0 };
        })(e, t);

        var rArr = new Uint8Array(s);
        var oIdx = 0;
        for (var i = 0; i < s;) {
          var tVal = (function(e, t) {
            var sVal, aVal;
            var r = e.S, o = e.acc, n = o % 61, i = 0 - Number(n in r), d = r[n] >>> 0,
                l = (((sVal = o) ^ (aVal = (d ^ Math.imul(2654435769, t + 1) >>> 0) >>> 0)) >>> 0 | (sVal & aVal & i) >>> 0) >>> 0;
            return o = vw((l = (vv(l + o >>> 0, 31 & n) ^ vv(o, 31 & Math.imul(n, 7))) >>> 0) + 2654435769 >>> 0),
                   r[n] = o >>> 0, e.acc = o, o >>> 0;
          })(a, oIdx++);
          rArr[i++] = 255 & tVal;
          i < s && (rArr[i++] = tVal >>> 8 & 255);
          i < s && (rArr[i++] = tVal >>> 16 & 255);
          i < s && (rArr[i++] = tVal >>> 24 & 255);
        }
        return rArr;
      })(seed, mediaId, r.length);

      for (var i = 0; i < r.length; i++) r[i] ^= o[i];
      for (var i = 0; i < VH.length; i++) {
        if (r[i] !== VH[i]) throw Error("decrypt failed");
      }
      var aSub = r.subarray(VH.length);
      return new TextDecoder().decode(aSub);
    };

    var titleToUse = 'Movie';
    var releaseYear = '2026';
    try {
      var tmdbApiKey = '04c35731a5ee918f014970082a0088b1';
      var tmdbEndpoint = isTv
        ? 'https://api.themoviedb.org/3/tv/' + tmdbId + '?api_key=' + tmdbApiKey
        : 'https://api.themoviedb.org/3/movie/' + tmdbId + '?api_key=' + tmdbApiKey;
      var tmdbResp = await fetch(tmdbEndpoint);
      if (tmdbResp.ok) {
        var tmdbData = await tmdbResp.json();
        titleToUse = tmdbData.title || tmdbData.name || titleToUse;
        var relDate = tmdbData.release_date || tmdbData.first_air_date;
        if (relDate) releaseYear = String(new Date(relDate).getFullYear());
      }
    } catch(e) {}

    var seedProxy = localProxy + '/local-proxy?url=' + encodeURIComponent('https://api.speedracelight.com/seed?mediaId=' + tmdbId)
      + '&referer=' + encodeURIComponent('https://player.videasy.net/')
      + '&origin=' + encodeURIComponent('https://player.videasy.net');
    var seedResp = await fetch(seedProxy);
    if (seedResp.ok) {
      var seedData = await seedResp.json();
      var seed = seedData && seedData.seed;
      if (seed) {
        var paramsObj = new URLSearchParams({
          title: titleToUse,
          mediaType: isTv ? 'tv' : 'movie',
          year: releaseYear,
          tmdbId: String(tmdbId),
          enc: '2',
          seed: seed
        });
        if (isTv) {
          paramsObj.set('seasonId', String(season));
          paramsObj.set('episodeId', String(episode));
        }

        var cdnProxy = localProxy + '/local-proxy?url=' + encodeURIComponent('https://api.speedracelight.com/cdn/sources-with-title?' + paramsObj.toString())
          + '&referer=' + encodeURIComponent('https://player.videasy.net/')
          + '&origin=' + encodeURIComponent('https://player.videasy.net');
        var cdnResp = await fetch(cdnProxy);
        if (cdnResp.ok) {
          var encText = await cdnResp.text();
          var decJson = decryptVideasy(encText.trim(), seed, tmdbId);
          var parsed = JSON.parse(decJson);
          if (parsed && parsed.sources && parsed.sources.length > 0) {
            var sources = parsed.sources.map(function(s) {
              var qLabel = s.quality || '1080p';
              var h = 1080;
              if (qLabel.indexOf('2160') >= 0 || qLabel.toLowerCase().indexOf('4k') >= 0) {
                qLabel = '4K UHD (2160p)';
                h = 2160;
              } else if (qLabel.indexOf('1440') >= 0 || qLabel.toLowerCase().indexOf('2k') >= 0) {
                qLabel = '2K QHD (1440p)';
                h = 1440;
              } else if (qLabel.indexOf('1080') >= 0) {
                qLabel = '1080p FHD';
                h = 1080;
              } else if (qLabel.indexOf('720') >= 0) {
                qLabel = '720p HD';
                h = 720;
              } else if (qLabel.indexOf('480') >= 0) {
                qLabel = '480p SD';
                h = 480;
              }
              return {
                url: localProxy + '/local-proxy?url=' + encodeURIComponent(s.url),
                quality: qLabel,
                height: h,
                isM3U8: true,
                provider: 'videasy-yoru'
              };
            }).sort(function(a, b) { return b.height - a.height; });

            var subs = (parsed.subtitles || []).map(function(s) {
              return {
                url: s.url,
                label: s.lang || s.language || 'English',
                lang: s.lang || s.language || 'English'
              };
            });

            return { sources: sources, subtitles: subs };
          }
        }
      }
    }
  } catch(e) {
    console.warn('[OTA Plugin] VidSrc PM Yoru fallback to NextGen gateway:', e);
  }

  // 2. Secondary: NextGen Cloud Fabric Gateway
  var baseApi = (config.gateways && config.gateways.vidsrc_pm) || 'https://streamdata.vaplayer.ru';
  var referers = (config.gateways && config.gateways.vidsrc_pm_referers) || [
    'https://nextgencloudfabric.com/',
    'https://brightpathsignals.com/',
    'https://player.autoembed.co/'
  ];

  var param = (params.tmdbId + '').startsWith('tt') ? 'imdb' : 'tmdb';
  var apiUrl = baseApi.replace(/\/$/, '') + '/api.php?' + param + '=' + params.tmdbId + '&type=' + params.type;
  if (params.type === 'tv') {
    apiUrl += '&season=' + (params.season || 1) + '&episode=' + (params.episode || 1);
  }

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
            provider: 'vidsrc-pm'
          };
        });
        var rawSubs = data.default_subs || (data.data && data.data.default_subs) || [];
        var subtitles = rawSubs.map(function(s) {
          var fileUrl = s.url || s.file || '';
          var sep = fileUrl.indexOf('?') >= 0 ? '&' : '?';
          return {
            url: fileUrl + sep + 'origin_referer=' + encodeURIComponent(referer),
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
