/**
 * Probe script to fetch the HTML detail page of a subtitle on yifysubtitles.ch
 * and print out the download-subtitle href attribute to check if it matches our regex.
 */
const https = require('https');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    };
    const req = https.get(url, opts, (res) => {
      let data = [];
      res.on('data', chunk => data.push(chunk));
      res.on('end', () => resolve(Buffer.concat(data).toString('utf8')));
    });
    req.on('error', reject);
  });
}

async function run() {
  // Let's check a typical subtitle detail page link returned by YTS search
  // e.g. "/subtitles/project-hail-mary-2026-arabic-yify-2149004"
  const link = '/subtitles/project-hail-mary-2026-arabic-yify-2149004';
  const url = `https://yifysubtitles.ch${link}`;
  console.log("Fetching detail page HTML from:", url);
  try {
    const html = await fetchUrl(url);
    console.log("HTML length:", html.length);
    // Find all links containing class="btn-icon download-subtitle" or similar
    const btnMatches = [...html.matchAll(/href="([^"]*)"/g)].map(m => m[1]).filter(l => l.includes('subtitle'));
    console.log("Links containing 'subtitle' in href:", btnMatches);
    
    const downloadHrefMatch = html.match(/class="btn-icon download-subtitle"\s+href="([^"]*)"/);
    console.log("Regex match 1 (btn-icon download-subtitle):", downloadHrefMatch ? downloadHrefMatch[1] : 'NONE');

    const downloadHrefMatch2 = html.match(/href="([^"]*)"[^>]*class="btn-icon download-subtitle"/);
    console.log("Regex match 2 (href first, then class):", downloadHrefMatch2 ? downloadHrefMatch2[1] : 'NONE');

    const downloadHrefMatch3 = html.match(/class="[^"]*download-subtitle[^"]*"\s+href="([^"]*)"/);
    console.log("Regex match 3 (class with download-subtitle anywhere):", downloadHrefMatch3 ? downloadHrefMatch3[1] : 'NONE');
  } catch(e) {
    console.log("Error:", e.message);
  }
}

run();
