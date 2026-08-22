/**
 * OTA Plugin: videasy
 * Repository: https://github.com/Extroos/MovieTester123
 *
 * params: { tmdbId, type, season, episode, title }
 * config: full OTA config.json object
 * Return { sources, subtitles } to override native scraper, or null to use native.
 */
return (async function() {
  var VF = [1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580];
  var VH = [109,118,109,49];
  var vb = function(e) { return (e*(e+1)&1) == 0; };
  var vI = function(e) { return (e*(e+1)&1) == 1; };
  var vw = function(e) { e >>>= 0; e ^= e >>> 16; e = Math.imul(e, 2246822507) >>> 0; e ^= e >>> 13; e = Math.imul(e, 3266489909) >>> 0; return (e ^= e >>> 16) >>> 0; };
  var vv = function(e, t) { return (e >>>= 0, 0 == (t &= 31)) ? e >>> 0 : (e << t | e >>> 32 - t) >>> 0; };

  var decryptVideasy = function(cipherBase64, seed, mediaId) {
    var r = (function(e) {
      var t = e.replace(/-/g, "+").replace(/_/g, "/").padEnd(4 * Math.ceil(e.length / 4), "=");
      if (typeof atob === 'function') {
        var str = atob(t);
        var u8 = new Uint8Array(str.length);
        for (var i = 0; i < str.length; i++) u8[i] = str.charCodeAt(i);
        return u8;
      }
      return new Uint8Array(globalThis.Buffer.from(t, "base64"));
    })(cipherBase64);

    var o = (function(e, t, s) {
      var a = (function(e, t) {
        if (vI(e.length)) {
          return {
            S: (function(e) {
              var t = Array(256);
              for (var i = 0; i < 256; i++) t[i] = i;
              var s = 0;
              for (var i = 0; i < 256; i++) {
                s = s + t[i] + e.charCodeAt(i % e.length) & 255;
                var tmp = t[i]; t[i] = t[s]; t[s] = tmp;
              }
              return t;
            })(e),
            acc: (function(e) {
              var t = 1732584193;
              for (var i = 0; i < e.length; i++) t = vv((t ^ Math.imul(e.charCodeAt(i), VF[15 & i])) >>> 0, 5);
              return vw(t);
            })(e)
          };
        }
        var s = Array(61);
        var a = vw((function(e) {
          var t = 2166136261;
          for (var i = 0; i < e.length; i++) t = Math.imul(t ^ e.charCodeAt(i), 16777619) >>> 0;
          return vw(t);
        })(e) ^ vw(t >>> 0 ^ 2654435769)) >>> 0;
        for (var i = 0; i < 8; i++) {
          if (vb(i)) {
            var tIdx = a % 61;
            a = vv(a + 2654435769 >>> 0, 7 + (7 & i));
            s[tIdx] = (a ^ vw(a)) >>> 0;
            a = vw(a + tIdx >>> 0);
          } else {
            s[i] = VF[15 & i];
          }
        }
        return { S: s, acc: vw(2779096485 ^ a) >>> 0 };
      })(e, t);

      var r = new Uint8Array(s);
      var o = 0;
      for (var i = 0; i < s;) {
        var tVal = (function(e, t) {
          var rS = e.S, rAcc = e.acc, nIdx = rAcc % 61, iMask = 0 - Number(nIdx in rS), dVal = rS[nIdx] >>> 0;
          var lVal = (((rAcc ^ (dVal ^ Math.imul(2654435769, t + 1) >>> 0) >>> 0)) >>> 0 | (rAcc & (dVal ^ Math.imul(2654435769, t + 1) >>> 0) & iMask) >>> 0) >>> 0;
          return rAcc = vw((lVal = (vv(lVal + rAcc >>> 0, 31 & nIdx) ^ vv(rAcc, 31 & Math.imul(nIdx, 7))) >>> 0) + 2654435769 >>> 0),
                 rS[nIdx] = rAcc >>> 0, e.acc = rAcc, rAcc >>> 0;
        })(a, o++);
        r[i++] = 255 & tVal;
        if (i < s) r[i++] = tVal >>> 8 & 255;
        if (i < s) r[i++] = tVal >>> 16 & 255;
        if (i < s) r[i++] = tVal >>> 24 & 255;
      }
      return r;
    })(seed, mediaId, r.length);

    for (var i = 0; i < r.length; i++) r[i] ^= o[i];
    for (var i = 0; i < VH.length; i++) {
      if (r[i] !== VH[i]) throw new Error("decrypt failed: bad seed or tampered payload");
    }
    var subArr = r.subarray(VH.length);
    if (typeof TextDecoder !== 'undefined') {
      return new TextDecoder("utf-8").decode(subArr);
    }
    return globalThis.Buffer.from(subArr).toString("utf8");
  };

  var tmdbId = params.tmdbId;
  var isTv = params.type === 'tv';
  var isNative = typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
  var capHttp = (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp) || (typeof window !== 'undefined' && window.CapacitorHttp);

  // 1. Dynamic API Gateway Selection
  var apiBases = [
    config && config.gateways && config.gateways.videasy_api,
    'https://api.speedracelight.com',
    'https://player.videasy.net'
  ].filter(Boolean);

  if (config && config.gateways && Array.isArray(config.gateways.videasy_api_mirrors)) {
    apiBases = config.gateways.videasy_api_mirrors.concat(apiBases);
  }

  var seed = null;
  var activeApiBase = null;

  for (var b = 0; b < apiBases.length; b++) {
    var base = apiBases[b].replace(/\/$/, '');
    var seedUrl = base + '/seed?mediaId=' + tmdbId;
    try {
      if (isNative && capHttp && capHttp.get) {
        var seedRes = await capHttp.get({
          url: seedUrl,
          headers: { 'Referer': 'https://player.videasy.net/', 'Origin': 'https://player.videasy.net' }
        });
        if (seedRes && seedRes.data) {
          seed = typeof seedRes.data === 'object' ? seedRes.data.seed : JSON.parse(seedRes.data).seed;
        }
      } else {
        var seedResp = await fetch(seedUrl, {
          headers: { 'Referer': 'https://player.videasy.net/', 'Origin': 'https://player.videasy.net' }
        });
        if (seedResp.ok) {
          var sData = await seedResp.json();
          seed = sData && sData.seed;
        }
      }
      if (seed) {
        activeApiBase = base;
        break;
      }
    } catch(e) {}
  }

  if (!seed || !activeApiBase) return null;

  var titleToUse = params.title || 'Movie';
  var year = params.year || '2026';
  var qParams = 'title=' + encodeURIComponent(titleToUse)
    + '&mediaType=' + (isTv ? 'tv' : 'movie')
    + '&year=' + year
    + '&tmdbId=' + tmdbId
    + '&enc=2&seed=' + encodeURIComponent(seed);
  if (isTv) {
    qParams += '&seasonId=' + (params.season || 1) + '&episodeId=' + (params.episode || 1);
  }

  var endpoints = (config && config.gateways && config.gateways.videasy_cdn_endpoints) || [
    '/cdn/sources-with-title',
    '/cdn/breach-sources',
    '/cdn/sources-vyse'
  ];

  var rawSources = [];
  var rawSubtitles = [];

  for (var epIdx = 0; epIdx < endpoints.length; epIdx++) {
    var ep = endpoints[epIdx];
    var cdnUrl = activeApiBase + ep + '?' + qParams;
    var cdnText = '';

    try {
      if (isNative && capHttp && capHttp.get) {
        var cdnRes = await capHttp.get({
          url: cdnUrl,
          headers: { 'Referer': 'https://player.videasy.net/', 'Origin': 'https://player.videasy.net' }
        });
        if (cdnRes && cdnRes.data) {
          cdnText = typeof cdnRes.data === 'string' ? cdnRes.data : JSON.stringify(cdnRes.data);
        }
      } else {
        var cdnResp = await fetch(cdnUrl, {
          headers: { 'Referer': 'https://player.videasy.net/', 'Origin': 'https://player.videasy.net' }
        });
        if (cdnResp.ok) {
          cdnText = await cdnResp.text();
        }
      }

      if (cdnText) {
        var decJson = decryptVideasy(cdnText.trim(), seed, tmdbId);
        var parsed = JSON.parse(decJson);
        if (parsed && Array.isArray(parsed.sources) && parsed.sources.length > 0) {
          rawSources = parsed.sources;
          rawSubtitles = parsed.subtitles || [];
          break;
        }
      }
    } catch(e) {}
  }

  if (rawSources.length > 0) {
    var validRaw = [];
    for (var vIdx = 0; vIdx < rawSources.length; vIdx++) {
      var sItem = rawSources[vIdx];
      try {
        var mResp = await fetch(sItem.url);
        if (mResp.ok) {
          var mBody = await mResp.text();
          var mSegs = mBody.split('\n').filter(function(l) { return l.trim() && l.trim().indexOf('#') !== 0; });
          if (mSegs.length > 0) {
            var checkIdx = Math.min(100, Math.floor(mSegs.length / 2));
            var segCheckUrl = mSegs[checkIdx];
            var segCheckResp = await fetch(segCheckUrl, { method: 'HEAD' });
            if (segCheckResp.status === 403 || segCheckResp.status === 404 || segCheckResp.status === 500) {
              continue; // Drop incomplete quality
            }
          }
        }
      } catch(e) {}
      validRaw.push(sItem);
    }

    var sourcesToUse = validRaw.length > 0 ? validRaw : rawSources;

    var sources = sourcesToUse.map(function(s) {
      var rawQ = (s.quality || '').trim();
      var h = s.height;
      if (!h) {
        var match = rawQ.match(/(\d{3,4})p?/i);
        if (match) h = parseInt(match[1], 10);
      }
      if (!h) h = 1080;

      var qLabel = rawQ;
      if (h >= 2000) {
        qLabel = '4K UHD (' + h + 'p)';
      } else if (h >= 1400) {
        qLabel = '2K QHD (' + h + 'p)';
      } else if (h >= 1000) {
        qLabel = '1080p FHD';
      } else if (h >= 700) {
        qLabel = '720p HD';
      } else if (h >= 400) {
        qLabel = '480p SD';
      } else if (h > 0) {
        qLabel = h + 'p';
      }

      return {
        url: s.url,
        quality: qLabel,
        height: h,
        isM3U8: true,
        provider: 'videasy'
      };
    }).sort(function(a, b) { return (b.height || 0) - (a.height || 0); });

    var subtitles = (rawSubtitles || []).filter(function(s) {
      return s && s.url && s.url.indexOf('peakstorm.top') === -1 && s.url.indexOf('finalkite.top') === -1;
    }).map(function(s) {
      return {
        url: s.url,
        label: s.lang || s.language || 'English',
        lang: s.lang || s.language || 'English'
      };
    });

    return { sources: sources, subtitles: subtitles };
  }

  return null;
})();
