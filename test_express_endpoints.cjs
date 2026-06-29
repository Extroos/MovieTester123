// test_express_endpoints.cjs
// A test script to query the CineMovie Express backend endpoints for real media.
// Make sure the local Express server is running (npm run dev / node server.js) before running this script!

const http = require('http');

const testCases = [
  {
    name: 'Movie: Three Bags Full: A Sheep Detective Movie (TMDb 1301421)',
    url: 'http://localhost:3001/meta/tmdb/watch/1301421?type=movie&server=auto&title=Three%20Bags%20Full'
  },
  {
    name: 'Movie: Avengers Endgame (TMDb 299534)',
    url: 'http://localhost:3001/meta/tmdb/watch/299534?type=movie&server=vidsrc-wtf-2&title=Avengers%20Endgame'
  },
  {
    name: 'Movie: Batman Begins (TMDb 272)',
    url: 'http://localhost:3001/meta/tmdb/watch/272?type=movie&server=vidlink-pro&title=Batman%20Begins'
  },
  {
    name: 'TV Show: Wednesday Season 1 Episode 1 (TMDb 94605)',
    url: 'http://localhost:3001/meta/tmdb/watch/94605?type=tv&s=1&e=1&server=auto&title=Wednesday'
  }
];

function testEndpoint(testCase) {
  return new Promise((resolve) => {
    console.log(`\n==================================================`);
    console.log(`Testing Case: ${testCase.name}`);
    console.log(`Request URL: ${testCase.url}`);
    console.log(`==================================================`);

    http.get(testCase.url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(data);
            console.log(`Status: SUCCESS (200 OK)`);
            console.log(`Sources Resolved: ${parsed.sources ? parsed.sources.length : 0}`);
            if (parsed.sources && parsed.sources.length > 0) {
              console.log(`Primary Stream URL: ${parsed.sources[0].url}`);
              console.log(`Quality: ${parsed.sources[0].quality}`);
            }
            console.log(`Subtitles Resolved: ${parsed.subtitles ? parsed.subtitles.length : 0}`);
            resolve(true);
          } catch (e) {
            console.error(`Status: FAILED (Invalid JSON response)`);
            console.error(data.substring(0, 300));
            resolve(false);
          }
        } else {
          console.error(`Status: FAILED (HTTP Status Code: ${res.statusCode})`);
          console.error(data.substring(0, 300));
          resolve(false);
        }
      });
    }).on('error', (err) => {
      console.error(`Status: ERROR (Could not connect to Express server: ${err.message})`);
      console.log(`Please make sure the local server is running by executing 'npm run dev' or 'node server.js' first!`);
      resolve(false);
    });
  });
}

async function runAllTests() {
  console.log('Starting backend Express endpoint tests...');
  for (const testCase of testCases) {
    await testEndpoint(testCase);
  }
  console.log('\nAll tests completed.');
}

runAllTests();
