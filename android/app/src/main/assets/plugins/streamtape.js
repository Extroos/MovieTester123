// Streamtape Extractor JS Plugin
function extract(html, url) {
    var match = html.match(/document\.getElementById\(['"]robotlink['"]\)\.innerHTML\s*=\s*['"]([^'"]+)['"]\s*\+\s*['"]([^'"]+)['"]/);
    if (match) {
        var streamUrl = "https:" + match[1] + match[2];
        return JSON.stringify({
            source_url: streamUrl,
            headers: {
                "Referer": url,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            },
            subtitles: []
        });
    }
    var match2 = html.match(/getElementById\(['"]robotlink['"]\)\.innerHTML\s*=\s*(.+?);/);
    if (match2) {
        try {
            var val = eval(match2[1]);
            if (val) {
                var streamUrl = val.startsWith("http") ? val : "https:" + val;
                return JSON.stringify({
                    source_url: streamUrl,
                    headers: {
                        "Referer": url,
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                    },
                    subtitles: []
                });
            }
        } catch(e) {}
    }
    return JSON.stringify({ error: "No stream found in Streamtape" });
}
