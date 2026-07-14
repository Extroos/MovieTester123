const axios = require('axios');

async function run() {
  const tmdbId = "519182"; // Inside Out 2
  const title = "Inside Out 2";
  const year = "2024";
  const imdbId = "tt22022452";
  
  const wingsBase = 'https://api.wingsdatabase.com';
  const localServer = 'http://localhost:3001';

  try {
    // 1. Fetch seed
    const seedUrl = `${wingsBase}/seed?mediaId=${tmdbId}`;
    const seedProxyUrl = `${localServer}/local-proxy?url=${encodeURIComponent(seedUrl)}&referer=${encodeURIComponent('https://player.videasy.to/')}&origin=${encodeURIComponent('https://player.videasy.to')}`;
    console.log("Fetching seed via Express proxy...");
    const seedRes = await axios.get(seedProxyUrl);
    const seed = seedRes.data?.seed;
    console.log("Seed:", seed);

    // 2. Fetch sources
    const query = `?title=${encodeURIComponent(title)}&mediaType=Movie&year=${year}&tmdbId=${tmdbId}&imdbId=${imdbId}&enc=2&seed=${seed}`;
    const sourcesUrl = `${wingsBase}/neon2/sources-with-title${query}`;
    const sourcesProxyUrl = `${localServer}/local-proxy?url=${encodeURIComponent(sourcesUrl)}&referer=${encodeURIComponent('https://player.videasy.to/')}&origin=${encodeURIComponent('https://player.videasy.to')}`;
    console.log("Fetching sources via Express proxy...");
    const sourcesRes = await axios.get(sourcesProxyUrl, { responseType: 'text' });
    console.log("Sources status:", sourcesRes.status);
    console.log("Sources encrypted data length:", sourcesRes.data.length);
  } catch (err) {
    console.error("FAILED:", err.message);
  }
}

run();
