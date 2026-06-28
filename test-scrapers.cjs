const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');

// AES Decryption helper matching the native app signature
function nativeDecryptAes(cipherText, keyStr, ivStr) {
    try {
        const key = Buffer.from(keyStr, 'utf8');
        const iv = Buffer.from(ivStr, 'utf8');
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(cipherText, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch(e) {
        return "Decryption error: " + e.message;
    }
}

function printReport(extractor, targetName, status, url, referer) {
    console.log(`┌────────────────────────────────────────────────────────┐`);
    console.log(`  PROVIDER RESOLUTION REPORT`);
    console.log(`├────────────────────────────────────────────────────────┤`);
    console.log(`  [Target ID]: ${targetName}`);
    console.log(`  [Extractor]: ${extractor}`);
    console.log(`  [Status]: ${status}`);
    console.log(`  [Stream URL]: ${url}`);
    console.log(`  [Required Referer]: ${referer}`);
    console.log(`└────────────────────────────────────────────────────────┘\n`);
}

async function testStream(url, headers = {}) {
    try {
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                ...headers,
                'Range': 'bytes=0-100' // Request first few bytes to verify live state
            }
        });
        return {
            status: res.status + " " + res.statusText,
            ok: res.ok
        };
    } catch(e) {
        return {
            status: "ERROR: " + e.message,
            ok: false
        };
    }
}

async function runRelentlessLoop() {
    // List of real, popular blockbuster action and sci-fi movie and TV show IDs from TMDB
    const testTargets = [
        { id: "1399", type: "tv", name: "Game of Thrones S1E1", s: 1, e: 1 },
        { id: "550", type: "movie", name: "Fight Club" },
        { id: "157336", type: "movie", name: "Interstellar" },
        { id: "19995", type: "movie", name: "Avatar" }
    ];

    console.log(`==========================================================`);
    console.log(`STARTING RELENTLESS AUTOMATED VALIDATION LOOP`);
    console.log(`==========================================================\n`);

    // First verify our JS sandbox plugins are syntax/logic valid
    try {
        const filemoonCode = fs.readFileSync('android/app/src/main/assets/plugins/filemoon.js', 'utf8');
        const mockHtml = `<html><body><script>eval(function(p,a,c,k,e,d){return p;}("https://test.filemoon.to/play.m3u8",0,0,0,0,0))</script></body></html>`;
        const context = vm.createContext({ URL, console, JSON });
        vm.runInContext(filemoonCode + `\nvar result = extract(${JSON.stringify(mockHtml)}, "https://filemoon.to/e/test1234");`, context);
        console.log(`✔ JS sandbox check: filemoon.js compiler test OK`);
    } catch(e) {
        console.warn(`⚠ JS sandbox check: filemoon.js verification error:`, e.message);
    }

    // Now loop through target media and server endpoints until we get a successful live stream
    for (const target of testTargets) {
        console.log(`\nTesting Target: ${target.name} (TMDB-${target.id})...`);
        
        // Define sequential resolution attempts
        const attempts = [
            {
                name: "VidSrc PM (Fast Direct)",
                url: target.type === "tv" 
                    ? `http://localhost:8000/vidsrc-pm/tv/${target.id}/${target.s}/${target.e}`
                    : `http://localhost:8000/vidsrc-pm/movie/${target.id}`
            },
            {
                name: "VidSrc / Fallback (Failover)",
                url: target.type === "tv" 
                    ? `http://localhost:8000/fallback/tv/${target.id}/${target.s}/${target.e}`
                    : `http://localhost:8000/fallback/movie/${target.id}`
            },
            {
                name: "Vidify / Cloudnestra (Alternative)",
                url: target.type === "tv" 
                    ? `http://localhost:8000/vidify/tv/${target.id}/${target.s}/${target.e}`
                    : `http://localhost:8000/vidify/movie/${target.id}`
            },
            {
                name: "Vidlink Pro / Gateway",
                url: target.type === "tv"
                    ? `http://localhost:8000/tv/${target.id}/${target.s}/${target.e}`
                    : `http://localhost:8000/movie/${target.id}`
            }
        ];

        for (const attempt of attempts) {
            console.log(`  -> Trying server resolver: ${attempt.name}...`);
            try {
                const res = await fetch(attempt.url);
                if (!res.ok) {
                    console.log(`     ✖ Resolver returned HTTP ${res.status}`);
                    continue;
                }
                const data = await res.json();
                const sources = data.sources || [];
                if (sources.length === 0) {
                    console.log(`     ✖ No sources returned by resolver`);
                    continue;
                }

                const targetStream = sources[0];
                console.log(`     ✔ Stream found. Pinging connectivity to URL: ${targetStream.url.substring(0, 80)}...`);
                const ping = await testStream(targetStream.url);

                if (ping.ok) {
                    let referer = 'None';
                    if (targetStream.url.includes('referer=')) {
                        const match = targetStream.url.match(/referer=([^&]+)/);
                        if (match) referer = decodeURIComponent(match[1]);
                    }
                    console.log(`\n  ================ SUCCESS: LIVE STREAM CAPTURED ================`);
                    printReport(attempt.name, `${target.name} (TMDB-${target.id})`, `200 OK (LIVE)`, targetStream.url, referer);
                    return; // Stop the loop since we achieved our goal!
                } else {
                    console.log(`     ✖ Ping check failed: ${ping.status}`);
                }
            } catch (err) {
                console.log(`     ✖ Error calling resolver: ${err.message}`);
            }
        }
    }

    console.error(`\n❌ Relentless loop completed. All target streams and resolvers were exhausted without achieving 200 OK.`);
    process.exit(1);
}

runRelentlessLoop();
