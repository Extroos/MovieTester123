// Filemoon Extractor JS Plugin
function extract(html, url) {
    console.log("[Filemoon JS] Extracting from URL: " + url + ", HTML size: " + html.length + " bytes.");
    var host = "";
    var hostMatch = url.match(/https?:\/\/([^\/]+)/);
    if (hostMatch) {
        host = hostMatch[1];
    } else {
        host = "filemoon.sx";
    }

    // 1. Check for NextJS state data __NEXT_DATA__
    var nextDataMatch = html.match(/<script\s+id="__NEXT_DATA__"\s+type="application\/json"\s*>(.*?)<\/script>/s);
    if (nextDataMatch) {
        console.log("[Filemoon JS] Found __NEXT_DATA__ script block.");
        try {
            var dataObj = JSON.parse(nextDataMatch[1]);
            var fmUrl = findFilemoonLinkInObject(dataObj, url);
            if (fmUrl) {
                console.log("[Filemoon JS] Discovered Filemoon URL in NextJS state: " + fmUrl);
                return JSON.stringify({ filemoon_redirect: fmUrl });
            }
        } catch (e) {
            console.log("[Filemoon JS] Error parsing __NEXT_DATA__: " + e.message);
        }
    }

    // 2. Check for NextJS Server Components self.__next_f.push
    var nextPushMatches = html.match(/self\.__next_f\.push\((.*?)\)/g);
    if (nextPushMatches) {
        console.log("[Filemoon JS] Found self.__next_f.push entries.");
        for (var i = 0; i < nextPushMatches.length; i++) {
            var content = nextPushMatches[i];
            var fmUrl = findFilemoonLinkInString(content, url);
            if (fmUrl) {
                console.log("[Filemoon JS] Discovered Filemoon URL in next_f.push entry: " + fmUrl);
                return JSON.stringify({ filemoon_redirect: fmUrl });
            }
        }
    }

    // 3. Check for general nested filemoon redirects (that are not the current URL)
    var generalFmMatch = html.match(/(https?:\/\/[^'"\s]*(?:filemoon|sx\/e\/|to\/e\/)[^'"\s]*)/i);
    if (generalFmMatch && generalFmMatch[1] && generalFmMatch[1] !== url) {
        console.log("[Filemoon JS] Found general filemoon redirect in HTML: " + generalFmMatch[1]);
        return JSON.stringify({ filemoon_redirect: generalFmMatch[1] });
    }

    var packedMatch = html.match(/eval\(function\(p,a,c,k,e,d\).+?\}\('(.+?)'\.split/);
    if (!packedMatch) {
        packedMatch = html.match(/eval\(function\(p,a,c,k,e,d\).+?\}\((.+?)\)/);
    }
    if (packedMatch) {
        console.log("[Filemoon JS] Found packed code block.");
        var unpacked = unpack(packedMatch[0]);
        console.log("[Filemoon JS] Unpacked snippet: " + unpacked.substring(0, 120));
        var m3u8Match = unpacked.match(/(https?:\/\/[^'"]+\.m3u8[^'"]*)/i);
        if (m3u8Match) {
            console.log("[Filemoon JS] Found m3u8 stream: " + m3u8Match[1]);
            return JSON.stringify({
                source_url: m3u8Match[1],
                headers: {
                    "Referer": url,
                    "Origin": "https://" + host,
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                },
                subtitles: []
            });
        }
    } else {
        console.log("[Filemoon JS] Packed code block (eval function) not found.");
    }
    var rawM3u8 = html.match(/(https?:\/\/[^'"]+\.m3u8[^'"]*)/i);
    if (rawM3u8) {
        console.log("[Filemoon JS] Found raw m3u8 link: " + rawM3u8[1]);
        return JSON.stringify({
            source_url: rawM3u8[1],
            headers: {
                "Referer": url,
                "Origin": "https://" + host,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            },
            subtitles: []
        });
    }
    console.log("[Filemoon JS] Extraction failed: No m3u8 link found.");
    return JSON.stringify({ error: "No stream found in Filemoon" });
}

function findFilemoonLinkInString(str, currentUrl) {
    var match = str.match(/(https?:\/\/[^'"\s\\]*(?:filemoon|sx\/e\/|to\/e\/)[^'"\s\\]*)/i);
    if (match && match[1] !== currentUrl) {
        return match[1].replace(/\\/g, '');
    }
    return null;
}

function findFilemoonLinkInObject(obj, currentUrl) {
    if (!obj) return null;
    if (typeof obj === 'string') {
        return findFilemoonLinkInString(obj, currentUrl);
    }
    if (Array.isArray(obj)) {
        for (var i = 0; i < obj.length; i++) {
            var res = findFilemoonLinkInObject(obj[i], currentUrl);
            if (res) return res;
        }
    } else if (typeof obj === 'object') {
        for (var key in obj) {
            if (obj.hasOwnProperty(key)) {
                var res = findFilemoonLinkInObject(obj[key], currentUrl);
                if (res) return res;
            }
        }
    }
    return null;
}

function unpack(packed) {
    var payload = packed;
    try {
        var functionBody = "var result = ''; function eval(code) { result = code; }; " + packed + "; return result;";
        var exec = new Function(functionBody);
        payload = exec();
    } catch(e) {}
    return payload;
}
