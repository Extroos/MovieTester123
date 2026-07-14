export async function scrapeVidifyStream(tmdbId: string, isTv = false, season = 1, episode = 1): Promise<any> {
  let embedBase = 'https://pro.vidify.top';
  try {
    const { getGateway } = await import('../RemoteConfigService');
    const remoteGateway = await getGateway('vidify');
    if (remoteGateway) embedBase = remoteGateway;
  } catch (e) {
    console.warn('[VidifyScraper] Failed to fetch dynamic gateway, using fallback:', e);
  }

  const vidifyUrl = isTv
    ? `${embedBase}/embed/tv/${tmdbId}/${season}/${episode}`
    : `${embedBase}/embed/movie/${tmdbId}`;

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml',
    'Referer': 'https://google.com/'
  };

  try {
    console.log(`[Client Vidify] Fetching: ${vidifyUrl}`);
    const res1 = await fetch(vidifyUrl, { headers });
    if (!res1.ok) throw new Error(`pro.vidify.top returned ${res1.status}`);
    const html1 = await res1.text();

    const serverMatch = html1.match(/data-server=["']([^"']+)["']/);
    if (!serverMatch) throw new Error(`Movie ${tmdbId} not found in Vidify database (no data-server attribute)`);

    const b64Val = serverMatch[1];
    const decodedUrl = atob(b64Val);
    console.log(`[Client Vidify] Decoded server URL: ${decodedUrl.substring(0, 80)}`);

    const rcpHashMatch = decodedUrl.match(/cloudnestra\.com\/rcp\/([A-Za-z0-9_\-=.]+)/);
    if (!rcpHashMatch) throw new Error(`Decoded Vidify URL is not a cloudnestra rcp URL`);
    const rcpHash = rcpHashMatch[1];
    const rcpUrl = `https://cloudnestra.com/rcp/${rcpHash}`;

    const rcpHeaders = { ...headers, 'Referer': 'https://vsembed.ru/' };
    const res2 = await fetch(rcpUrl, { headers: rcpHeaders });
    if (!res2.ok) throw new Error(`cloudnestra/rcp returned ${res2.status}`);
    const html2 = await res2.text();
    if (html2.includes('cf-turnstile')) throw new Error("cloudnestra/rcp is Cloudflare Turnstile protected");

    const prorcpMatch = html2.match(/src:\s*['"]\s*\/prorcp\/([^'"]+)['"]/i);
    if (!prorcpMatch) throw new Error("prorcp hash not found in cloudnestra/rcp page");
    const prorcpHash = prorcpMatch[1];
    const prorcpUrl = `https://cloudnestra.com/prorcp/${prorcpHash}`;

    const prorcpHeaders = { ...headers, 'Referer': rcpUrl };
    const res3 = await fetch(prorcpUrl, { headers: prorcpHeaders });
    if (!res3.ok) throw new Error(`cloudnestra/prorcp returned ${res3.status}`);
    const html3 = await res3.text();

    const m3u8Match = html3.match(/"(https?:\/\/[^"]+\.m3u8[^"]*)"/i);
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

    console.log(`[Client Vidify] Success: resolved ${sources.length} streams`);
    return { sources, subtitles: [] };

  } catch (e: any) {
    console.error(`[Client Vidify] Failed: ${e.message}`);
    throw new Error(`Vidify stream extraction failed: ${e.message}`);
  }
}
