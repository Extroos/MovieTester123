const axios = require('axios');
const crypto = require('crypto');

const tmdbId = "1339713";
const type = "movie";

async function test2EmbedWatch() {
  try {
    console.log(`[Server] Resolving 2Embed/Videasy for TMDB-${tmdbId}...`);
    const wingsBase = 'https://api.wingsdatabase.com';
    const tmdbIdNum = parseInt(tmdbId);
    const isTv = type === 'tv';

    const rawSeedUrl = `${wingsBase}/seed?mediaId=${tmdbId}`;
    const seedProxyUrl = `http://localhost:8000/local-proxy?url=${encodeURIComponent(rawSeedUrl)}&referer=${encodeURIComponent('https://player.videasy.to/')}&origin=${encodeURIComponent('https://player.videasy.to')}`;
    console.log("Fetching seed via proxy:", seedProxyUrl);
    const seedRes = await axios.get(seedProxyUrl, { timeout: 15000 });
    const seed = seedRes.data?.seed;
    console.log("Seed:", seed);
    if (!seed) throw new Error("Failed to retrieve seed from wingsdatabase");

    let movieTitle = 'Movie';
    let releaseYear = '2024';
    let imdbId = '';

    try {
      const tmdbApiKey = '8265bd1679663a7ea12ac168da84d2e8';
      const tmdbUrl = isTv
        ? `https://api.themoviedb.org/3/tv/${tmdbId}/external_ids?api_key=${tmdbApiKey}`
        : `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${tmdbApiKey}`;
      const tmdbRes = await axios.get(tmdbUrl, { timeout: 8000 });
      if (tmdbRes.data) {
        imdbId = tmdbRes.data.imdb_id || '';
        movieTitle = tmdbRes.data.title || tmdbRes.data.name || movieTitle;
        const dateStr = tmdbRes.data.release_date || tmdbRes.data.first_air_date || '';
        if (dateStr) releaseYear = dateStr.split('-')[0];
      }
    } catch (e) {
      console.warn("[Server] Failed to fetch TMDB details for 2Embed:", e.message);
    }

    const query = `?title=${encodeURIComponent(movieTitle)}&mediaType=${isTv ? 'TV Series' : 'Movie'}&year=${releaseYear}&tmdbId=${tmdbId}&imdbId=${imdbId}&enc=2&seed=${seed}`;
    const rawSourcesUrl = `${wingsBase}/neon2/sources-with-title${query}`;
    const sourcesProxyUrl = `http://localhost:8000/local-proxy?url=${encodeURIComponent(rawSourcesUrl)}&referer=${encodeURIComponent('https://player.videasy.to/')}&origin=${encodeURIComponent('https://player.videasy.to')}`;
    console.log("Fetching sources via proxy:", sourcesProxyUrl);

    const sourcesRes = await axios.get(sourcesProxyUrl, { timeout: 15000, responseType: 'text' });
    console.log("Sources status:", sourcesRes.status);
    console.log("Sources data:", String(sourcesRes.data).substring(0, 100));
  } catch (err) {
    console.error("FAILED:", err.message);
    if (err.response) {
      console.error("RESPONSE DATA:", err.response.data);
    }
  }
}

test2EmbedWatch();
