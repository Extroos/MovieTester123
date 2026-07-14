/**
 * Test script to directly request the Python /unzip-srt endpoint on port 8000
 * using curl_requests via python to see what it downloads and what headers it uses.
 */
const http = require('http');

function queryPythonUnzipper(zipUrl) {
  const url = `http://localhost:8000/unzip-srt?url=${encodeURIComponent(zipUrl)}&referer=${encodeURIComponent('https://yifysubtitles.ch/subtitles/project-hail-mary-2026-arabic-yify-2149004')}`;
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

async function run() {
  const zipUrl = 'https://yifysubtitles.ch/subtitle/project-hail-mary-2026-arabic-yify-2149004.zip';
  console.log("Querying Python unzipper directly:", zipUrl);
  try {
    const res = await queryPythonUnzipper(zipUrl);
    console.log("Status:", res.status);
    console.log("Body length:", res.body.length);
    console.log("Body preview:\n", res.body.substring(0, 500));
  } catch(e) {
    console.log("Error:", e.message);
  }
}

run();
