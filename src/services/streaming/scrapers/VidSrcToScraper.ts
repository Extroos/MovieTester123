export async function scrapeVidsrcFallback(tmdbId: string, isTv = false, season = 1, episode = 1): Promise<any> {
  let embedBase = 'https://vidsrc.to';
  try {
    const { getGateway } = await import('../RemoteConfigService');
    const remoteGateway = await getGateway('vidsrc_to');
    if (remoteGateway) embedBase = remoteGateway;
  } catch (e) {
    console.warn('[VidSrcToScraper] Failed to fetch dynamic gateway, using fallback:', e);
  }

  const embedUrl = isTv
    ? `${embedBase}/embed/tv/${tmdbId}/${season}-${episode}`
    : `${embedBase}/embed/movie/${tmdbId}`;

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml',
    'Referer': 'https://google.com/'
  };

  try {
    console.log(`[Client VidSrc] Fetching vidsrc.to: ${embedUrl}`);
    const res1 = await fetch(embedUrl, { headers });
    if (!res1.ok) throw new Error(`vidsrc.to returned ${res1.status}`);
    const html1 = await res1.text();

    const vsembedMatch = html1.match(/src="(https?:\/\/vsembed[^"]+)"/);
    if (!vsembedMatch) throw new Error("No vsembed.ru iframe found in vidsrc.to page");
    const vsembedUrl = vsembedMatch[1];
    console.log(`[Client VidSrc] vsembed URL: ${vsembedUrl}`);

    const vsembedHeaders = { ...headers, 'Referer': embedUrl };
    const res2 = await fetch(vsembedUrl, { headers: vsembedHeaders });
    if (!res2.ok) throw new Error(`vsembed.ru returned ${res2.status}`);
    const html2 = await res2.text();

    const iframeSrcMatch = html2.match(/id="player_iframe"\s*src="([^"]+)"/);
    if (!iframeSrcMatch) throw new Error("No player_iframe found in vsembed.ru page");
    let iframeUrl = iframeSrcMatch[1];
    if (iframeUrl.startsWith('//')) iframeUrl = 'https:' + iframeUrl;

    const iframeUrlObj = new URL(iframeUrl);
    const activeCloudDomain = iframeUrlObj.origin;
    const rcpHashMatch = iframeUrl.match(/\/rcp\/([A-Za-z0-9_\-=.]+)/);
    if (!rcpHashMatch) throw new Error("No rcp hash found in iframe URL");
    const rcpHash = rcpHashMatch[1];

    const rcpUrl = `${activeCloudDomain}/rcp/${rcpHash}`;
    console.log(`[Client VidSrc] resolved rcp URL: ${rcpUrl}`);

    const rcpHeaders = { ...headers, 'Referer': vsembedUrl };
    const res3 = await fetch(rcpUrl, { headers: rcpHeaders });
    if (!res3.ok) throw new Error(`rcp endpoint returned ${res3.status}`);
    const html3 = await res3.text();
    if (html3.includes('cf-turnstile')) throw new Error("rcp is Cloudflare Turnstile protected");

    const prorcpMatch = html3.match(/src:\s*['"]\s*\/prorcp\/([^'"]+)['"]/i);
    if (!prorcpMatch) throw new Error("prorcp hash not found in rcp page");
    const prorcpHash = prorcpMatch[1];
    const prorcpUrl = `${activeCloudDomain}/prorcp/${prorcpHash}`;
    console.log(`[Client VidSrc] resolved prorcp URL: ${prorcpUrl}`);

    const prorcpHeaders = { ...headers, 'Referer': rcpUrl };
    const res4 = await fetch(prorcpUrl, { headers: prorcpHeaders });
    if (!res4.ok) throw new Error(`prorcp endpoint returned ${res4.status}`);
    const html4 = await res4.text();

    const m3u8Match = html4.match(/"(https?:\/\/[^"]+\.m3u8[^"]*)"/i);
    if (!m3u8Match) throw new Error("m3u8 stream not found in prorcp page");

    const rawMatched = m3u8Match[1];
    const rawStreams = rawMatched.split(/\s+or\s+/);

    const workingStreams = rawStreams.filter(s => s.includes('/pl/') || s.includes('/cdnstr/') || s.includes('master.m3u8') || s.includes('list.m3u8'));
    const finalStreams = workingStreams.length > 0 ? workingStreams : rawStreams;

    const sources = finalStreams.map((stream, idx) => {
      const cleaned = stream.replace(/\{v\d\}/g, 'cloudnestra.com');
      return {
        url: cleaned,
        quality: idx === 0 ? 'auto' : `backup ${idx}`,
        isM3U8: true
      };
    });
    const subtitles: any[] = [];
    try {
      const tracksMatch = html4.match(/tracks:\s*(\[[^\]]+\])/);
      if (tracksMatch) {
        const cleanTracksText = tracksMatch[1].replace(/'/g, '"').replace(/([a-zA-Z0-9_]+)\s*:/g, '"$1":');
        const tracks = JSON.parse(cleanTracksText);
        for (const track of tracks) {
          if (track.file) {
            subtitles.push({
              url: track.file,
              lang: track.label || track.language || 'Unknown'
            });
          }
        }
      }
    } catch (_) {}

    if (subtitles.length === 0) {
      const trackRegex = /<track\s+[^>]*src="([^"]+)"[^>]*label="([^"]+)"/g;
      let match;
      while ((match = trackRegex.exec(html4)) !== null) {
        subtitles.push({
          url: match[1],
          lang: match[2]
        });
      }
    }

    console.log(`[Client VidSrc] Success: resolved ${sources.length} streams, ${subtitles.length} subtitles`);
    return { sources, subtitles };

  } catch (e: any) {
    console.error(`[Client VidSrc] Failed: ${e.message}`);
    throw new Error(`VidSrc stream extraction failed: ${e.message}`);
  }
}
