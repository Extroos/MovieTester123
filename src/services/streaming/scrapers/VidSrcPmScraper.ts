import { Capacitor } from '@capacitor/core';
import { getLocalServerUrl } from '../LocalStreamService';

export async function scrapeVidsrcPmStream(tmdbId: string, type: 'movie' | 'tv', season = 1, episode = 1): Promise<any> {
  let baseApi = 'https://streamdata.vaplayer.ru';
  try {
    const { getGateway } = await import('../RemoteConfigService');
    const remoteApi = await getGateway('vidsrc_pm');
    if (remoteApi) baseApi = remoteApi;
  } catch (e) {
    console.warn('[VidSrcPmScraper] Failed to fetch dynamic gateway, using fallback:', e);
  }

  const param = tmdbId.startsWith("tt") ? "imdb" : "tmdb";
  let url = `${baseApi}/api.php?${param}=${tmdbId}&type=${type}`;
  if (type === 'tv') {
    url += `&season=${season}&episode=${episode}`;
  }

  const localServer = getLocalServerUrl() || 'http://localhost:3001';
  const endpoints = [
    `${localServer}/meta/tmdb/watch/${tmdbId}?type=${type}&server=vidsrc-pm${type === 'tv' ? `&s=${season}&e=${episode}` : ''}`,
    `https://cinemovie-proxy.abderrahmanchakkouri.workers.dev/meta/tmdb/watch/${tmdbId}?type=${type}&server=vidsrc-pm${type === 'tv' ? `&s=${season}&e=${episode}` : ''}`
  ];

  for (const ep of endpoints) {
    try {
      console.log(`[Client VidSrc PM] Trying resolver: ${ep}`);
      const res = await fetch(ep);
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {}
  }

  console.log(`[Client VidSrc PM Fallback] Scraping directly: ${url}`);
  try {
    let resText = '';
    if (Capacitor.isNativePlatform()) {
      const nativeFetch = await import('../../../utils/nativeFetch');
      const res = await nativeFetch.fetchWithCapacitor(url, 'text');
      if (!res.ok) throw new Error('vidsrc.pm direct API failed');
      resText = await res.text();
    } else {
      let proxiedUrl = `${localServer}/local-proxy?url=${encodeURIComponent(url)}&referer=${encodeURIComponent('https://brightpathsignals.com/')}&origin=${encodeURIComponent('https://brightpathsignals.com')}`;
      let res;
      try {
        res = await fetch(proxiedUrl);
      } catch (e) {
        proxiedUrl = `https://cinemovie-proxy.abderrahmanchakkouri.workers.dev/local-proxy?url=${encodeURIComponent(url)}&referer=${encodeURIComponent('https://brightpathsignals.com/')}&origin=${encodeURIComponent('https://brightpathsignals.com')}`;
        res = await fetch(proxiedUrl);
      }
      if (!res.ok) throw new Error('vidsrc.pm direct API failed');
      resText = await res.text();
    }

    const data = typeof resText === 'string' ? JSON.parse(resText) : resText;
    if (data.status_code == 200 || data.status_code == "200") {
      const streamData = data.data || {};
      const streamUrls = streamData.stream_urls || [];
      const sources = streamUrls.map((stream: string, idx: number) => {
        const delimiter = stream.includes('?') ? '&' : '?';
        const markedUrl = `${stream}${delimiter}origin_referer=${encodeURIComponent('https://brightpathsignals.com/')}`;
        return {
          url: markedUrl,
          quality: idx === 0 ? 'auto' : `backup ${idx}`,
          isM3U8: true
        };
      });
      const subs = (data.default_subs || streamData.default_subs || []).map((sub: any) => {
        const fileUrl = sub.url || sub.file;
        const delimiter = fileUrl.includes('?') ? '&' : '?';
        const markedUrl = `${fileUrl}${delimiter}origin_referer=${encodeURIComponent('https://brightpathsignals.com/')}`;
        return {
          url: markedUrl,
          lang: sub.lang || sub.label || 'English'
        };
      });
      return { sources, subtitles: subs };
    }
    throw new Error("No stream data found in vaplayer response");
  } catch (e: any) {
    console.error(`[Client VidSrc PM Fallback] Failed:`, e.message);
    throw e;
  }
}
