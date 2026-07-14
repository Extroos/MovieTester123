/**
 * Probe script to query the local Node server's YTS subtitles download endpoint
 * and check the output to see what the Python unzipper resolves.
 */
const http = require('http');

function queryLocalServer(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

async function run() {
  const link = '/subtitles/project-hail-mary-2026-arabic-yify-2149004';
  const url = `http://localhost:3001/movies/yts-subtitles/download?link=${encodeURIComponent(link)}`;
  console.log("Querying Node Server YTS download:", url);
  try {
    const res = await queryLocalServer(url);
    console.log("Status:", res.status);
    console.log("Body length:", res.body.length);
    console.log("Body preview:\n", res.body.substring(0, 500));
  } catch(e) {
    console.log("Error:", e.message);
  }
}

run();
