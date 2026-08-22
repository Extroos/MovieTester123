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
    var source1080 = rawSources.find(function(s) { return (s.quality || '').indexOf('1080') !== -1; }) || rawSources.find(function(s) { return (s.quality || '').indexOf('720') !== -1; }) || rawSources[0];

    var validRaw = [];
    for (var vIdx = 0; vIdx < rawSources.length; vIdx++) {
      var sItem = rawSources[vIdx];
      var isHealthy = true;
      try {
        var mResp = await fetch(sItem.url);
        var mContent = await mResp.text();
        if (!mContent || mContent.indexOf('#EXTM3U') === -1) {
          isHealthy = false;
        } else {
          var mSegs = mContent.split('\n').map(function(l) { return l.trim(); }).filter(function(l) { return l && l[0] !== '#'; });
          if (mSegs.length > 0) {
            var segCheckUrl = mSegs[0];
            var segCheckResp = await fetch(segCheckUrl, { headers: { 'Range': 'bytes=0-100' } });
            if (segCheckResp.status === 403 || segCheckResp.status === 404 || segCheckResp.status === 500) {
              isHealthy = false;
            }
          }
        }
      } catch(e) {}

      if (isHealthy) {
        validRaw.push(sItem);
      } else if (source1080) {
        validRaw.push({
          url: source1080.url,
          quality: sItem.quality,
          height: sItem.height
        });
      } else {
        validRaw.push(sItem);
      }
    }

    var sourcesToUse = validRaw.filter(function(s) {
      var rawQ = (s.quality || '').toLowerCase().trim();
      var h = s.height;
      if (rawQ.indexOf('4k') !== -1 || rawQ.indexOf('2160') !== -1 || rawQ.indexOf('uhd') !== -1) {
        h = 2160;
      } else if (rawQ.indexOf('2k') !== -1 || rawQ.indexOf('1440') !== -1 || rawQ.indexOf('qhd') !== -1) {
        h = 1440;
      } else if (rawQ.indexOf('1080') !== -1 || rawQ.indexOf('fhd') !== -1) {
        h = 1080;
      } else if (rawQ.indexOf('720') !== -1 || rawQ.indexOf('hd') !== -1) {
        h = 720;
      } else if (rawQ.indexOf('480') !== -1 || rawQ.indexOf('sd') !== -1) {
        h = 480;
      } else if (!h) {
        var match = rawQ.match(/(\d{3,4})p?/i);
        if (match) h = parseInt(match[1], 10);
      }
      return rawQ.indexOf('480') === -1 && rawQ.indexOf('360') === -1 && (!h || h >= 700);
    });

    var sources = sourcesToUse.map(function(s) {
      var rawQ = (s.quality || '').trim();
      var low = rawQ.toLowerCase();
      var h = s.height;
      if (low.indexOf('4k') !== -1 || low.indexOf('2160') !== -1 || low.indexOf('uhd') !== -1) {
        h = 2160;
      } else if (low.indexOf('2k') !== -1 || low.indexOf('1440') !== -1 || low.indexOf('qhd') !== -1) {
        h = 1440;
      } else if (low.indexOf('1080') !== -1 || low.indexOf('fhd') !== -1) {
        h = 1080;
      } else if (low.indexOf('720') !== -1 || low.indexOf('hd') !== -1) {
        h = 720;
      } else if (low.indexOf('480') !== -1 || low.indexOf('sd') !== -1) {
        h = 480;
      } else if (!h) {
        var match = rawQ.match(/(\d{3,4})p?/i);
        if (match) h = parseInt(match[1], 10);
      }
      if (!h) h = 1080;

      var qLabel = rawQ;
      if (h >= 2000) {
        qLabel = '4K UHD';
      } else if (h >= 1400) {
        qLabel = '2K QHD';
      } else if (h >= 1000) {
        qLabel = '1080p FHD';
      } else if (h >= 700) {
        qLabel = '720p HD';
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
      return s && s.url;
    }).map(function(s) {
      var langName = s.lang || s.language || 'English';
      var lLow = langName.toLowerCase();
      if (lLow === 'eng' || lLow === 'en') langName = 'English';
      else if (lLow === 'spa' || lLow === 'es') langName = 'Spanish';
      else if (lLow === 'fre' || lLow === 'fra' || lLow === 'fr') langName = 'French';
      else if (lLow === 'ara' || lLow === 'ar') langName = 'Arabic';
      else if (lLow === 'ger' || lLow === 'deu' || lLow === 'de') langName = 'German';
      else if (lLow === 'ita' || lLow === 'it') langName = 'Italian';
      else if (lLow === 'por' || lLow === 'pt') langName = 'Portuguese';
      else if (lLow === 'rus' || lLow === 'ru') langName = 'Russian';
      else langName = langName.charAt(0).toUpperCase() + langName.slice(1);

      return {
        url: s.url,
        file: s.url,
        label: 'VE ' + langName,
        lang: langName,
        language: langName,
        isOfficial: true,
        provider: 'videasy'
      };
    });

    return { sources: sources, subtitles: subtitles };
  }

  return null;
})();
