const axios = require('axios');

async function testCombinations() {
  const tmdbId = "519182"; // Inside Out 2
  const title = "Inside Out 2";
  const year = "2024";
  const imdbId = "tt22022452";
  
  const wingsBase = 'https://api.wingsdatabase.com';
  const localServer = 'http://localhost:3001';

  // 1. Fetch seed
  const seedUrl = `${wingsBase}/seed?mediaId=${tmdbId}`;
  const seedProxyUrl = `${localServer}/local-proxy?url=${encodeURIComponent(seedUrl)}&referer=${encodeURIComponent('https://player.videasy.to/')}&origin=${encodeURIComponent('https://player.videasy.to')}`;
  const seedRes = await axios.get(seedProxyUrl);
  const seed = seedRes.data?.seed;
  if (!seed) throw new Error("No seed");
  console.log("Seed retrieved:", seed);

  // Try combinations of mediaType and title encoding
  const mediaTypes = ['Movie', 'movie', 'MOVIE', 'Movie/Show', 'show'];
  const titleEncodings = [
    title,                               // raw/single-encoded
    encodeURIComponent(title),           // double-encoded
    encodeURIComponent(encodeURIComponent(title)) // triple-encoded
  ];

  for (const mType of mediaTypes) {
    for (const tEnc of titleEncodings) {
      const query = `?title=${tEnc}&mediaType=${mType}&year=${year}&tmdbId=${tmdbId}&imdbId=${imdbId}&enc=2&seed=${seed}`;
      const url = `${wingsBase}/neon2/sources-with-title${query}`;
      const proxyUrl = `${localServer}/local-proxy?url=${encodeURIComponent(url)}&referer=${encodeURIComponent('https://player.videasy.to/')}&origin=${encodeURIComponent('https://player.videasy.to')}`;
      
      try {
        const res = await axios.get(proxyUrl, { timeout: 8000 });
        console.log(`SUCCESS! mediaType: "${mType}", title: "${tEnc}" -> Status: ${res.status}`);
        return;
      } catch (err) {
        console.log(`FAILED: mediaType: "${mType}", title: "${tEnc}" -> ${err.message} (${err.response?.status})`);
      }
    }
  }
}

testCombinations();
