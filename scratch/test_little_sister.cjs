const axios = require('axios');

async function testVaplayer() {
  const tmdbId = "961077";
  const imdbId = "tt28326501";
  
  // Try streamdata.vaplayer.ru with TMDB ID
  try {
    const res = await axios.get(`https://streamdata.vaplayer.ru/api.php?tmdb=${tmdbId}&type=movie`, {
      headers: {
        'Referer': 'https://brightpathsignals.com/',
        'Origin': 'https://brightpathsignals.com',
        'User-Agent': 'Mozilla/5.0'
      }
    });
    console.log("Vaplayer TMDB response status:", res.status);
    console.log("Vaplayer TMDB response data:", JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error("Vaplayer TMDB failed:", err.message);
    if (err.response) {
      console.log("Vaplayer TMDB error body:", err.response.data);
    }
  }

  // Try streamdata.vaplayer.ru with IMDB ID
  try {
    const res = await axios.get(`https://streamdata.vaplayer.ru/api.php?imdb=${imdbId}&type=movie`, {
      headers: {
        'Referer': 'https://brightpathsignals.com/',
        'Origin': 'https://brightpathsignals.com',
        'User-Agent': 'Mozilla/5.0'
      }
    });
    console.log("Vaplayer IMDB response status:", res.status);
    console.log("Vaplayer IMDB response data:", JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error("Vaplayer IMDB failed:", err.message);
    if (err.response) {
      console.log("Vaplayer IMDB error body:", err.response.data);
    }
  }
}

testVaplayer();
