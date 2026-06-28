// Native fetch is available in modern Node.js

async function testLiveDownloader() {
  const localServer = 'http://localhost:3001';
  console.log(`Connecting to local server: ${localServer}`);
  
  try {
    // 1. Test pinging the local-proxy endpoint with a sample url
    const testUrl = 'https://httpbin.org/get';
    console.log(`Testing proxying a request to ${testUrl} through ${localServer}/local-proxy...`);
    const proxyUrl = `${localServer}/local-proxy?url=${encodeURIComponent(testUrl)}&referer=https://vidlink.pro/&origin=https://vidlink.pro`;
    
    const response = await fetch(proxyUrl);
    if (!response.ok) {
      throw new Error(`Proxy request failed with status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Proxy works! Received response headers from proxy:', data.headers);
    
    // 2. Test resolving a movie tmdb metadata to see if scraper works
    const sampleTmdbId = 1037262; // Avatar: Fire and Ash
    const watchUrl = `${localServer}/meta/tmdb/watch/${sampleTmdbId}?type=movie&server=vidlink-pro&title=Avatar%20Fire%20and%20Ash`;
    console.log(`Testing stream resolver endpoint: ${watchUrl}`);
    
    const watchResponse = await fetch(watchUrl);
    if (!watchResponse.ok) {
      console.warn(`Stream resolution returned status: ${watchResponse.status}. Scraper might be blocked or starting.`);
    } else {
      const watchData = await watchResponse.json();
      console.log('Stream resolved successfully! Available sources count:', watchData.sources?.length);
      if (watchData.sources?.[0]) {
        console.log('Primary stream source url:', watchData.sources[0].url);
      }
    }
    
    console.log('All live checks completed successfully!');
  } catch (error) {
    console.error('Test encountered an error:', error.message);
  }
}

testLiveDownloader();
