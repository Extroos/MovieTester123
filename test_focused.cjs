const axios = require('axios');

async function test2Embed() {
  console.log("\n--- TESTING 2EMBED/VIDEASY ---");
  const tmdbId = "519182"; // Inside Out 2
  const title = "Inside Out 2";
  const year = "2024";
  const imdbId = "tt22022452";

  try {
    const wingsBase = 'https://api.wingsdatabase.com';
    const localServer = 'http://localhost:3001';
    
    // Fetch seed through Express local-proxy
    const seedUrl = `${wingsBase}/seed?mediaId=${tmdbId}`;
    const seedProxyUrl = `${localServer}/local-proxy?url=${encodeURIComponent(seedUrl)}&referer=${encodeURIComponent('https://player.videasy.to/')}&origin=${encodeURIComponent('https://player.videasy.to')}`;
    const seedRes = await axios.get(seedProxyUrl);
    const seed = seedRes.data?.seed;
    if (!seed) throw new Error("No seed");
    console.log("Retrieved Seed:", seed);

    // Test both single and double encoded titles
    const doubleEncodedTitle = encodeURIComponent(title);
    const query = `?title=${encodeURIComponent(doubleEncodedTitle)}&mediaType=Movie&year=${year}&tmdbId=${tmdbId}&imdbId=${imdbId}&enc=2&seed=${seed}`;
    const sourcesUrl = `${wingsBase}/neon2/sources-with-title${query}`;
    
    // Fetch sources through Express local-proxy
    const sourcesProxyUrl = `${localServer}/local-proxy?url=${encodeURIComponent(sourcesUrl)}&referer=${encodeURIComponent('https://player.videasy.to/')}&origin=${encodeURIComponent('https://player.videasy.to')}`;
    const sourcesRes = await axios.get(sourcesProxyUrl, { responseType: 'text' });
    console.log("Sources Proxy Response Status:", sourcesRes.status);
    
    const rawText = sourcesRes.data;
    
    // XOR Decrypt
    const f = [1116352408, 1899447441, 3049323471, 3921009573, 961987163, 1508970993, 2453635748, 2870763221, 3624381080, 310598401, 607225278, 1426881987, 1925078388, 2162078206, 2614888103, 3248222580];
    const b = [109, 118, 109, 49]; // "mvm1"
    const h = (e) => (e * (e + 1) & 1) === 0;
    const I = (e) => (e * (e + 1) & 1) === 1;

    const w = (e) => {
      e >>>= 0;
      e ^= e >>> 16;
      e = Math.imul(e, 2246822507) >>> 0;
      e ^= e >>> 13;
      e = Math.imul(e, 3266489909) >>> 0;
      return (e ^= e >>> 16) >>> 0;
    };

    const v = (e, t) => {
      e >>>= 0;
      t &= 31;
      return t === 0 ? e >>> 0 : (e << t | e >>> 32 - t) >>> 0;
    };

    const pad = rawText.replace(/-/g, "+").replace(/_/g, "/").padEnd(4 * Math.ceil(rawText.length / 4), "=");
    const binary = Buffer.from(pad, 'base64');
    const o = new Uint8Array(binary);

    const getSAndAcc = (e, t) => {
      if (I(e.length)) {
        const S = (() => {
          const t = Array(256);
          for (let e = 0; e < 256; e++) t[e] = e;
          let s = 0;
          for (let a = 0; a < 256; a++) {
            s = (s + t[a] + e.charCodeAt(a % e.length)) & 255;
            const o = t[a];
            t[a] = t[s];
            t[s] = o;
          }
          return t;
        })();
        const acc = (() => {
          let t = 1732584193;
          for (let s = 0; s < e.length; s++) t = v((t ^ Math.imul(e.charCodeAt(s), f[15 & s])) >>> 0, 5);
          return (w(t) ^ 0) >>> 0;
        })();
        return { S, acc };
      }

      const s = Array(61);
      let a = w((() => {
        let t = 2166136261;
        for (let s = 0; s < e.length; s++) t = Math.imul(t ^ e.charCodeAt(s), 16777619) >>> 0;
        return w(t);
      })() ^ w(t >>> 0 ^ 2654435769)) >>> 0;

      for (let e = 0; e < 8; e++) {
        if (h(e)) {
          const t = a % 61;
          a = v((a + 2654435769) >>> 0, 7 + (7 & e));
          s[t] = (a ^ w(a)) >>> 0;
          a = w((a + t) >>> 0);
        } else {
          s[e] = f[15 & e];
        }
      }
      return {
        S: s,
        acc: w(2779096485 ^ a) >>> 0
      };
    };

    const tmdbIdNum = parseInt(tmdbId);
    const a = getSAndAcc(seed, tmdbIdNum);
    const prng = new Uint8Array(o.length);
    let idx = 0;
    for (let e = 0; e < o.length; ) {
      const t = ((eStore, tVal) => {
        let sVal, aVal;
        const oArr = eStore.S;
        let rVal = eStore.acc;
        const nVal = rVal % 61;
        const iVal = 0 - Number(nVal in oArr);
        const dVal = oArr[nVal] >>> 0;
        const lVal = (((sVal = rVal) ^ (aVal = (dVal ^ Math.imul(2654435769, tVal + 1) >>> 0) >>> 0)) >>> 0 | (sVal & aVal & iVal) >>> 0) >>> 0;
        rVal = w((lVal = (v((lVal + rVal) >>> 0, 31 & nVal) ^ v(rVal, 31 & Math.imul(nVal, 7))) >>> 0) + 2654435769 >>> 0);
        oArr[nVal] = rVal >>> 0;
        eStore.acc = rVal;
        return rVal >>> 0;
      })(a, idx++);
      prng[e++] = 255 & t;
      e < o.length && (prng[e++] = (t >>> 8) & 255);
      e < o.length && (prng[e++] = (t >>> 16) & 255);
      e < o.length && (prng[e++] = (t >>> 24) & 255);
    }

    for (let e = 0; e < o.length; e++) o[e] ^= prng[e];
    for (let e = 0; e < b.length; e++) {
      if (o[e] !== b[e]) throw Error("decrypt failed: bad seed or tampered payload");
    }

    const payload = o.subarray(b.length);
    const decryptedJson = Buffer.from(payload).toString('utf8');
    const resultObj = JSON.parse(decryptedJson);
    console.log("Decrypted 2Embed Sources:", JSON.stringify(resultObj.sources || [], null, 2));
  } catch (err) {
    console.error("2Embed Error:", err.message);
  }
}

test2Embed();
