const axios = require('axios');

async function testProviders() {
  const tmdbId = "961077";
  const imdbId = "tt28326501";
  
  // 1. Test Vidlink Pro
  try {
    const res = await axios.get(`https://vidlink.pro/api/movie/${tmdbId}`, {
      headers: {
        'Referer': 'https://vidlink.pro/',
        'User-Agent': 'Mozilla/5.0'
      }
    });
    console.log("Vidlink Pro response status:", res.status);
    console.log("Vidlink Pro stream data:", JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error("Vidlink Pro failed:", err.message);
  }

  // 2. Test Vidzee
  try {
    const res = await axios.get(`https://core.vidzee.wtf/api/movie/${tmdbId}`, {
      headers: {
        'Referer': 'https://player.vidzee.wtf/',
        'User-Agent': 'Mozilla/5.0'
      }
    });
    console.log("Vidzee response status:", res.status);
    console.log("Vidzee stream data:", JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error("Vidzee failed:", err.message);
  }

  // 3. Test Vidsrc WTF
  try {
    const res = await axios.get(`https://vidsrc.wtf/api/movie/${tmdbId}`, {
      headers: {
        'Referer': 'https://vidsrc.wtf/',
        'User-Agent': 'Mozilla/5.0'
      }
    });
    console.log("Vidsrc WTF response:", res.status, res.data);
  } catch (err) {
    console.error("Vidsrc WTF failed:", err.message);
  }
}

testProviders();
