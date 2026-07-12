package com.cinemovie.app

import android.content.Intent
import android.util.Log
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

@CapacitorPlugin(name = "NativeStreamingEngine")
class NativeStreamingEnginePlugin : Plugin() {

    companion object {
        private val logsList = java.util.concurrent.CopyOnWriteArrayList<String>()
        
        @JvmField @Volatile var isTouchBoostActive = false
        @Volatile private var lastProxyHost = ""
        @Volatile private var lastProxyScheme = "https"
        @Volatile private var lastReferer = ""
        @Volatile private var lastOrigin = ""

        fun addLog(msg: String) {
            val time = java.text.SimpleDateFormat("HH:mm:ss.SSS", java.util.Locale.US).format(java.util.Date())
            logsList.add("[$time] $msg")
            if (logsList.size > 200) {
                logsList.removeAt(0)
            }
            android.util.Log.d("NativeStreamingEngine", msg)
        }
    }

    private val client = OkHttpClient.Builder()
        .connectTimeout(8, java.util.concurrent.TimeUnit.SECONDS)
        .readTimeout(8, java.util.concurrent.TimeUnit.SECONDS)
        .build()

    private val scope = CoroutineScope(Dispatchers.IO)
    private lateinit var jsEngine: JsPluginEngine
    private var proxyServer: java.net.ServerSocket? = null
    private var proxyRunning = false
    private var proxyPort = 8000
    private val ENABLE_REMOTE_OTA = true
    // Track which CDN domains have already had Cloudflare warmed up this session
    private val cfWarmedDomains = java.util.Collections.synchronizedSet(mutableSetOf<String>())

    private val defaultConfigJson = """
    {
      "gateways": {
        "cloudnestra": "https://cloudnestra.com",
        "vidsrc_pm": "https://streamdata.vaplayer.ru",
        "vidsrc_wtf": "https://vidsrc.wtf",
        "vidsrc_sbs": "https://vidsrc.sbs",
        "vidsrc_pk": "https://embed.vidsrc.pk",
        "vidsrc_fyi": "https://vidsrc.fyi",
        "vidzee": "https://player.vidzee.wtf",
        "vidzee_core": "https://core.vidzee.wtf",
        "vidsrc_top": "https://vid-src.top"
      },
      "embed_urls": {
        "vidsrc_pm_gateways": [
          "https://streamdata.vaplayer.ru",
          "https://api.vaplayer.ru",
          "https://data.vaplayer.ru"
        ],
        "vidsrc_pm_fallback": "https://streamdata.vaplayer.ru/api.php?tmdb={id}&type={type}{tv_params}",
        "vidsrc_pm_movie": "https://streamdata.vaplayer.ru/api.php?tmdb={id}&type=movie",
        "vidsrc_pm_tv": "https://streamdata.vaplayer.ru/api.php?tmdb={id}&type=tv&season={season}&episode={episode}"
      },
      "stream_patterns": [
        ".m3u8",
        ".mp4",
        "filemoon"
      ],
      "extractor_domains": {
        "filemoon": "filemoon.sx",
        "filemoon_embed": "https://filemoon.to/e/"
      },
      "subtitles": {
        "yts_subtitles_url": "https://yifysubtitles.org/movie-imdb/",
        "yts_subtitles_ch": "https://yifysubtitles.ch"
      },
      "headers": {
        "vidsrc_pm_referer": "https://nextgencloudfabric.com/",
        "vidsrc_pm_origin": "https://nextgencloudfabric.com",
        "cloudnestra_referer": "https://cloudnestra.com/",
        "cloudnestra_origin": "https://cloudnestra.com",
        "vidsrc_wtf_referer": "https://vidsrc.wtf/",
        "vidsrc_wtf_origin": "https://vidsrc.wtf",
        "vidsrc_sbs_referer": "https://vidsrc.sbs/",
        "vidsrc_sbs_origin": "https://vidsrc.sbs",
        "vidsrc_pk_referer": "https://embed.vidsrc.pk/",
        "vidsrc_pk_origin": "https://embed.vidsrc.pk",
        "vidsrc_fyi_referer": "https://vidsrc.fyi/",
        "vidsrc_fyi_origin": "https://vidsrc.fyi",
        "vidsrc_me_referer": "https://vidsrc.me/",
        "vidsrc_me_origin": "https://vidsrc.me"
      }
    }
    """.trimIndent()

    @Volatile private var remoteConfig = org.json.JSONObject(defaultConfigJson)

    private fun getOtaConfigUrl(): String {
        val prefs = context.getSharedPreferences("CineMovieOTA", android.content.Context.MODE_PRIVATE)
        return prefs.getString("ota_config_url", "https://raw.githubusercontent.com/Extroos/MovieTester123/main/config.json") ?: "https://raw.githubusercontent.com/Extroos/MovieTester123/main/config.json"
    }

    private fun setOtaConfigUrl(url: String) {
        val prefs = context.getSharedPreferences("CineMovieOTA", android.content.Context.MODE_PRIVATE)
        prefs.edit().putString("ota_config_url", url).apply()
    }

    private fun getCachedConfig(): String? {
        return null
    }

    private fun setCachedConfig(json: String) {
        val prefs = context.getSharedPreferences("CineMovieOTA", android.content.Context.MODE_PRIVATE)
        prefs.edit().putString("cached_config", json).apply()
    }

    private fun loadOtaConfig() {
        if (!ENABLE_REMOTE_OTA) {
            addLog("[OTA] Remote OTA config fetch is disabled. Reading bundled config.json from assets.")
            try {
                val inputStream = context.assets.open("public/config.json")
                val size = inputStream.available()
                val buffer = ByteArray(size)
                inputStream.read(buffer)
                inputStream.close()
                val jsonStr = String(buffer, Charsets.UTF_8)
                remoteConfig = org.json.JSONObject(jsonStr)
                addLog("[OTA] Successfully loaded local config.json from assets")
                return
            } catch (e: Exception) {
                addLog("[OTA] Failed to load local config.json from assets: ${e.message}")
            }
        }

        val cached = getCachedConfig()
        if (cached != null) {
            try {
                remoteConfig = org.json.JSONObject(cached)
                addLog("[OTA] Loaded config from cache")
            } catch (e: Exception) {
                addLog("[OTA] Failed to parse cached config: ${e.message}")
            }
        }
        
        scope.launch {
            val url = getOtaConfigUrl()
            addLog("[OTA] Fetching remote config from: $url")
            try {
                val req = Request.Builder()
                    .url(url)
                    .header("Cache-Control", "no-cache")
                    .header("Pragma", "no-cache")
                    .build()
                val response = client.newCall(req).execute()
                if (response.isSuccessful) {
                    val body = response.body?.string()
                    if (body != null && body.trim().startsWith("{")) {
                        org.json.JSONObject(body) // Validate JSON
                        setCachedConfig(body)
                        remoteConfig = org.json.JSONObject(body)
                        addLog("[OTA] Successfully updated and cached remote config")
                    } else {
                        addLog("[OTA] Remote config response body is not valid JSON")
                    }
                } else {
                    addLog("[OTA] Failed to fetch remote config: HTTP ${response.code}")
                }
            } catch (e: Exception) {
                addLog("[OTA] Network error fetching remote config: ${e.message}. Using cache/fallback.")
            }
        }
    }

    override fun load() {
        super.load()
        jsEngine = JsPluginEngine(context)
        jsEngine.warmUp()
        startLocalProxy()
        loadOtaConfig()
    }

    /**
     * Opens a hidden WebView on the UI thread pointing at [cdnBaseUrl] so that Android's
     * WebKit engine can solve the Cloudflare JS challenge for that domain.  Once the page
     * finishes loading we wait an extra 4 seconds for the CF challenge JS to complete and
     * flush the resulting `cf_clearance` cookie into the shared CookieManager.  Our local
     * proxy already forwards CookieManager cookies on every request, so all subsequent
     * segment fetches for this domain will pass Cloudflare.
     */
    /** Returns true if the URL belongs to a VidSrc PM CDN that uses token-auth (not CF cookies). */
    private fun isVidsrcPmCdnUrl(url: String): Boolean {
        return url.contains("smartbusinessframework.site") ||
               url.contains("lifestylefreedomlab.site") ||
               url.contains("highperformancebrands.site") ||
               url.contains("quietmidnightgardeningideas") ||
               url.contains("creativeautomationlab.site") ||
               url.contains("smartincomeplaybook.site") ||
               url.contains("brightpathsignals.com") ||
               url.contains("/content/") ||
               url.contains("/pl/") ||
               url.contains("/playlist/") ||
               url.contains("/mbzqN9iiy/") ||
               url.contains("/WnVM9YFN1/")
    }

    private fun warmUpCdnDomain(cdnUrl: String) {
        try {
            // VidSrc PM CDN domains use token-based auth — no CF cookie needed.
            // Skip the warmup entirely to avoid the 20-second blocking wait.
            if (isVidsrcPmCdnUrl(cdnUrl)) {
                addLog("[CF] Skipping warmup for VidSrc PM CDN (token-auth): $cdnUrl")
                return
            }
            val cdnUri = java.net.URI(cdnUrl)
            val cdnBase = "${cdnUri.scheme}://${cdnUri.host}"
            if (cfWarmedDomains.contains(cdnBase)) {
                addLog("[CF] $cdnBase already warmed up this session, skipping")
                return
            }
            addLog("[CF] Starting Cloudflare WebView warmup for $cdnBase …")
            val latch = java.util.concurrent.CountDownLatch(1)

            activity.runOnUiThread {
                try {
                    val wv = android.webkit.WebView(activity)
                    wv.settings.javaScriptEnabled = true
                    wv.settings.domStorageEnabled = true
                    wv.settings.databaseEnabled = true
                    wv.settings.userAgentString = "Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36"

                    wv.webViewClient = object : android.webkit.WebViewClient() {
                        private var released = false
                        private fun release(view: android.webkit.WebView?) {
                            if (released) return
                            released = true
                            // Give the Cloudflare JS challenge 4 more seconds to complete
                            view?.postDelayed({
                                android.webkit.CookieManager.getInstance().flush()
                                val cookies = android.webkit.CookieManager.getInstance().getCookie(cdnBase)
                                addLog("[CF] Warmup done for $cdnBase. Cookie snippet: ${cookies?.take(120)}")
                                cfWarmedDomains.add(cdnBase)
                                latch.countDown()
                            }, 4000L)
                        }
                        override fun onPageFinished(view: android.webkit.WebView?, url: String?) = release(view)
                        override fun onReceivedError(
                            view: android.webkit.WebView?,
                            request: android.webkit.WebResourceRequest?,
                            error: android.webkit.WebResourceError?
                        ) {
                            addLog("[CF] WebView error for $cdnBase: ${error?.description}")
                            release(view)
                        }
                    }
                    wv.loadUrl("$cdnBase/")
                } catch (e: Exception) {
                    addLog("[CF] WebView warmup init failed: ${e.message}")
                    latch.countDown()
                }
            }

            // Block this coroutine (IO dispatcher) up to 8 seconds (reduced from 20s)
            val solved = latch.await(8, java.util.concurrent.TimeUnit.SECONDS)
            if (!solved) addLog("[CF] Warmup timed out for $cdnBase — will try anyway")
        } catch (e: Exception) {
            addLog("[CF] warmUpCdnDomain error: ${e.message}")
        }
    }

    @PluginMethod
    fun updateOtaConfig(call: PluginCall) {
        val url = call.getString("url")
        if (url == null || url.trim().isEmpty()) {
            call.reject("Missing url parameter")
            return
        }
        setOtaConfigUrl(url)
        loadOtaConfig()
        call.resolve()
    }

    override fun handleOnDestroy() {
        stopLocalProxy()
        super.handleOnDestroy()
    }

    private fun startLocalProxy() {
        if (proxyRunning) return
        proxyRunning = true
        scope.launch(Dispatchers.IO) {
            try {
                val server = try {
                    java.net.ServerSocket(8000)
                } catch (e: Exception) {
                    java.net.ServerSocket(0)
                }
                proxyServer = server
                proxyPort = server.localPort
                addLog("Local mobile proxy server started on port $proxyPort")
                while (proxyRunning) {
                    val socket = proxyServer?.accept() ?: break
                    scope.launch(Dispatchers.IO) {
                        try {
                            handleProxyConnection(socket)
                        } catch (e: Exception) {
                            addLog("Error handling socket client: ${e.message}")
                        }
                    }
                }
            } catch (e: Exception) {
                addLog("Could not start proxy server: ${e.message}")
            }
        }
    }

    private fun stopLocalProxy() {
        proxyRunning = false
        try {
            proxyServer?.close()
            proxyServer = null
        } catch (ignored: Exception) {}
    }

    private fun handleProxyConnection(socket: java.net.Socket) {
        var conn: java.net.HttpURLConnection? = null
        try {
            val reader = java.io.BufferedReader(java.io.InputStreamReader(socket.getInputStream()))
            val firstLine = reader.readLine() ?: return socket.close()
            addLog("[Proxy] Request: $firstLine")
            val parts = firstLine.split(" ")
            if (parts.size < 2) {
                socket.close()
                return
            }
            val method = parts[0]
            val path = parts[1]

            if (path.startsWith("/unzip-to-vtt") || path.startsWith("/unzip-srt")) {
                handleUnzipToVtt(path, socket)
                return
            }

            if (path.startsWith("/convert-to-vtt")) {
                handleConvertToVtt(path, socket)
                return
            }

            if (method.equals("OPTIONS", ignoreCase = true)) {
                val out = java.io.BufferedOutputStream(socket.getOutputStream())
                val res = "HTTP/1.1 200 OK\r\n" +
                        "Access-Control-Allow-Origin: *\r\n" +
                        "Access-Control-Allow-Headers: *\r\n" +
                        "Access-Control-Allow-Methods: GET, OPTIONS, HEAD\r\n" +
                        "Content-Length: 0\r\n" +
                        "\r\n"
                out.write(res.toByteArray(Charsets.UTF_8))
                out.flush()
                socket.close()
                return
            }

            var targetUrlStr = ""
            var referer = ""
            var origin = ""

            if (path.startsWith("/local-proxy")) {
                val queryIdx = path.indexOf("?")
                if (queryIdx < 0) {
                    socket.close()
                    return
                }
                val query = path.substring(queryIdx + 1)
                val pairs = query.split("&")
                for (pair in pairs) {
                    val idx = pair.indexOf("=")
                    if (idx > 0) {
                        val key = java.net.URLDecoder.decode(pair.substring(0, idx), "UTF-8")
                        val value = java.net.URLDecoder.decode(pair.substring(idx + 1), "UTF-8")
                        if (key == "url") {
                            targetUrlStr = value
                        } else if (key == "referer") {
                            referer = value
                        } else if (key == "origin") {
                            origin = value
                        }
                    }
                }
                if (targetUrlStr.isEmpty()) {
                    socket.close()
                    return
                }
                try {
                    val parsedUrl = java.net.URL(targetUrlStr)
                    lastProxyHost = parsedUrl.host
                    lastProxyScheme = parsedUrl.protocol
                    lastReferer = referer
                    lastOrigin = origin
                } catch (e: Exception) {}
            } else {
                if (lastProxyHost.isEmpty()) {
                    val out = java.io.BufferedOutputStream(socket.getOutputStream())
                    val res = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n"
                    out.write(res.toByteArray(Charsets.UTF_8))
                    out.flush()
                    socket.close()
                    return
                }
                targetUrlStr = "${lastProxyScheme}://${lastProxyHost}${path}"
                referer = lastReferer
                origin = lastOrigin
            }

            var refToUse = referer
            var origToUse = origin

            if (refToUse.isEmpty()) {
                refToUse = if (targetUrlStr.contains("cloudnestra") || targetUrlStr.contains("yonderunyielding")) {
                    "https://cloudnestra.com/"
                } else if (targetUrlStr.contains("vidsrc.wtf")) {
                    "https://vidsrc.wtf/"
                } else if (targetUrlStr.contains("vidsrc.sbs")) {
                    "https://vidsrc.sbs/"
                } else if (targetUrlStr.contains("vidsrc.pk")) {
                    "https://embed.vidsrc.pk/"
                } else if (targetUrlStr.contains("creativeautomationlab.site") || targetUrlStr.contains("brightpathsignals.com")) {
                    "https://brightpathsignals.com/"
                } else if (targetUrlStr.contains("vidsrc")) {
                    "https://vidsrc.me/"
                } else {
                    "https://brightpathsignals.com/"
                }
            }

            if (origToUse.isEmpty()) {
                origToUse = if (targetUrlStr.contains("cloudnestra") || targetUrlStr.contains("yonderunyielding")) {
                    "https://cloudnestra.com"
                } else if (targetUrlStr.contains("vidsrc.wtf")) {
                    "https://vidsrc.wtf"
                } else if (targetUrlStr.contains("vidsrc.sbs")) {
                    "https://vidsrc.sbs"
                } else if (targetUrlStr.contains("vidsrc.pk")) {
                    "https://embed.vidsrc.pk"
                } else if (targetUrlStr.contains("creativeautomationlab.site") || targetUrlStr.contains("brightpathsignals.com")) {
                    "https://brightpathsignals.com"
                } else if (targetUrlStr.contains("vidsrc")) {
                    "https://vidsrc.me"
                } else {
                    "https://brightpathsignals.com"
                }
            }

            val isVidsrcPmCdn = (
                targetUrlStr.contains("smartbusinessframework.site") ||
                targetUrlStr.contains("lifestylefreedomlab.site") ||
                targetUrlStr.contains("highperformancebrands.site") ||
                targetUrlStr.contains("quietmidnightgardeningideas") ||
                targetUrlStr.contains("creativeautomationlab.site") ||
                targetUrlStr.contains("brightpathsignals.com") ||
                targetUrlStr.contains("/mbzqN9iiy/") ||
                targetUrlStr.contains("/content/") ||
                targetUrlStr.contains("/pl/") ||
                targetUrlStr.contains("/playlist/") ||
                targetUrlStr.contains("/WnVM9YFN1/")
            )

            // CRITICAL: Strip Referer & Origin for VidSrc PM CDN domains — they reject any
            // cross-origin headers with 403. The flag was previously computed but never applied.
            if (isVidsrcPmCdn) {
                refToUse = ""
                origToUse = ""
                addLog("[Proxy] VidSrc PM CDN detected — stripping Referer/Origin headers for $targetUrlStr")
            }

            var rangeHeader: String? = null
            var line: String?
            while (reader.readLine().also { line = it } != null && !line!!.trim().isEmpty()) {
                val lower = line!!.lowercase()
                if (lower.startsWith("range:")) {
                    rangeHeader = line!!.substring(6).trim()
                }
            }

            // Clean up duplicate and empty query parameters (especially token=)
            try {
                val questionMarkIdx = targetUrlStr.indexOf("?")
                if (questionMarkIdx >= 0) {
                    val base = targetUrlStr.substring(0, questionMarkIdx)
                    val query = targetUrlStr.substring(questionMarkIdx + 1)
                    val params = query.split("&", "?")
                    val seenKeys = mutableSetOf<String>()
                    val cleanQueryParts = mutableListOf<String>()
                    for (param in params) {
                        val eqIdx = param.indexOf("=")
                        val key = if (eqIdx >= 0) param.substring(0, eqIdx) else param
                        val value = if (eqIdx >= 0) param.substring(eqIdx + 1) else ""
                        // Skip duplicates AND skip params with empty values (e.g. token=)
                        if (key.isNotEmpty() && value.isNotEmpty() && !seenKeys.contains(key)) {
                            seenKeys.add(key)
                            cleanQueryParts.add(param)
                        } else if (key.isNotEmpty() && value.isNotEmpty()) {
                            // Already added this key, skip
                        } else if (key.isNotEmpty() && !seenKeys.contains(key) && value.isEmpty()) {
                            // Empty-value param: skip it entirely (avoids token= causing 403)
                            addLog("[Proxy] Stripping empty param '$key=' from URL")
                        }
                    }
                    targetUrlStr = if (cleanQueryParts.isNotEmpty()) {
                        base + "?" + cleanQueryParts.joinToString("&")
                    } else {
                        base
                    }
                }
            } catch (e: Exception) {}

            val targetUrl = java.net.URL(targetUrlStr)
            conn = targetUrl.openConnection() as java.net.HttpURLConnection
            conn.requestMethod = "GET"
            conn.connectTimeout = 15000
            conn.readTimeout = 30000
            conn.useCaches = false
            conn.instanceFollowRedirects = true

            if (refToUse.isNotEmpty()) {
                conn.setRequestProperty("Referer", refToUse)
            }
            if (origToUse.isNotEmpty()) {
                conn.setRequestProperty("Origin", origToUse)
            }

            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36")
            
            // Forward session cookies from WebView CookieManager to authenticate the request with the CDN
            try {
                val cookies = android.webkit.CookieManager.getInstance().getCookie(targetUrlStr)
                if (cookies != null && cookies.isNotEmpty()) {
                    conn.setRequestProperty("Cookie", cookies)
                }
            } catch (ce: Exception) {
                addLog("[Proxy] Failed to retrieve web cookies: ${ce.message}")
            }

            if (rangeHeader != null) {
                conn.setRequestProperty("Range", rangeHeader)
            }

            conn.connect()
            val responseCode = conn.responseCode
            addLog("[Proxy] CDN Response: $responseCode for $targetUrlStr")
            val contentType = conn.contentType ?: "application/octet-stream"
            val contentLength = conn.contentLength

            val isM3U8 = contentType.contains("mpegurl", ignoreCase = true) || targetUrlStr.contains(".m3u8", ignoreCase = true)
            var bodyBytes: ByteArray? = null
            
            val stream = if (responseCode in 200..299) conn.inputStream else conn.errorStream
            // Log 403/non-200 error bodies to diagnose CDN auth failures
            if (responseCode == 403 || responseCode == 401) {
                try {
                    val errBody = conn.errorStream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }
                    addLog("[Proxy] 403 error body (first 300): ${errBody?.take(300)}")
                } catch (ignored: Exception) {}
            }
            if (stream != null) {
                if (isM3U8 && responseCode in 200..299) {
                    val m3u8Content = stream.bufferedReader(Charsets.UTF_8).use { it.readText() }
                    // Log first 800 chars of M3U8 for debugging segment URL format
                    addLog("[Proxy] M3U8 content (first 800): ${m3u8Content.take(800)}")
                    val lines = m3u8Content.split("\n")
                    val rewritten = StringBuilder()
                    for (line in lines) {
                        var processedLine = line
                        // 1. Rewrite URI="..." attributes (e.g. for decryption keys or media groups)
                        val uriRegex = Regex("""URI=["']([^"']+)["']""")
                        val matchResult = uriRegex.find(processedLine)
                        if (matchResult != null) {
                            val originalUri = matchResult.groupValues[1]
                            val resolvedUri = if (originalUri.startsWith("http://") || originalUri.startsWith("https://")) {
                                originalUri
                            } else if (originalUri.startsWith("/") && !originalUri.startsWith("//")) {
                                "${lastProxyScheme}://${lastProxyHost}${originalUri}"
                            } else {
                                originalUri
                            }
                            
                            val proxiedUri = "http://localhost:$proxyPort/local-proxy?url=${java.net.URLEncoder.encode(resolvedUri, "UTF-8")}&referer=${java.net.URLEncoder.encode(referer, "UTF-8")}&origin=${java.net.URLEncoder.encode(origin, "UTF-8")}"
                            processedLine = processedLine.replace(originalUri, proxiedUri)
                        }
                        
                        // 2. Rewrite line-based HLS segment / playlist URLs
                        val trimmed = processedLine.trim()
                        if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
                            if (!trimmed.contains("localhost") && !trimmed.contains("127.0.0.1")) {
                                rewritten.append("http://localhost:$proxyPort/local-proxy?url=")
                                         .append(java.net.URLEncoder.encode(trimmed, "UTF-8"))
                                         .append("&referer=")
                                         .append(java.net.URLEncoder.encode(referer, "UTF-8"))
                                         .append("&origin=")
                                         .append(java.net.URLEncoder.encode(origin, "UTF-8"))
                                         .append("\n")
                            } else {
                                rewritten.append(processedLine).append("\n")
                            }
                        } else if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
                            val absUrl = "${lastProxyScheme}://${lastProxyHost}${trimmed}"
                            rewritten.append("http://localhost:$proxyPort/local-proxy?url=")
                                     .append(java.net.URLEncoder.encode(absUrl, "UTF-8"))
                                     .append("&referer=")
                                     .append(java.net.URLEncoder.encode(referer, "UTF-8"))
                                     .append("&origin=")
                                     .append(java.net.URLEncoder.encode(origin, "UTF-8"))
                                     .append("\n")
                        } else if (trimmed.isNotEmpty() && !trimmed.startsWith("#")) {
                            val lastSlash = targetUrlStr.lastIndexOf('/')
                            val baseUrl = if (lastSlash >= 0) targetUrlStr.substring(0, lastSlash + 1) else ""
                            var absUrl = baseUrl + trimmed
                            try {
                                absUrl = java.net.URI(absUrl).normalize().toString()
                            } catch (e: Exception) {}
                            rewritten.append("http://localhost:$proxyPort/local-proxy?url=")
                                     .append(java.net.URLEncoder.encode(absUrl, "UTF-8"))
                                     .append("&referer=")
                                     .append(java.net.URLEncoder.encode(referer, "UTF-8"))
                                     .append("&origin=")
                                     .append(java.net.URLEncoder.encode(origin, "UTF-8"))
                                     .append("\n")
                        } else {
                            rewritten.append(processedLine).append("\n")
                        }
                    }
                    bodyBytes = rewritten.toString().toByteArray(Charsets.UTF_8)
                }
            }

            val out = java.io.BufferedOutputStream(socket.getOutputStream())
            
            val resHeaderSb = StringBuilder()
            val reasonPhrase = when (responseCode) {
                200 -> "OK"
                206 -> "Partial Content"
                301 -> "Moved Permanently"
                302 -> "Found"
                304 -> "Not Modified"
                403 -> "Forbidden"
                404 -> "Not Found"
                else -> "OK"
            }
            resHeaderSb.append("HTTP/1.1 $responseCode $reasonPhrase\r\n")
            resHeaderSb.append("Access-Control-Allow-Origin: *\r\n")
            resHeaderSb.append("Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n")
            resHeaderSb.append("Access-Control-Allow-Headers: *\r\n")
            resHeaderSb.append("Content-Type: $contentType\r\n")
            
            if (bodyBytes != null) {
                resHeaderSb.append("Content-Length: ${bodyBytes.size}\r\n")
            } else if (contentLength >= 0) {
                resHeaderSb.append("Content-Length: $contentLength\r\n")
            }
            
            val contentRange = conn.getHeaderField("Content-Range")
            if (contentRange != null) {
                resHeaderSb.append("Content-Range: $contentRange\r\n")
            }
            
            // Always forward Accept-Ranges so the player can seek properly in large MP4 files
            val acceptRanges = conn.getHeaderField("Accept-Ranges") ?: "bytes"
            resHeaderSb.append("Accept-Ranges: $acceptRanges\r\n")
            
            resHeaderSb.append("\r\n")
            out.write(resHeaderSb.toString().toByteArray(Charsets.UTF_8))
            
            if (bodyBytes != null) {
                out.write(bodyBytes)
            } else if (stream != null) {
                val buffer = ByteArray(128 * 1024)
                var bytesRead: Int
                while (stream.read(buffer).also { bytesRead = it } != -1) {
                    out.write(buffer, 0, bytesRead)
                }
                stream.close()
            }
            out.flush()
        } catch (e: Exception) {
            val msg = e.message ?: ""
            if (!msg.contains("Broken pipe", ignoreCase = true) && !msg.contains("Connection reset", ignoreCase = true)) {
                addLog("Error handling proxy connection: ${e.message}")
            }
        } finally {
            try {
                conn?.disconnect()
            } catch (ignored: Exception) {}
            try {
                socket.close()
            } catch (ignored: Exception) {}
        }
    }

    @PluginMethod
    fun resolveStreams(call: PluginCall) {
        call.reject("Sniffing is disabled. Only Vidlink and VidSrc PM are supported.")
    }

    @PluginMethod
    fun resolveVidsrcPm(call: PluginCall) {
        val tmdbId = call.getString("tmdbId") ?: return call.reject("Missing tmdbId")
        val imdbId = call.getString("imdbId") ?: ""
        val type = call.getString("type") ?: "movie"
        val season = call.getInt("season") ?: 1
        val episode = call.getInt("episode") ?: 1
        val isTv = type == "tv"

        addLog("[VidsrcPM] Starting native resolution for $tmdbId ($type)")
        scope.launch {
            try {
                // 1. Read OTA config for endpoint gateways and headers
                val embedConfig = remoteConfig.optJSONObject("embed_urls") ?: org.json.JSONObject()
                val headersConfig = remoteConfig.optJSONObject("headers") ?: org.json.JSONObject()

                val referer = headersConfig.optString("vidsrc_pm_referer", "https://nextgencloudfabric.com/")
                val origin  = headersConfig.optString("vidsrc_pm_origin",  "https://nextgencloudfabric.com")

                // Build ordered gateway list from OTA config; fall back to hardcoded defaults
                val gateways = mutableListOf<String>()
                val gatewaysArr = embedConfig.optJSONArray("vidsrc_pm_gateways")
                if (gatewaysArr != null) {
                    for (i in 0 until gatewaysArr.length()) {
                        gateways.add(gatewaysArr.getString(i))
                    }
                }
                if (gateways.isEmpty()) {
                    gateways.add("https://streamdata.vaplayer.ru")
                }

                // 1.5. Resolve IMDB ID if TMDB is provided (VidSrc PM API requires IMDB ID)
                var resolvedImdbId = imdbId
                if (resolvedImdbId.isEmpty() || !resolvedImdbId.startsWith("tt")) {
                    val fetched = fetchImdbId(tmdbId, isTv)
                    if (fetched != null && fetched.startsWith("tt")) {
                        resolvedImdbId = fetched
                        addLog("[VidsrcPM] Resolved IMDB ID $resolvedImdbId from TMDB $tmdbId")
                    } else {
                        // fallback to using tmdbId directly
                        resolvedImdbId = tmdbId
                    }
                }

                // 2. Try each gateway until one succeeds
                var resolvedData: org.json.JSONObject? = null
                var lastError = ""

                for (gw in gateways) {
                    val apiUrl = if (isTv) {
                        "$gw/api.php?imdb=$resolvedImdbId&type=tv&season=$season&episode=$episode"
                    } else {
                        "$gw/api.php?imdb=$resolvedImdbId&type=movie"
                    }
                    addLog("[VidsrcPM] Trying gateway: $apiUrl")
                    try {
                        val responseStr = proxyFetch(apiUrl, referer, origin)
                        if (responseStr.isBlank()) {
                            addLog("[VidsrcPM] Gateway $gw returned empty body, skipping")
                            continue
                        }
                        if (responseStr.trimStart().startsWith("<")) {
                            addLog("[VidsrcPM] Gateway $gw returned HTML, skipping")
                            continue
                        }
                        val parsed = org.json.JSONObject(responseStr)
                        val statusCode = parsed.optInt("status_code", parsed.optString("status_code", "").toIntOrNull() ?: 0)
                        if (statusCode == 200) {
                            resolvedData = parsed
                            addLog("[VidsrcPM] Gateway $gw succeeded")
                            break
                        } else {
                            lastError = "status_code=$statusCode"
                            addLog("[VidsrcPM] Gateway $gw returned bad status: $statusCode, skipping")
                        }
                    } catch (e: Exception) {
                        lastError = e.message ?: "unknown error"
                        addLog("[VidsrcPM] Gateway $gw failed: ${e.message}")
                    }
                }

                if (resolvedData == null) {
                    throw Exception("All VidSrc PM gateways failed. Last error: $lastError")
                }

                // 3. Parse response — stream_urls lives in data.stream_urls or top-level
                val streamData = resolvedData.optJSONObject("data") ?: resolvedData
                val streamUrls = streamData.optJSONArray("stream_urls") ?: org.json.JSONArray()

                if (streamUrls.length() == 0) {
                    throw Exception("VidSrc PM returned empty stream_urls for $tmdbId")
                }

                // Only take the first adaptive master URL — multiple entries are CDN mirrors
                val sourcesArr = JSArray()
                val bestUrl = streamUrls.optString(0, "")
                if (bestUrl.isNotEmpty()) {
                    // Warm up Cloudflare for the CDN domain before trying to play
                    // This loads the CDN base URL in a hidden WebView so the JS challenge
                    // is solved and cf_clearance cookie is stored for our proxy to forward.
                    try { warmUpCdnDomain(bestUrl) } catch (e: Exception) {
                        addLog("[VidsrcPM] CF warmup error (non-fatal): ${e.message}")
                    }
                    sourcesArr.put(JSObject().apply {
                        put("url", "http://localhost:$proxyPort/local-proxy?url=${java.net.URLEncoder.encode(bestUrl, "UTF-8")}&referer=${java.net.URLEncoder.encode(referer, "UTF-8")}&origin=${java.net.URLEncoder.encode(origin, "UTF-8")}")
                        put("quality", "auto")
                        put("isM3U8", bestUrl.contains(".m3u8"))
                    })
                }

                if (sourcesArr.length() == 0) {
                    throw Exception("No valid stream URL found in VidSrc PM response")
                }

                // 4. Parse subtitles from default_subs (may live in data or top-level)
                val subsArr = JSArray()
                val subsList = resolvedData.optJSONArray("default_subs")
                    ?: streamData.optJSONArray("default_subs")
                    ?: org.json.JSONArray()

                for (j in 0 until subsList.length()) {
                    val sub = subsList.optJSONObject(j) ?: continue
                    val subUrl = sub.optString("url", sub.optString("file", ""))
                    val subLang = sub.optString("lang", sub.optString("label", "English"))
                    if (subUrl.isNotEmpty()) {
                        val resolvedSubUrl = if (subUrl.endsWith(".zip") || subUrl.contains(".zip?")) {
                            "http://localhost:$proxyPort/unzip-to-vtt?url=${java.net.URLEncoder.encode(subUrl, "UTF-8")}"
                        } else {
                            "http://localhost:$proxyPort/convert-to-vtt?url=${java.net.URLEncoder.encode(subUrl, "UTF-8")}"
                        }
                        subsArr.put(JSObject().apply {
                            put("url", resolvedSubUrl)
                            put("lang", subLang)
                        })
                    }
                }

                // 5. Backup subtitles — YTS for movies, same PM API sub list for TV
                try {
                    if (!isTv) {
                        val imdbIdResolved = if (imdbId.isNotEmpty()) imdbId else fetchImdbId(tmdbId, false)
                        if (imdbIdResolved != null && imdbIdResolved.isNotEmpty()) {
                            addLog("[VidsrcPM] Fetching YTS backup subtitles for IMDB: $imdbIdResolved")
                            val ytsSubs = scrapeYtsSubtitles(imdbIdResolved)
                            for (j in 0 until ytsSubs.length()) {
                                subsArr.put(ytsSubs.get(j))
                            }
                        }
                    }
                } catch (e: Exception) {
                    addLog("[VidsrcPM] Backup subtitle fetch failed: ${e.message}")
                }

                addLog("[VidsrcPM] Resolved: ${sourcesArr.length()} source(s), ${subsArr.length()} subtitle(s)")
                val response = JSObject().apply {
                    put("sources", sourcesArr)
                    put("subtitles", subsArr)
                    put("errors", JSArray())
                }
                call.resolve(response)
            } catch (e: Exception) {
                addLog("[VidsrcPM] Native resolution failed: ${e.message}")
                call.reject("VidSrc PM resolution failed: ${e.message}", e)
            }
        }
    }



    @PluginMethod
    fun playNativeStream(call: PluginCall) {
        val sourceUrl = call.getString("source_url") ?: return call.reject("Missing source_url")
        val headers = call.getObject("headers") ?: JSObject()
        val subtitles = call.getArray("subtitles") ?: JSArray()
        val title = call.getString("title") ?: "CineMovie Native Playback"
        val queue = call.getArray("queue") ?: JSArray()

        addLog("[Engine] playNativeStream request for url = $sourceUrl")
        val intent = Intent(context, MoviePlayerActivity::class.java).apply {
            putExtra("source_url", sourceUrl)
            putExtra("headers", headers.toString())
            putExtra("subtitles", subtitles.toString())
            putExtra("title", title)
            putExtra("queue", queue.toString())
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
        call.resolve()
    }


    @PluginMethod
    fun setTouchBoostActive(call: PluginCall) {
        val enabled = call.getBoolean("enabled") ?: false
        isTouchBoostActive = enabled
        call.resolve()
    }

    @PluginMethod
    fun getProxyPort(call: PluginCall) {
        val res = JSObject().apply {
            put("port", proxyPort)
        }
        call.resolve(res)
    }

    @PluginMethod
    fun getNativeLogs(call: PluginCall) {
        val arr = JSArray()
        for (log in logsList) {
            arr.put(log)
        }
        val res = JSObject().apply {
            put("logs", arr)
        }
        call.resolve(res)
    }

    @PluginMethod
    fun clearNativeLogs(call: PluginCall) {
        logsList.clear()
        call.resolve()
    }

    @PluginMethod
    fun getDeviceVolume(call: PluginCall) {
        activity.runOnUiThread {
            try {
                val audioManager = context.getSystemService(android.content.Context.AUDIO_SERVICE) as android.media.AudioManager
                val maxVolume = audioManager.getStreamMaxVolume(android.media.AudioManager.STREAM_MUSIC)
                val currentVolume = audioManager.getStreamVolume(android.media.AudioManager.STREAM_MUSIC)
                val fraction = currentVolume.toFloat() / maxVolume.toFloat()
                val res = JSObject().apply {
                    put("volume", fraction)
                }
                call.resolve(res)
            } catch (e: Exception) {
                call.reject(e.message)
            }
        }
    }

    @PluginMethod
    fun setDeviceVolume(call: PluginCall) {
        val volumeFraction = call.getDouble("volume") ?: return call.reject("Missing volume")
        activity.runOnUiThread {
            try {
                val audioManager = context.getSystemService(android.content.Context.AUDIO_SERVICE) as android.media.AudioManager
                val maxVolume = audioManager.getStreamMaxVolume(android.media.AudioManager.STREAM_MUSIC)
                val targetVolume = (volumeFraction * maxVolume).toInt().coerceIn(0, maxVolume)
                audioManager.setStreamVolume(android.media.AudioManager.STREAM_MUSIC, targetVolume, 0)
                call.resolve()
            } catch (e: Exception) {
                call.reject(e.message)
            }
        }
    }

    @PluginMethod
    fun getDeviceBrightness(call: PluginCall) {
        activity.runOnUiThread {
            try {
                val lp = activity.window.attributes
                var brightness = lp.screenBrightness
                if (brightness < 0) {
                    // Try to read system brightness if window is using default
                    try {
                        val sysBacklight = android.provider.Settings.System.getInt(
                            context.contentResolver,
                            android.provider.Settings.System.SCREEN_BRIGHTNESS
                        )
                        brightness = sysBacklight.toFloat() / 255f
                    } catch (_: Exception) {
                        brightness = 0.5f
                    }
                }
                val res = JSObject().apply {
                    put("brightness", brightness)
                }
                call.resolve(res)
            } catch (e: Exception) {
                call.reject(e.message)
            }
        }
    }

    @PluginMethod
    fun setDeviceBrightness(call: PluginCall) {
        val brightness = call.getDouble("brightness") ?: return call.reject("Missing brightness")
        activity.runOnUiThread {
            try {
                val lp = activity.window.attributes
                lp.screenBrightness = brightness.toFloat().coerceIn(0.01f, 1.0f)
                activity.window.attributes = lp
                call.resolve()
            } catch (e: Exception) {
                call.reject(e.message)
            }
        }
    }

    @PluginMethod
    fun installApk(call: PluginCall) {
        val fileUriStr = call.getString("fileUri") ?: return call.reject("Missing fileUri")
        activity.runOnUiThread {
            try {
                val uri = android.net.Uri.parse(fileUriStr)
                val intent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, "application/vnd.android.package-archive")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                
                // If it is a file scheme, convert it via FileProvider to content:// scheme so Android Package Installer can read it
                if (uri.scheme == "file") {
                    val file = java.io.File(uri.path ?: "")
                    if (file.exists()) {
                        val contentUri = androidx.core.content.FileProvider.getUriForFile(
                            context,
                            "${context.packageName}.fileprovider",
                            file
                        )
                        intent.setDataAndType(contentUri, "application/vnd.android.package-archive")
                    }
                }
                
                context.startActivity(intent)
                call.resolve()
            } catch (e: Exception) {
                addLog("[Engine] installApk error: ${e.message}")
                call.reject(e.message)
            }
        }
    }

    @PluginMethod
    fun addJsLog(call: PluginCall) {
        val message = call.getString("message")
        if (message != null) {
            addLog(message)
        }
        call.resolve()
    }

    @PluginMethod
    fun lockToSensorLandscape(call: PluginCall) {
        activity.runOnUiThread {
            try {
                activity.requestedOrientation = android.content.pm.ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                call.resolve()
            } catch (e: Exception) {
                addLog("[Engine] lockToSensorLandscape error: ${e.message}")
                call.reject(e.message)
            }
        }
    }

    @PluginMethod
    fun restoreOrientation(call: PluginCall) {
        activity.runOnUiThread {
            try {
                val uiModeManager = context.getSystemService(android.content.Context.UI_MODE_SERVICE) as? android.app.UiModeManager
                val isTv = uiModeManager?.currentModeType == android.content.res.Configuration.UI_MODE_TYPE_TELEVISION
                activity.requestedOrientation = if (isTv) {
                    android.content.pm.ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                } else {
                    android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
                }
                call.resolve()
            } catch (e: Exception) {
                addLog("[Engine] restoreOrientation error: ${e.message}")
                call.reject(e.message)
            }
        }
    }

    private fun proxyFetch(targetUrl: String, referer: String = "", origin: String = ""): String {
        addLog("proxyFetch request: url = $targetUrl")
        val reqBuilder = okhttp3.Request.Builder().url(targetUrl)
        
        var refToUse = referer
        var origToUse = origin

        val domainUri = try { java.net.URI(targetUrl) } catch(e: Exception) { null }
        val host = domainUri?.host ?: ""

        val gatewaysObj = remoteConfig.optJSONObject("gateways") ?: org.json.JSONObject()
        val headersObj = remoteConfig.optJSONObject("headers") ?: org.json.JSONObject()

        val wtfUrl = gatewaysObj.optString("vidsrc_wtf", "https://vidsrc.wtf")
        val sbsUrl = gatewaysObj.optString("vidsrc_sbs", "https://vidsrc.sbs")
        val pkUrl = gatewaysObj.optString("vidsrc_pk", "https://embed.vidsrc.pk")
        val fyiUrl = gatewaysObj.optString("vidsrc_fyi", "https://vidsrc.fyi")

        val wtfHost = try { java.net.URI(wtfUrl).host ?: "vidsrc.wtf" } catch(e: Exception) { "vidsrc.wtf" }
        val sbsHost = try { java.net.URI(sbsUrl).host ?: "vidsrc.sbs" } catch(e: Exception) { "vidsrc.sbs" }
        val pkHost = try { java.net.URI(pkUrl).host ?: "embed.vidsrc.pk" } catch(e: Exception) { "embed.vidsrc.pk" }
        val fyiHost = try { java.net.URI(fyiUrl).host ?: "vidsrc.fyi" } catch(e: Exception) { "vidsrc.fyi" }

        // Explicitly set nextgencloudfabric headers for TMDB, VidSrc PM gateways, or subtitle CDN domains to ensure they pass
        val isApiOrGateway = (
            targetUrl.contains("api.themoviedb.org") ||
            targetUrl.contains("vaplayer.ru") ||
            targetUrl.contains("api.vaplayer.ru") ||
            targetUrl.contains("data.vaplayer.ru") ||
            targetUrl.contains("streamdata.vaplayer.ru") ||
            targetUrl.contains("vidapi.cloud")
        )

        if (isApiOrGateway) {
            refToUse = "https://nextgencloudfabric.com/"
            origToUse = "https://nextgencloudfabric.com"
        }

        if (refToUse.isEmpty()) {
            if (targetUrl.contains(wtfHost)) {
                refToUse = if (wtfUrl.endsWith("/")) wtfUrl else "$wtfUrl/"
            } else if (targetUrl.contains(sbsHost)) {
                refToUse = if (sbsUrl.endsWith("/")) sbsUrl else "$sbsUrl/"
            } else if (targetUrl.contains(pkHost)) {
                refToUse = if (pkUrl.endsWith("/")) pkUrl else "$pkUrl/"
            } else if (targetUrl.contains(fyiHost)) {
                refToUse = if (fyiUrl.endsWith("/")) fyiUrl else "$fyiUrl/"
            } else if (targetUrl.contains("vidsrc") && !targetUrl.contains("vidsrc-pm") && !targetUrl.contains("vaplayer") && !targetUrl.contains("nextgencloudfabric")) {
                refToUse = "https://vidsrc.me/"
            } else if (host.isNotEmpty()) {
                refToUse = "https://$host/"
            } else {
                refToUse = "https://google.com/"
            }
        }

        if (origToUse.isEmpty()) {
            if (targetUrl.contains(wtfHost)) {
                origToUse = wtfUrl.removeSuffix("/")
            } else if (targetUrl.contains(sbsHost)) {
                origToUse = sbsUrl.removeSuffix("/")
            } else if (targetUrl.contains(pkHost)) {
                origToUse = pkUrl.removeSuffix("/")
            } else if (targetUrl.contains(fyiHost)) {
                origToUse = fyiUrl.removeSuffix("/")
            } else if (targetUrl.contains("vidsrc") && !targetUrl.contains("vidsrc-pm") && !targetUrl.contains("vaplayer") && !targetUrl.contains("nextgencloudfabric")) {
                origToUse = "https://vidsrc.me"
            } else if (host.isNotEmpty()) {
                origToUse = "https://$host"
            } else {
                origToUse = "https://google.com"
            }
        }

        val isVidsrcPmCdn = (
            targetUrl.contains("smartbusinessframework.site") ||
            targetUrl.contains("lifestylefreedomlab.site") ||
            targetUrl.contains("highperformancebrands.site") ||
            targetUrl.contains("quietmidnightgardeningideas") ||
            targetUrl.contains("creativeautomationlab.site") ||
            targetUrl.contains("brightpathsignals.com") ||
            targetUrl.contains("/mbzqN9iiy/") ||
            targetUrl.contains("/WnVM9YFN1/")
        )

        // Only inject headers if it's not a token-authed CDN segment (CDNs reject custom referer headers)
        if (!isVidsrcPmCdn) {
            if (refToUse.isNotEmpty()) reqBuilder.addHeader("Referer", refToUse)
            if (origToUse.isNotEmpty()) reqBuilder.addHeader("Origin", origToUse)
        }
        
        
        reqBuilder.addHeader("User-Agent", "Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36")
        reqBuilder.addHeader("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8")
        reqBuilder.addHeader("Accept-Language", "en-US,en;q=0.9")
        reqBuilder.addHeader("Sec-Ch-Ua", "\"Chromium\";v=\"122\", \"Not(A:Brand\";v=\"24\", \"Google Chrome\";v=\"122\"")
        reqBuilder.addHeader("Sec-Ch-Ua-Mobile", "?1")
        reqBuilder.addHeader("Sec-Ch-Ua-Platform", "\"Android\"")
        
        val req = reqBuilder.build()
        val response = client.newCall(req).execute()
        addLog("proxyFetch response: code = ${response.code}, message = ${response.message}")
        if (!response.isSuccessful) {
            throw Exception("HTTP ${response.code}: ${response.message}")
        }
        return response.body?.string() ?: throw Exception("Proxy fetch empty response")
    }

    private fun resolveVidsrcTo(tmdbId: String, isTv: Boolean, season: Int, episode: Int, explicitImdbId: String = ""): JSObject {
        return JSObject()
    }

    private fun resolveFilemoon(tmdbId: String, isTv: Boolean, season: Int, episode: Int): JSObject {
        return JSObject()
    }

    private fun fetchImdbId(tmdbId: String, isTv: Boolean): String? {
        if (tmdbId.startsWith("tt")) return tmdbId
        try {
            val type = if (isTv) "tv" else "movie"
            val url = "https://api.themoviedb.org/3/$type/$tmdbId/external_ids?api_key=8265bd1679663a7ea12ac168da84d2e8"
            val jsonStr = proxyFetch(url, "https://google.com/")
            val jsonObj = org.json.JSONObject(jsonStr)
            val imdbId = jsonObj.optString("imdb_id")
            if (imdbId != null && imdbId.startsWith("tt")) {
                return imdbId
            }
        } catch (e: Exception) {
            addLog("[Vidsrc] Failed to fetch imdbId: ${e.message}")
        }
        return null
    }

    private fun scrapeYtsSubtitles(imdbId: String): JSArray {
        val subsArray = JSArray()
        if (imdbId.isEmpty() || !imdbId.startsWith("tt")) return subsArray
        try {
            addLog("[Vidsrc] Scraping YTS subtitles for IMDB: $imdbId...")
            val subtitlesConfig = remoteConfig.optJSONObject("subtitles") ?: org.json.JSONObject()
            val ytsBase = subtitlesConfig.optString("yts_subtitles_url", "https://yifysubtitles.org/movie-imdb/")
            val ytsUrl = "$ytsBase$imdbId"
            val ytsHtml = proxyFetch(ytsUrl, "https://google.com/")
            val rowRegex = Regex("""<tr[^>]*data-id="\d+"[^>]*>([\s\S]*?)</tr>""")
            val matches = rowRegex.findAll(ytsHtml)
            
            var count = 0
            for (match in matches) {
                if (count >= 150) break // High limit to load all languages without hitting memory boundaries
                val rowHtml = match.groupValues[1]
                
                val langMatch = Regex("""<span class="sub-lang">([^<]*)</span>""").find(rowHtml)
                val language = langMatch?.groupValues?.get(1)?.trim() ?: ""
                
                val linkMatch = Regex("""href="(/subtitles/[^"]*)"""").find(rowHtml)
                val link = linkMatch?.groupValues?.get(1) ?: ""
                
                val nameMatch = Regex("""<a href="/subtitles/[^"]*">([\s\S]*?)</a>""").find(rowHtml)
                var name = ""
                if (nameMatch != null) {
                    name = nameMatch.groupValues[1].replace(Regex("""<span[^>]*>([\s\S]*?)</span>"""), "").trim()
                    name = name.replace(Regex("""\s+"""), " ")
                }

                if (link.isNotEmpty() && language.isNotEmpty()) {
                    // Construction of the direct zip URL is deterministic:
                    // e.g. "/subtitles/interstellar-2014-albanian-yify-56676" -> "/subtitle/interstellar-2014-albanian-yify-56676.zip"
                    val zipPath = link.replace("/subtitles/", "/subtitle/") + ".zip"
                    val ytsChBase = subtitlesConfig.optString("yts_subtitles_ch", "https://yifysubtitles.ch")
                    val zipUrl = "$ytsChBase$zipPath"
                    val resolvedSubUrl = "http://localhost:$proxyPort/unzip-to-vtt?url=${java.net.URLEncoder.encode(zipUrl, "UTF-8")}"
                    
                    subsArray.put(JSObject().apply {
                        put("url", resolvedSubUrl)
                        put("lang", if (name.isNotEmpty()) "$language ($name)" else language)
                        put("isBackup", true)
                    })
                    count++
                }
            }
            addLog("[Vidsrc] Successfully scraped ${subsArray.length()} subtitles from YTS.")
        } catch (ytsErr: Exception) {
            addLog("[Vidsrc] Native YTS subtitles scrap failed: ${ytsErr.message}")
        }
        return subsArray
    }

    private fun handleUnzipToVtt(path: String, socket: java.net.Socket) {
        val out = java.io.BufferedOutputStream(socket.getOutputStream())
        try {
            val queryIdx = path.indexOf("?")
            if (queryIdx < 0) throw Exception("Missing query params")
            val query = path.substring(queryIdx + 1)
            var targetUrl = ""
            val pairs = query.split("&")
            for (pair in pairs) {
                val idx = pair.indexOf("=")
                if (idx > 0) {
                    val key = java.net.URLDecoder.decode(pair.substring(0, idx), "UTF-8")
                    val value = java.net.URLDecoder.decode(pair.substring(idx + 1), "UTF-8")
                    if (key == "url") {
                        targetUrl = value
                    }
                }
            }
            if (targetUrl.isEmpty()) throw Exception("Missing url param")

            val referer = targetUrl.replace("/subtitle/", "/subtitles/").replace(".zip", "")
            addLog("[Proxy] Downloading subtitle zip: $targetUrl with Referer: $referer")

            val req = Request.Builder()
                .url(targetUrl)
                .header("Referer", referer)
                .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36")
                .build()

            val response = client.newCall(req).execute()
            if (!response.isSuccessful) throw Exception("HTTP ${response.code}")

            val bytes = response.body?.bytes() ?: throw Exception("Empty response body")
            val zipStream = java.util.zip.ZipInputStream(java.io.ByteArrayInputStream(bytes))
            var srtContent = ""
            var entry = zipStream.nextEntry
            while (entry != null) {
                if (entry.name.endsWith(".srt") || entry.name.endsWith(".sub") || entry.name.endsWith(".vtt")) {
                    val reader = java.io.BufferedReader(java.io.InputStreamReader(zipStream, "ISO-8859-1"))
                    val sb = java.lang.StringBuilder()
                    var line = reader.readLine()
                    while (line != null) {
                        sb.append(line).append("\n")
                        line = reader.readLine()
                    }
                    srtContent = sb.toString()
                    break
                }
                entry = zipStream.nextEntry
            }
            zipStream.close()

            if (srtContent.isEmpty()) throw Exception("No subtitle entry found in zip")

            var vttContent = srtContent
            if (!vttContent.trim().startsWith("WEBVTT")) {
                val cleanSrt = vttContent.replace("\r\n", "\n").replace("\r", "\n")
                val converted = cleanSrt.replace(Regex("""(\d{2}:\d{2}:\d{2}),(\d{3})"""), "$1.$2")
                vttContent = "WEBVTT\n\n$converted"
            }

            val vttBytes = vttContent.toByteArray(Charsets.UTF_8)
            val header = "HTTP/1.1 200 OK\r\n" +
                    "Content-Type: text/vtt; charset=utf-8\r\n" +
                    "Content-Length: ${vttBytes.size}\r\n" +
                    "Access-Control-Allow-Origin: *\r\n" +
                    "Access-Control-Allow-Methods: GET, OPTIONS, HEAD\r\n" +
                    "Access-Control-Allow-Headers: *\r\n" +
                    "Connection: close\r\n" +
                    "\r\n"

            out.write(header.toByteArray(Charsets.UTF_8))
            out.write(vttBytes)
            out.flush()
        } catch (e: Exception) {
            addLog("[Proxy] handleUnzipToVtt failed: ${e.message}")
            val errorMsg = "Failed to load subtitle: ${e.message}"
            val errBytes = errorMsg.toByteArray(Charsets.UTF_8)
            val header = "HTTP/1.1 500 Internal Server Error\r\n" +
                    "Content-Type: text/plain\r\n" +
                    "Content-Length: ${errBytes.size}\r\n" +
                    "Access-Control-Allow-Origin: *\r\n" +
                    "Connection: close\r\n" +
                    "\r\n"
            try {
                out.write(header.toByteArray(Charsets.UTF_8))
                out.write(errBytes)
                out.flush()
            } catch (_: Exception) {}
        } finally {
            try { socket.close() } catch (_: Exception) {}
        }
    }

    private fun handleConvertToVtt(path: String, socket: java.net.Socket) {
        val out = java.io.BufferedOutputStream(socket.getOutputStream())
        try {
            val queryIdx = path.indexOf("?")
            if (queryIdx < 0) throw Exception("Missing query params")
            val query = path.substring(queryIdx + 1)
            var targetUrl = ""
            val pairs = query.split("&")
            for (pair in pairs) {
                val idx = pair.indexOf("=")
                if (idx > 0) {
                    val key = java.net.URLDecoder.decode(pair.substring(0, idx), "UTF-8")
                    val value = java.net.URLDecoder.decode(pair.substring(idx + 1), "UTF-8")
                    if (key == "url") {
                        targetUrl = value
                    }
                }
            }
            if (targetUrl.isEmpty()) throw Exception("Missing url param")

            val responseStr = proxyFetch(targetUrl)
            val bytes = responseStr.toByteArray(Charsets.UTF_8)
            val subtitleText = String(bytes, Charsets.UTF_8)

            var vttContent = subtitleText
            if (!vttContent.trim().startsWith("WEBVTT")) {
                val cleanSrt = vttContent.replace("\r\n", "\n").replace("\r", "\n")
                val converted = cleanSrt.replace(Regex("""(\d{2}:\d{2}:\d{2}),(\d{3})"""), "$1.$2")
                vttContent = "WEBVTT\n\n$converted"
            }

            val vttBytes = vttContent.toByteArray(Charsets.UTF_8)
            val header = "HTTP/1.1 200 OK\r\n" +
                    "Content-Type: text/vtt; charset=utf-8\r\n" +
                    "Content-Length: ${vttBytes.size}\r\n" +
                    "Access-Control-Allow-Origin: *\r\n" +
                    "Access-Control-Allow-Methods: GET, OPTIONS, HEAD\r\n" +
                    "Access-Control-Allow-Headers: *\r\n" +
                    "Connection: close\r\n" +
                    "\r\n"

            out.write(header.toByteArray(Charsets.UTF_8))
            out.write(vttBytes)
            out.flush()
        } catch (e: Exception) {
            addLog("[Proxy] handleConvertToVtt failed: ${e.message}")
            val errorMsg = "Failed to convert subtitle: ${e.message}"
            val errBytes = errorMsg.toByteArray(Charsets.UTF_8)
            val header = "HTTP/1.1 500 Internal Server Error\r\n" +
                    "Content-Type: text/plain\r\n" +
                    "Content-Length: ${errBytes.size}\r\n" +
                    "Access-Control-Allow-Origin: *\r\n" +
                    "Connection: close\r\n" +
                    "\r\n"
            try {
                out.write(header.toByteArray(Charsets.UTF_8))
                out.write(errBytes)
                out.flush()
            } catch (_: Exception) {}
        } finally {
            try { socket.close() } catch (_: Exception) {}
        }
    }
}
