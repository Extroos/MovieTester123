global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {}
} as any;

import { scrapeVidsrcFallback } from '../src/services/streaming/ClientScraperService';

async function test() {
  try {
    const res = await scrapeVidsrcFallback('tt28326501');
    console.log("Vidsrc.to stream data:", JSON.stringify(res, null, 2));
  } catch (err: any) {
    console.error("Vidsrc.to failed:", err.message);
  }
}

test();
