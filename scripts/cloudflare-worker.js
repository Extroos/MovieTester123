/**
 * CINE-MOVIE UNIFIED WORKER v1.3.6 (ULTIMATE Master)
 * Corrected Data Root Hierarchy + Safe-Link Decoding + VidSrc Fixed.
 */

export default {
    async fetch(request, env, ctx) {
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, HEAD',
            'Access-Control-Allow-Headers': 'Content-Type, Bypass-Tunnel-Reminder, X-Requested-With',
            'Access-Control-Max-Age': '86400',
        };

        const respond = (data, status = 200, type = 'application/json') => {
            const body = type === 'application/json' ? JSON.stringify(data) : data;
            return new Response(body, {
                status,
                headers: { ...corsHeaders, 'Content-Type': type }
            });
        };

        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
        if (request.method === 'HEAD') return new Response(null, { status: 200, headers: corsHeaders });

        try {
            const url = new URL(request.url);
            const path = url.pathname;

            if (path === '/proxy') return handleProxy(request, respond, corsHeaders);
            if (path.startsWith('/vidsrc/')) return handleVidSrc(path, respond);
            if (path.startsWith('/vidsrc-pm/')) return handleVidSrcPm(path, respond);

            if (path === '/') return respond({ status: 'ACTIVE', v: '1.4.0' });
            return respond({ error: 'Route Not Found', path }, 404);
        } catch (e) {
            return respond({ error: 'Worker Interior Error', message: e.message, data: {} }, 200);
        }
    }
};

async function handleVidSrc(path, respond) {
    try {
        let t = path.replace('/vidsrc', '');
        if (t === '/movie' || t === '/tv' || t === '/movie/' || t === '/tv/') t += '/latest';
        if (t.startsWith('/movie/')) t = `/api/movie/latest?page=${t.split('/').pop()}`;
        else if (t.startsWith('/tv/')) t = `/api/tv/latest?page=${t.split('/').pop()}`;
        else if (t.startsWith('/episodes/')) t = `/api/episode/latest?page=${t.split('/').pop()}`;
        const res = await fetch(`https://vidsrc.icu${t}`, { signal: AbortSignal.timeout(6000) });
        const text = await res.text();
        try { return respond(JSON.parse(text)); } catch { return respond({ result: [] }); }
    } catch (e) { return respond({ result: [] }); }
}

async function handleVidSrcPm(path, respond) {
    try {
        const targetPath = path.replace('/vidsrc-pm', '');
        const res = await fetch(`https://streamdata.vaplayer.ru${targetPath}`, {
            headers: { 'Referer': 'https://brightpathsignals.com/' },
            signal: AbortSignal.timeout(10000)
        });
        const type = res.headers.get('Content-Type') || 'text/html';
        const body = await res.text();
        return respond(body, 200, type);
    } catch (e) {
        return respond({ error: e.message }, 500);
    }
}

async function handleProxy(request, respond, corsHeaders) {
    const url = new URL(request.url).searchParams.get('url');
    const ref = new URL(request.url).searchParams.get('referer');
    if (!url) return respond({ error: 'No URL' }, 400);
    try {
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': ref || 'https://vidsrc.icu/' }, signal: AbortSignal.timeout(10000) });
        const type = res.headers.get('Content-Type');
        if (url.includes('.m3u8')) {
            let t = await res.text();
            const base = url.split('/').slice(0, -1).join('/');
            const origin = new URL(request.url).origin;
            t = t.split('\n').map(l => (l.startsWith('#') || !l.trim()) ? l : `${origin}/proxy?url=${encodeURIComponent(l.startsWith('http') ? l : `${base}/${l}`)}&referer=${encodeURIComponent(ref || '')}`).join('\n');
            return respond(t, 200, type);
        }
        return new Response(res.body, { status: res.status, headers: { ...corsHeaders, 'Content-Type': type } });
    } catch (e) { return respond({ error: e.message }, 500); }
}
