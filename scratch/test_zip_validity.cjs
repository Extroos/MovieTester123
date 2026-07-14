/**
 * Probe script to download the zip file from yifysubtitles.ch
 * and print out the first 100 bytes of the response body to see if it is a valid zip (starting with PK..)
 * or if it's Cloudflare or HTML block.
 */
const https = require('https');

function fetchUrl(url, referer) {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': referer
      }
    };
    const req = https.get(url, opts, (res) => {
      let data = [];
      res.on('data', chunk => data.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(data) }));
    });
    req.on('error', reject);
  });
}

async function run() {
  const referer = 'https://yifysubtitles.ch/subtitles/project-hail-mary-2026-arabic-yify-2149004';
  const zipUrl = 'https://yifysubtitles.ch/subtitle/project-hail-mary-2026-arabic-yify-2149004.zip';
  console.log("Fetching ZIP from:", zipUrl);
  try {
    const res = await fetchUrl(zipUrl, referer);
    console.log("Status:", res.status);
    console.log("Body length:", res.body.length);
    console.log("First 100 bytes (ASCII):", res.body.toString('ascii', 0, 100));
    console.log("First 10 bytes (HEX):", res.body.toString('hex', 0, 10));
  } catch(e) {
    console.log("Error:", e.message);
  }
}

run();
