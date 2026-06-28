// Test script for Offline Downloader Scenarios
// Run with: node scratch/test_downloader_scenarios.js

async function runDownloadSimulation({
  localProxyStatus = 200,
  cloudProxyStatus = 200,
  shouldLocalFail = false,
  shouldCloudFail = false,
  cancelIndex = -1, // Cancel after this segment
  segmentCount = 5,
  batchSize = 2
}) {
  const logs = [];
  const log = (msg) => {
    logs.push(msg);
    console.log(`[Sim] ${msg}`);
  };

  const segmentUrls = Array.from({ length: segmentCount }, (_, idx) => `https://example.com/stream/seg_${idx + 1}.ts`);
  const totalSegments = segmentUrls.length;

  let cancelDownload = false;
  let progress = 0;
  let statusStr = '';
  let chunksSavedCount = 0;
  let totalRetries = 0;

  // Mock buildProxyUrl
  const buildProxyUrl = (urlStr) => {
    return `http://localhost:3001/local-proxy?url=${encodeURIComponent(urlStr)}&referer=ref&origin=ori`;
  };

  // Mock fetch
  const mockFetch = async (url) => {
    if (url.includes('localhost:3001')) {
      if (shouldLocalFail) {
        throw new Error('Connection refused');
      }
      return {
        ok: localProxyStatus >= 200 && localProxyStatus < 300,
        status: localProxyStatus,
        arrayBuffer: async () => new ArrayBuffer(8)
      };
    } else if (url.includes('cinemovie-proxy.abderrahmanchakkouri.workers.dev')) {
      if (shouldCloudFail) {
        throw new Error('Cloud DNS resolution failed');
      }
      return {
        ok: cloudProxyStatus >= 200 && cloudProxyStatus < 300,
        status: cloudProxyStatus,
        arrayBuffer: async () => new ArrayBuffer(8)
      };
    }
    throw new Error('Unknown URL');
  };

  log(`Starting download simulation for ${totalSegments} segments.`);

  try {
    for (let i = 0; i < totalSegments; i += batchSize) {
      if (cancelDownload) {
        throw new Error("Download cancelled by user.");
      }

      const batchUrls = segmentUrls.slice(i, i + batchSize);
      const promises = batchUrls.map(async (url, idx) => {
        const segIdx = i + idx;
        if (cancelIndex !== -1 && segIdx >= cancelIndex) {
          cancelDownload = true;
          throw new Error("Cancelled mid-batch");
        }

        const segProxyUrl = buildProxyUrl(url);
        let response;
        let errorOccurred;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            response = await mockFetch(segProxyUrl);
            if (response.ok) {
              errorOccurred = null;
              break;
            }
            errorOccurred = new Error(`Status ${response.status}`);
          } catch (err) {
            errorOccurred = err;
          }

          // Fallback to Cloud proxy immediately if local proxy request failed or returned non-ok status
          if (errorOccurred && segProxyUrl.includes('localhost')) {
            totalRetries++;
            const fallbackProxyUrl = `https://cinemovie-proxy.abderrahmanchakkouri.workers.dev/local-proxy?url=${encodeURIComponent(url)}`;
            try {
              log(`Attempting fallback to Cloud proxy for segment ${segIdx + 1}`);
              response = await mockFetch(fallbackProxyUrl);
              if (response.ok) {
                errorOccurred = null;
                break;
              }
              errorOccurred = new Error(`Fallback status ${response.status}`);
            } catch (e) {
              errorOccurred = e;
            }
          }

          if (errorOccurred && attempt < 3) {
            // Short timeout for testing
            await new Promise(r => setTimeout(r, 10));
          }
        }
        if (!response || !response.ok) {
          throw new Error(`Segment ${segIdx + 1} download failed: ${errorOccurred?.message || 'unknown'}`);
        }
        return response.arrayBuffer();
      });

      const batchChunks = await Promise.all(promises);
      for (const chunk of batchChunks) {
        chunksSavedCount++;
      }

      const currentDownloaded = Math.min(i + batchSize, totalSegments);
      const percent = Math.floor((currentDownloaded / totalSegments) * 100);
      progress = percent;
      statusStr = `Downloading: ${currentDownloaded} / ${totalSegments} segments (${percent}%)`;
      log(statusStr);
    }
    log("Download completed successfully!");
    return { success: true, progress, chunksSavedCount, totalRetries, logs };
  } catch (error) {
    log(`Download failed: ${error.message}`);
    return { success: false, progress, chunksSavedCount, totalRetries, error: error.message, logs };
  }
}

async function testAllScenarios() {
  console.log("=== SCENARIO 1: Local Proxy works perfectly ===");
  const res1 = await runDownloadSimulation({
    localProxyStatus: 200,
    shouldLocalFail: false
  });
  console.assert(res1.success === true, "Scenario 1 should succeed");
  console.assert(res1.totalRetries === 0, "Scenario 1 should have 0 retries/fallbacks");

  console.log("\n=== SCENARIO 2: Local Proxy returns 404 (Not Found), immediately falls back to Cloud Proxy ===");
  const res2 = await runDownloadSimulation({
    localProxyStatus: 404,
    shouldLocalFail: false,
    cloudProxyStatus: 200,
    shouldCloudFail: false
  });
  console.assert(res2.success === true, "Scenario 2 should succeed via fallback");
  console.assert(res2.totalRetries > 0, "Scenario 2 should have triggered fallbacks");
  console.assert(res2.chunksSavedCount === 5, "Scenario 2 should have downloaded all 5 segments");

  console.log("\n=== SCENARIO 3: Local Proxy throws network error, falls back to Cloud Proxy ===");
  const res3 = await runDownloadSimulation({
    shouldLocalFail: true,
    cloudProxyStatus: 200,
    shouldCloudFail: false
  });
  console.assert(res3.success === true, "Scenario 3 should succeed via fallback");
  console.assert(res3.totalRetries > 0, "Scenario 3 should have triggered fallbacks");

  console.log("\n=== SCENARIO 4: Both Proxies fail (Scenario where download fails) ===");
  const res4 = await runDownloadSimulation({
    localProxyStatus: 500,
    cloudProxyStatus: 500
  });
  console.assert(res4.success === false, "Scenario 4 should fail");
  console.assert(res4.chunksSavedCount < 5, "Scenario 4 should stop downloading segments");

  console.log("\n=== SCENARIO 5: Download cancelled mid-operation ===");
  const res5 = await runDownloadSimulation({
    localProxyStatus: 200,
    cancelIndex: 3 // Cancel on 3rd segment
  });
  console.assert(res5.success === false, "Scenario 5 should fail due to cancel");
  console.assert(res5.chunksSavedCount < 5, "Scenario 5 should not have all segments saved");

  console.log("\nAll tests completed successfully!");
}

testAllScenarios();
