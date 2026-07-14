#!/usr/bin/env node
/**
 * test_vidsrcpm.cjs
 * Tests the VidSrc PM (streamdata.vaplayer.ru) API directly.
 * Run: node test_vidsrcpm.cjs
 */

const https = require('https');
const http = require('http');

const PM_REFERER = 'https://brightpathsignals.com/';
const PM_ORIGIN  = 'https://brightpathsignals.com';

const TEST_CASES = [
  { name: 'Avengers: Endgame', tmdbId: '299534', type: 'movie' },
  { name: 'Inception',         tmdbId: '27205',  type: 'movie' },
  { name: 'Breaking Bad S1E1', tmdbId: '1396',   type: 'tv', season: 1, episode: 1 },
  { name: 'Oppenheimer',       tmdbId: '872585',  type: 'movie' },
];

function fetch(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, text: data }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

async function testCase({ name, tmdbId, type, season, episode }) {
  const url = type === 'tv'
    ? `https://streamdata.vaplayer.ru/api.php?tmdb=${tmdbId}&type=tv&season=${season}&episode=${episode}`
    : `https://streamdata.vaplayer.ru/api.php?tmdb=${tmdbId}&type=movie`;

  console.log(`\n[TEST] ${name} (${type} | TMDB: ${tmdbId})`);
  console.log(`  URL: ${url}`);

  try {
    const { status, text } = await fetch(url, {
      'Referer': PM_REFERER,
      'Origin': PM_ORIGIN,
      'User-Agent': 'Mozilla/5.0 (Linux; Android 13) CineMovie/1.0'
    });

    if (status !== 200) {
      console.log(`  ❌ HTTP ${status}`);
      return false;
    }

    const data = JSON.parse(text);
    const statusCode = data?.status_code;

    if (statusCode !== 200 && statusCode !== '200') {
      console.log(`  ❌ API status_code=${statusCode} | msg=${data?.message || data?.status_message || 'unknown'}`);
      return false;
    }

    const streamData = data?.data || {};
    const streamUrls = streamData?.stream_urls || [];
    const subs       = data?.default_subs || streamData?.default_subs || [];

    if (streamUrls.length === 0) {
      console.log(`  ⚠️  status_code=200 but stream_urls is empty`);
      return false;
    }

    console.log(`  ✅ ${streamUrls.length} stream URL(s) | ${subs.length} subtitle(s)`);
    console.log(`     First stream: ${streamUrls[0].substring(0, 80)}...`);
    if (subs.length > 0) {
      console.log(`     First sub: [${subs[0].lang}] ${(subs[0].url || subs[0].file || '').substring(0, 60)}`);
    }
    return true;
  } catch (e) {
    console.log(`  ❌ Error: ${e.message}`);
    return false;
  }
}

async function run() {
  console.log('=== VidSrc PM (streamdata.vaplayer.ru) API Test ===');
  let passed = 0;
  for (const tc of TEST_CASES) {
    const ok = await testCase(tc);
    if (ok) passed++;
    // Small delay between requests
    await new Promise(r => setTimeout(r, 500));
  }
  console.log(`\n=== Results: ${passed}/${TEST_CASES.length} passed ===`);
  if (passed === 0) {
    console.log('⚠️  All tests failed. The API may be down or the domain has changed.');
    console.log('   Update "vidsrc_pm_gateways" in config.json via OTA if needed.');
  } else if (passed < TEST_CASES.length) {
    console.log('⚠️  Some tests failed. This is normal for content not indexed by VidSrc PM.');
  } else {
    console.log('✅ All tests passed! VidSrc PM API is working correctly.');
  }
}

run().catch(console.error);
