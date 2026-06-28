// Vidplay Extractor JS Plugin
function extract(cipherData, keysJson) {
    try {
        var keys = JSON.parse(keysJson);
        var decrypted = decryptAes(cipherData, keys.key1, keys.key2);
        return JSON.stringify({
            source_url: decrypted,
            headers: {
                "Referer": "https://vidplay.site/",
                "Origin": "https://vidplay.site",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            },
            subtitles: []
        });
    } catch(e) {
        return JSON.stringify({ error: e.message });
    }
}

function decryptAes(cipher, k1, k2) {
    return nativeDecryptAes(cipher, k1, k2);
}
