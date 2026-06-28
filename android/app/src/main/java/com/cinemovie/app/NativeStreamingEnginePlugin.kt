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

    private val defaultConfigJson = """
    {
      "gateways": {
        "vidlink": "https://vidlink.pro",
        "cloudnestra": "https://cloudnestra.com",
        "vidsrc_wtf": "https://vidsrc.wtf",
        "vidsrc_sbs": "https://vidsrc.sbs",
        "vidsrc_pk": "https://embed.vidsrc.pk",
        "vidsrc_fyi": "https://vidsrc.fyi"
      },
      "embed_urls": {
        "vidsrc_to_movie": "https://vidsrc.to/embed/movie/",
        "vidsrc_to_tv": "https://vidsrc.to/embed/tv/",
        "vidsrc_pm_movie": "https://streamdata.vaplayer.ru/api.php?tmdb={id}&type=movie",
        "vidsrc_pm_tv": "https://streamdata.vaplayer.ru/api.php?tmdb={id}&type=tv&season={season}&episode={episode}",
        "vidsrc_pm_fallback": "https://streamdata.vaplayer.ru/api.php?{param}={id}&type={type}{tv_params}",
        "vidlink_gateways": [
          "https://vidlink.pro",
          "https://vidlink.me",
          "https://vidlink.org",
          "https://vidlink.net"
        ]
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
        "vidlink_referer": "https://vidlink.pro/",
        "vidlink_origin": "https://vidlink.pro",
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
        "vidsrc_me_origin": "https://vidsrc.me",
        "brightpath_referer": "https://brightpathsignals.com/",
        "brightpath_origin": "https://brightpathsignals.com"
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
        val prefs = context.getSharedPreferences("CineMovieOTA", android.content.Context.MODE_PRIVATE)
        return prefs.getString("cached_config", null)
    }

    private fun setCachedConfig(json: String) {
        val prefs = context.getSharedPreferences("CineMovieOTA", android.content.Context.MODE_PRIVATE)
        prefs.edit().putString("cached_config", json).apply()
    }

    private fun loadOtaConfig() {
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
                val req = Request.Builder().url(url).build()
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
        startLocalProxy()
        loadOtaConfig()
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
                refToUse = if (targetUrlStr.contains("vodvidl.site") || targetUrlStr.contains("vidlink")) {
                    "https://vidlink.pro/"
                } else if (targetUrlStr.contains("cloudnestra") || targetUrlStr.contains("yonderunyielding")) {
                    "https://cloudnestra.com/"
                } else if (targetUrlStr.contains("vidsrc.wtf")) {
                    "https://vidsrc.wtf/"
                } else if (targetUrlStr.contains("vidsrc.sbs")) {
                    "https://vidsrc.sbs/"
                } else if (targetUrlStr.contains("vidsrc.pk")) {
                    "https://embed.vidsrc.pk/"
                } else if (targetUrlStr.contains("vidsrc")) {
                    "https://vidsrc.me/"
                } else {
                    "https://vidlink.pro/"
                }
            }

            if (origToUse.isEmpty()) {
                origToUse = if (targetUrlStr.contains("vodvidl.site") || targetUrlStr.contains("vidlink")) {
                    "https://vidlink.pro"
                } else if (targetUrlStr.contains("cloudnestra") || targetUrlStr.contains("yonderunyielding")) {
                    "https://cloudnestra.com"
                } else if (targetUrlStr.contains("vidsrc.wtf")) {
                    "https://vidsrc.wtf"
                } else if (targetUrlStr.contains("vidsrc.sbs")) {
                    "https://vidsrc.sbs"
                } else if (targetUrlStr.contains("vidsrc.pk")) {
                    "https://embed.vidsrc.pk"
                } else if (targetUrlStr.contains("vidsrc")) {
                    "https://vidsrc.me"
                } else {
                    "https://vidlink.pro"
                }
            }

            val isVidsrcPmCdn = (
                targetUrlStr.contains("smartbusinessframework.site") ||
                targetUrlStr.contains("lifestylefreedomlab.site") ||
                targetUrlStr.contains("highperformancebrands.site") ||
                targetUrlStr.contains("quietmidnightgardeningideas") ||
                targetUrlStr.contains("/mbzqN9iiy/") ||
                targetUrlStr.contains("/content/") ||
                targetUrlStr.contains("/pl/") ||
                targetUrlStr.contains("/playlist/") ||
                targetUrlStr.contains("/WnVM9YFN1/")
            )

            var rangeHeader: String? = null
            var line: String?
            while (reader.readLine().also { line = it } != null && !line!!.trim().isEmpty()) {
                val lower = line!!.lowercase()
                if (lower.startsWith("range:")) {
                    rangeHeader = line!!.substring(6).trim()
                }
            }

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
            val contentType = conn.contentType ?: "application/octet-stream"
            val contentLength = conn.contentLength

            val isM3U8 = contentType.contains("mpegurl", ignoreCase = true) || targetUrlStr.contains(".m3u8", ignoreCase = true)
            var bodyBytes: ByteArray? = null
            
            val stream = if (responseCode in 200..299) conn.inputStream else conn.errorStream
            if (stream != null) {
                if (isM3U8 && responseCode in 200..299) {
                    val m3u8Content = stream.bufferedReader(Charsets.UTF_8).use { it.readText() }
                    val lines = m3u8Content.split("\n")
                    val rewritten = StringBuilder()
                    for (line in lines) {
                        val trimmed = line.trim()
                        if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
                            rewritten.append("http://localhost:$proxyPort/local-proxy?url=")
                                     .append(java.net.URLEncoder.encode(trimmed, "UTF-8"))
                                     .append("&referer=")
                                     .append(java.net.URLEncoder.encode(referer, "UTF-8"))
                                     .append("&origin=")
                                     .append(java.net.URLEncoder.encode(origin, "UTF-8"))
                                     .append("\n")
                        } else if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
                            val absUrl = "${lastProxyScheme}://${lastProxyHost}${trimmed}"
                            rewritten.append("http://localhost:$proxyPort/local-proxy?url=")
                                     .append(java.net.URLEncoder.encode(absUrl, "UTF-8"))
                                     .append("&referer=")
                                     .append(java.net.URLEncoder.encode(referer, "UTF-8"))
                                     .append("&origin=")
                                     .append(java.net.URLEncoder.encode(origin, "UTF-8"))
                                     .append("\n")
                        } else {
                            rewritten.append(line).append("\n")
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
        val tmdbId = call.getString("tmdbId") ?: return call.reject("Missing tmdbId")
        val imdbId = call.getString("imdbId") ?: ""
        val type = call.getString("type") ?: "movie"
        val season = call.getInt("season") ?: 1
        val episode = call.getInt("episode") ?: 1
        val server = call.getString("server") ?: "test-server"

        val isTv = type == "tv"
        val embedUrls = remoteConfig.optJSONObject("embed_urls") ?: org.json.JSONObject()
        val gateways = remoteConfig.optJSONObject("gateways") ?: org.json.JSONObject()

        // Dynamically resolve base URL matching the selected server
        val serverBaseUrl = when (server) {
            "vidsrc-sbs" -> gateways.optString("vidsrc_sbs", "https://vidsrc.sbs")
            "vidsrc-pk"  -> gateways.optString("vidsrc_pk", "https://embed.vidsrc.pk")
            "vidsrc-fyi" -> gateways.optString("vidsrc_fyi", "https://vidsrc.fyi")
            "vidsrc-wtf-2" -> gateways.optString("vidsrc_wtf", "https://vidsrc.wtf")
            else -> {
                val movieBase = embedUrls.optString("vidsrc_to_movie", "https://vidsrc.to/embed/movie/")
                if (movieBase.contains("/embed/")) movieBase.substringBefore("/embed/") else "https://vidsrc.to"
            }
        }.replace(Regex("/$"), "")

        val targetUrl = if (isTv) {
            "$serverBaseUrl/embed/tv/$tmdbId/$season/$episode"
        } else {
            "$serverBaseUrl/embed/movie/$tmdbId"
        }

        val patternsArr = remoteConfig.optJSONArray("stream_patterns")
        val patterns = mutableListOf<String>()
        if (patternsArr != null) {
            for (i in 0 until patternsArr.length()) {
                patterns.add(patternsArr.getString(i))
            }
        }
        if (patterns.isEmpty()) {
            patterns.add(".m3u8")
            patterns.add(".mp4")
            patterns.add("filemoon")
        }

        addLog("[Engine] resolveStreams started with BackgroundRequestObserver targeting: $targetUrl")

        val observer = BackgroundRequestObserver(context)
        observer.startObservation(targetUrl, patterns, object : BackgroundRequestObserver.ObserverListener {
            override fun onResourceIntercepted(url: String) {
                addLog("[Engine] BackgroundRequestObserver intercepted resource: $url")
                scope.launch {
                    val subtitles = try {
                        val imdbIdResolved = if (imdbId.isNotEmpty()) imdbId else fetchImdbId(tmdbId, isTv)
                        if (imdbIdResolved != null) scrapeYtsSubtitles(imdbIdResolved) else JSArray()
                    } catch (e: Exception) {
                        JSArray()
                    }

                    // Wrap resolved stream inside local proxy to bypass CORS/referer validation
                    val proxiedUrl = "http://localhost:$proxyPort/local-proxy?url=${java.net.URLEncoder.encode(url, "UTF-8")}&referer=${java.net.URLEncoder.encode("$serverBaseUrl/", "UTF-8")}&origin=${java.net.URLEncoder.encode(serverBaseUrl, "UTF-8")}"

                    // Feed straight into native ExoPlayer / Video View playback pipeline
                    val intent = Intent(context, MoviePlayerActivity::class.java).apply {
                        putExtra("source_url", proxiedUrl)
                        val headersObj = JSObject().apply {
                            put("Referer", "$serverBaseUrl/")
                            put("Origin", serverBaseUrl)
                        }
                        putExtra("headers", headersObj.toString())
                        putExtra("subtitles", subtitles.toString())
                        putExtra("title", "CineMovie Native Playback")
                        putExtra("queue", JSArray().toString())
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(intent)

                    val response = JSObject().apply {
                        val sourcesArr = JSArray().put(JSObject().apply {
                            put("url", proxiedUrl)
                            put("quality", "auto")
                            put("isM3U8", url.contains(".m3u8"))
                            put("headers", JSObject().apply {
                                put("Referer", "$serverBaseUrl/")
                            })
                        })
                        put("sources", sourcesArr)
                        put("subtitles", subtitles)
                        put("errors", JSArray())
                    }
                    call.resolve(response)
                }
            }

            override fun onTimeout() {
                addLog("[Engine] BackgroundRequestObserver timed out. Gracefully cascading to standard VidSrc PM API fallback...")
                scope.launch {
                    try {
                        val vidsrcRes = resolveVidsrcTo(tmdbId, isTv, season, episode, imdbId)
                        val vsSources = vidsrcRes.optJSONArray("sources")
                        val vsSubs = vidsrcRes.optJSONArray("subtitles")
                        val vsError = vidsrcRes.optString("error", "")

                        val response = JSObject().apply {
                            put("sources", vsSources ?: JSArray())
                            put("subtitles", vsSubs ?: JSArray())
                            put("errors", if (vsError.isNotEmpty()) JSArray().put(vsError) else JSArray())
                        }
                        call.resolve(response)
                    } catch (e: Exception) {
                        addLog("[Engine] Fallback failed: ${e.message}")
                        call.reject("Resolution failed: ${e.message}", e)
                    }
                }
            }
        })
    }

    @PluginMethod
    fun resolveVidlink(call: PluginCall) {
        val tmdbId = call.getString("tmdbId") ?: return call.reject("Missing tmdbId")
        val imdbId = call.getString("imdbId") ?: ""
        val type = call.getString("type") ?: "movie"
        val season = call.getInt("season") ?: 1
        val episode = call.getInt("episode") ?: 1
        val isTv = type == "tv"

        addLog("[Vidlink] Starting native API resolution for $tmdbId ($type)")
        scope.launch {
            try {
                // 1. Get encrypted token using QuickJS
                val token = jsEngine.runExtractor("vidlink_encrypt", tmdbId, "")
                if (token.isEmpty() || token.contains("error")) {
                    throw Exception("Failed to encrypt token: $token")
                }
                addLog("[Vidlink] Generated encrypted token: $token")

                // 2. Fetch gateways from config
                val config = remoteConfig.optJSONObject("embed_urls") ?: org.json.JSONObject()
                val gateways = mutableListOf<String>()
                val gatewaysArr = config.optJSONArray("vidlink_gateways")
                if (gatewaysArr != null) {
                    for (i in 0 until gatewaysArr.length()) {
                        gateways.add(gatewaysArr.getString(i))
                    }
                }
                if (gateways.isEmpty()) {
                    gateways.add("https://vidlink.pro")
                    gateways.add("https://vidlink.me")
                    gateways.add("https://vidlink.org")
                    gateways.add("https://vidlink.net")
                }

                val headersConfig = remoteConfig.optJSONObject("headers") ?: org.json.JSONObject()
                val referer = headersConfig.optString("vidlink_referer", "https://vidlink.pro/")
                val origin = headersConfig.optString("vidlink_origin", "https://vidlink.pro")

                var successJson: org.json.JSONObject? = null
                var successGateway = ""
                var contentUnavailable = false

                for (gw in gateways) {
                    if (contentUnavailable) break
                    val url = if (isTv) {
                        "$gw/api/b/tv/$token/$season/$episode?multiLang=1"
                    } else {
                        "$gw/api/b/movie/$token?multiLang=1"
                    }
                    addLog("[Vidlink] Trying gateway: $url")
                    try {
                        val responseStr = proxyFetch(url, referer, origin)
                        // Empty body means this content ID is not indexed by Vidlink at all - no point trying other gateways
                        if (responseStr.isBlank()) {
                            addLog("[Vidlink] Gateway $gw returned empty body - content not available on Vidlink, aborting gateway loop")
                            contentUnavailable = true
                            break
                        }
                        // HTML response means gateway is parked/broken - skip but still try others
                        if (responseStr.trimStart().startsWith("<")) {
                            addLog("[Vidlink] Gateway $gw returned HTML, skipping")
                            continue
                        }
                        val resObj = org.json.JSONObject(responseStr)
                        if (resObj.has("stream")) {
                            successJson = resObj
                            successGateway = gw
                            break
                        }
                    } catch (e: Exception) {
                        addLog("[Vidlink] Gateway $gw failed: ${e.message}")
                    }
                }

                if (successJson == null) {
                    // Fall back to VidSrc PM API (streamdata.vaplayer.ru) before giving up entirely
                    addLog("[Vidlink] All gateways failed, falling back to VidSrc PM API...")
                    try {
                        val pmUrl = if (isTv) {
                            "https://streamdata.vaplayer.ru/api.php?tmdb=$tmdbId&type=tv&season=$season&episode=$episode"
                        } else {
                            "https://streamdata.vaplayer.ru/api.php?tmdb=$tmdbId&type=movie"
                        }
                        val pmReferer = "https://brightpathsignals.com/"
                        val pmOrigin = "https://brightpathsignals.com"
                        val pmStr = proxyFetch(pmUrl, pmReferer, pmOrigin)
                        val pmObj = org.json.JSONObject(pmStr)
                        val pmData = pmObj.optJSONObject("data") ?: pmObj
                        // The vaplayer API returns stream_urls as a plain array of identical adaptive
                        // HLS master URLs (different CDN mirrors of the same stream). Use only the
                        // first one — HLS.js ABR will handle quality selection internally.
                        val pmStreamUrls = pmData.optJSONArray("stream_urls") ?: org.json.JSONArray()
                        val pmSubsList = pmObj.optJSONArray("default_subs") ?: pmData.optJSONArray("default_subs") ?: org.json.JSONArray()

                        val fbSourcesArr = JSArray()
                        // Only add the first adaptive master URL — do NOT add all 4 mirrors with fake
                        // quality labels; that causes wrong URL to play when user taps a quality button.
                        val bestUrl = pmStreamUrls.optString(0, "")
                        if (bestUrl.isNotEmpty()) {
                            fbSourcesArr.put(JSObject().apply {
                                put("url", "http://localhost:$proxyPort/local-proxy?url=${java.net.URLEncoder.encode(bestUrl, "UTF-8")}&referer=${java.net.URLEncoder.encode(pmReferer, "UTF-8")}&origin=${java.net.URLEncoder.encode(pmOrigin, "UTF-8")}")
                                put("quality", "auto")
                                put("isM3U8", bestUrl.contains(".m3u8"))
                            })
                        }
                        val fbSubsArr = JSArray()
                        for (j in 0 until pmSubsList.length()) {
                            val sub = pmSubsList.optJSONObject(j) ?: continue
                            val subUrl = sub.optString("url", sub.optString("file", ""))
                            val subLang = sub.optString("lang", sub.optString("label", "English"))
                            if (subUrl.isNotEmpty()) {
                                val resolvedSubUrl = if (subUrl.endsWith(".zip") || subUrl.contains(".zip?")) {
                                    "http://localhost:$proxyPort/unzip-to-vtt?url=${java.net.URLEncoder.encode(subUrl, "UTF-8")}"
                                } else {
                                    "http://localhost:$proxyPort/convert-to-vtt?url=${java.net.URLEncoder.encode(subUrl, "UTF-8")}"
                                }
                                fbSubsArr.put(JSObject().apply {
                                    put("url", resolvedSubUrl)
                                    put("lang", subLang)
                                })
                            }
                        }

                        if (fbSourcesArr.length() > 0) {
                            addLog("[Vidlink] VidSrc PM fallback resolved: ${fbSourcesArr.length()} adaptive HLS source(s)")
                            val fbResponse = JSObject().apply {
                                put("sources", fbSourcesArr)
                                put("subtitles", fbSubsArr)
                                put("errors", JSArray())
                            }
                            call.resolve(fbResponse)
                            return@launch
                        }
                    } catch (e2: Exception) {
                        addLog("[Vidlink] VidSrc PM fallback also failed: ${e2.message}")
                    }
                    throw Exception("Failed to resolve from any Vidlink gateway or VidSrc PM fallback")
                }

                // 3. Format response
                val streamObj = successJson.optJSONObject("stream") ?: org.json.JSONObject()
                val playlist = streamObj.optString("playlist", "")
                val sourcesArr = JSArray()

                if (playlist.isNotEmpty()) {
                    sourcesArr.put(JSObject().apply {
                        put("url", "http://localhost:$proxyPort/local-proxy?url=${java.net.URLEncoder.encode(playlist, "UTF-8")}&referer=${java.net.URLEncoder.encode(referer, "UTF-8")}&origin=${java.net.URLEncoder.encode(origin, "UTF-8")}")
                        put("quality", "auto")
                        put("isM3U8", true)
                    })
                } else {
                    val qualitiesObj = streamObj.optJSONObject("qualities")
                    if (qualitiesObj != null) {
                        val keysList = mutableListOf<String>()
                        val keys = qualitiesObj.keys()
                        while (keys.hasNext()) {
                            keysList.add(keys.next())
                        }
                        // Sort keys by quality number descending (e.g. 1080, 720, 360)
                        keysList.sortByDescending { key ->
                            key.filter { it.isDigit() }.toIntOrNull() ?: 0
                        }
                        for (key in keysList) {
                            val qObj = qualitiesObj.optJSONObject(key)
                            if (qObj != null) {
                                val qUrl = qObj.optString("url", "")
                                val qType = qObj.optString("type", "")
                                if (qUrl.isNotEmpty()) {
                                    val cleanedUrl = qUrl.replace("\\/", "/")
                                    sourcesArr.put(JSObject().apply {
                                        put("url", "http://localhost:$proxyPort/local-proxy?url=${java.net.URLEncoder.encode(cleanedUrl, "UTF-8")}&referer=${java.net.URLEncoder.encode(referer, "UTF-8")}&origin=${java.net.URLEncoder.encode(origin, "UTF-8")}")
                                        put("quality", key)
                                        put("isM3U8", qType == "hls" || cleanedUrl.contains(".m3u8"))
                                    })
                                }
                            }
                        }
                    }
                }

                if (sourcesArr.length() == 0) {
                    throw Exception("No stream sources found in Vidlink response")
                }

                val subsArr = JSArray()
                val captionsList = successJson.optJSONArray("captions")
                    ?: streamObj.optJSONArray("captions")
                    ?: successJson.optJSONArray("subtitles")
                    ?: streamObj.optJSONArray("subtitles")
                    ?: org.json.JSONArray()
                for (i in 0 until captionsList.length()) {
                    val c = captionsList.optJSONObject(i) ?: continue
                    var subUrl = c.optString("url", c.optString("file", ""))
                    val subLang = c.optString("language", c.optString("lang", c.optString("label", "Unknown")))
                    if (subUrl.isNotEmpty()) {
                        if (!subUrl.startsWith("http://") && !subUrl.startsWith("https://")) {
                            if (subUrl.startsWith("//")) {
                                subUrl = "https:$subUrl"
                            } else if (subUrl.startsWith("/")) {
                                subUrl = "$successGateway$subUrl"
                            } else {
                                subUrl = "$successGateway/$subUrl"
                            }
                        }
                        val subType = c.optString("type", "").lowercase()
                        val isSrt = subType == "srt" || subUrl.contains(".srt") || subUrl.contains(".srt?")
                        val resolvedSubUrl = if (isSrt) {
                            "http://localhost:$proxyPort/convert-to-vtt?url=${java.net.URLEncoder.encode(subUrl, "UTF-8")}"
                        } else {
                            "http://localhost:$proxyPort/local-proxy?url=${java.net.URLEncoder.encode(subUrl, "UTF-8")}&referer=${java.net.URLEncoder.encode(referer, "UTF-8")}&origin=${java.net.URLEncoder.encode(origin, "UTF-8")}"
                        }
                        subsArr.put(JSObject().apply {
                            put("url", resolvedSubUrl)
                            put("lang", subLang)
                        })
                    }
                }
                
                // Fetch backup subtitles: YTS for movies, Vidsrc PM for TV shows
                try {
                    if (isTv) {
                        addLog("[Vidlink] Scraping Vidsrc PM backup subtitles for TV Show (TMDb: $tmdbId, S$season E$episode)...")
                        val pmUrlResolved = "https://streamdata.vaplayer.ru/api.php?tmdb=$tmdbId&type=tv&season=$season&episode=$episode"
                        val jsonStr = proxyFetch(pmUrlResolved, "https://brightpathsignals.com/", "https://brightpathsignals.com")
                        val dataObj = org.json.JSONObject(jsonStr)
                        val streamData = dataObj.optJSONObject("data") ?: org.json.JSONObject()
                        val subsList = dataObj.optJSONArray("default_subs") ?: streamData.optJSONArray("default_subs") ?: org.json.JSONArray()
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
                                    put("lang", "$subLang (Vidsrc)")
                                    put("isBackup", true)
                                })
                            }
                        }
                    } else {
                        val imdbIdResolved = if (imdbId.isNotEmpty()) imdbId else fetchImdbId(tmdbId, isTv)
                        if (imdbIdResolved != null && imdbIdResolved.isNotEmpty()) {
                            addLog("[Vidlink] Scraping YTS backup subtitles for IMDB: $imdbIdResolved...")
                            val ytsSubs = scrapeYtsSubtitles(imdbIdResolved)
                            for (j in 0 until ytsSubs.length()) {
                                subsArr.put(ytsSubs.get(j))
                            }
                        }
                    }
                } catch (e: Exception) {
                    addLog("[Vidlink] Backup subtitles failed: ${e.message}")
                }

                addLog("[Vidlink] Successfully resolved natively: ${sourcesArr.length()} sources, ${subsArr.length()} subtitles")
                val response = JSObject().apply {
                    put("sources", sourcesArr)
                    put("subtitles", subsArr)
                    put("errors", JSArray())
                }
                call.resolve(response)
            } catch (e: Exception) {
                addLog("[Vidlink] Native resolution failed: ${e.message}")
                call.reject("Resolution failed: ${e.message}", e)
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
    fun addJsLog(call: PluginCall) {
        val message = call.getString("message")
        if (message != null) {
            addLog(message)
        }
        call.resolve()
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

        if (refToUse.isEmpty()) {
            if (targetUrl.contains("vodvidl.site") || targetUrl.contains("vidlink")) {
                refToUse = "https://vidlink.pro/"
            } else if (targetUrl.contains(wtfHost)) {
                refToUse = if (wtfUrl.endsWith("/")) wtfUrl else "$wtfUrl/"
            } else if (targetUrl.contains(sbsHost)) {
                refToUse = if (sbsUrl.endsWith("/")) sbsUrl else "$sbsUrl/"
            } else if (targetUrl.contains(pkHost)) {
                refToUse = if (pkUrl.endsWith("/")) pkUrl else "$pkUrl/"
            } else if (targetUrl.contains(fyiHost)) {
                refToUse = if (fyiUrl.endsWith("/")) fyiUrl else "$fyiUrl/"
            } else if (targetUrl.contains("vidsrc")) {
                refToUse = "https://vidsrc.me/"
            } else if (host.isNotEmpty()) {
                refToUse = "https://$host/"
            } else {
                refToUse = "https://google.com/"
            }
        }

        if (origToUse.isEmpty()) {
            if (targetUrl.contains("vodvidl.site") || targetUrl.contains("vidlink")) {
                origToUse = "https://vidlink.pro"
            } else if (targetUrl.contains(wtfHost)) {
                origToUse = wtfUrl.removeSuffix("/")
            } else if (targetUrl.contains(sbsHost)) {
                origToUse = sbsUrl.removeSuffix("/")
            } else if (targetUrl.contains(pkHost)) {
                origToUse = pkUrl.removeSuffix("/")
            } else if (targetUrl.contains(fyiHost)) {
                origToUse = fyiUrl.removeSuffix("/")
            } else if (targetUrl.contains("vidsrc")) {
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
            targetUrl.contains("/mbzqN9iiy/") ||
            targetUrl.contains("/WnVM9YFN1/")
        )

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
        addLog("[Vidsrc] Trying Vidsrc PM API natively...")
        val pmUrl = if (isTv) {
            "https://streamdata.vaplayer.ru/api.php?tmdb=$tmdbId&type=tv&season=$season&episode=$episode"
        } else {
            "https://streamdata.vaplayer.ru/api.php?tmdb=$tmdbId&type=movie"
        }
        
        try {
            val jsonStr = proxyFetch(pmUrl, "https://brightpathsignals.com/", "https://brightpathsignals.com")
            val dataObj = org.json.JSONObject(jsonStr)
            val statusCode = dataObj.optString("status_code", "")
            if (statusCode == "200") {
                val streamData = dataObj.optJSONObject("data") ?: org.json.JSONObject()
                val streamUrls = streamData.optJSONArray("stream_urls") ?: org.json.JSONArray()
                if (streamUrls.length() > 0) {
                    val sourcesArr = JSArray()
                    for (i in 0 until streamUrls.length()) {
                        val stream = streamUrls.getString(i)
                        val proxiedStreamUrl = "http://localhost:$proxyPort/local-proxy?url=${java.net.URLEncoder.encode(stream, "UTF-8")}&referer=${java.net.URLEncoder.encode("https://brightpathsignals.com/", "UTF-8")}&origin=${java.net.URLEncoder.encode("https://brightpathsignals.com", "UTF-8")}"
                        sourcesArr.put(JSObject().apply {
                            put("url", proxiedStreamUrl)
                            put("quality", if (i == 0) "auto" else "backup $i")
                            put("isM3U8", true)
                            put("headers", JSObject().apply {
                                put("Referer", "https://brightpathsignals.com/")
                                put("Origin", "https://brightpathsignals.com")
                            })
                        })
                    }
                    
                    val subsArr = JSArray()
                    val subsList = dataObj.optJSONArray("default_subs") ?: streamData.optJSONArray("default_subs") ?: org.json.JSONArray()
                    for (i in 0 until subsList.length()) {
                        val sub = subsList.optJSONObject(i) ?: continue
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
                    
                    if (subsArr.length() == 0 && !isTv) {
                        try {
                            val imdbId = if (explicitImdbId.isNotEmpty()) explicitImdbId else fetchImdbId(tmdbId, isTv)
                            if (imdbId != null && imdbId.isNotEmpty()) {
                                val ytsSubs = scrapeYtsSubtitles(imdbId)
                                for (j in 0 until ytsSubs.length()) {
                                    subsArr.put(ytsSubs.get(j))
                                }
                            }
                        } catch (_: Exception) {}
                    }
                    
                    addLog("[Vidsrc] Successfully resolved via Vidsrc PM API natively: ${sourcesArr.length()} streams, ${subsArr.length()} subtitles.")
                    return JSObject().apply {
                        put("sources", sourcesArr)
                        put("subtitles", subsArr)
                    }
                }
            }
        } catch (pmErr: Exception) {
            addLog("[Vidsrc] Vidsrc PM API resolution failed: ${pmErr.message}. Falling back to vidsrc.to chain...")
        }

        addLog("[Vidsrc] Resolving vidsrc.to natively...")
        val embedUrl = if (isTv) {
            "https://vidsrc.to/embed/tv/$tmdbId/$season/$episode"
        } else {
            "https://vidsrc.to/embed/movie/$tmdbId"
        }
        
        try {
            val html1 = proxyFetch(embedUrl, "https://google.com/")
            addLog("[Vidsrc] Fetched embed HTML successfully, size: ${html1.length}")
            val vsembedMatch = Regex("""src="(https?://vsembed[^"]+)"""").find(html1)
            val vsembedUrl = vsembedMatch?.groupValues?.get(1) ?: throw Exception("vsembed iframe not found")
            addLog("[Vidsrc] Found vsembedUrl = $vsembedUrl")
            
            val html2 = proxyFetch(vsembedUrl, embedUrl)
            addLog("[Vidsrc] Fetched vsembed HTML successfully, size: ${html2.length}")
            val rcpMatch = Regex("""//([^/]+)/rcp/([A-Za-z0-9_\-=.]+)""").find(html2)
            val rcpDomain = rcpMatch?.groupValues?.get(1) ?: throw Exception("rcp domain not found")
            val rcpHash = rcpMatch?.groupValues?.get(2) ?: throw Exception("rcp hash not found")
            val rcpUrl = "https://$rcpDomain/rcp/$rcpHash"
            addLog("[Vidsrc] Found rcpDomain = $rcpDomain, rcpUrl = $rcpUrl")
            
            val html3 = proxyFetch(rcpUrl, vsembedUrl)
            addLog("[Vidsrc] Fetched rcp HTML successfully, size: ${html3.length}")
            val prorcpMatch = Regex("""src:\s*['"]\s*/prorcp/([^'"]+)['"]""", RegexOption.IGNORE_CASE).find(html3)
            val prorcpHash = prorcpMatch?.groupValues?.get(1) ?: throw Exception("prorcp hash not found")
            val prorcpUrl = "https://$rcpDomain/prorcp/$prorcpHash"
            addLog("[Vidsrc] Found prorcpUrl = $prorcpUrl")
            
            val html4 = proxyFetch(prorcpUrl, rcpUrl)
            addLog("[Vidsrc] Fetched prorcp HTML successfully, size: ${html4.length}")
            val maxLen = if (html4.length > 2000) 2000 else html4.length
            addLog("[Vidsrc] prorcp HTML content: ${html4.substring(0, maxLen)}")
            val m3u8Match = Regex(""""(https?://[^"]+\.m3u8[^"]*)"""", RegexOption.IGNORE_CASE).find(html4)
            val rawMatched = m3u8Match?.groupValues?.get(1) ?: throw Exception("m3u8 stream not found")
            
            val cleaned = rawMatched.replace(Regex("""\{v\d\}"""), rcpDomain)
            addLog("[Vidsrc] Successfully resolved final m3u8 stream = $cleaned")
            
            val sourceObj = JSObject().apply {
                put("url", cleaned)
                put("quality", "auto")
                put("isM3U8", true)
                put("headers", JSObject().apply {
                    put("Referer", rcpUrl)
                    put("Origin", "https://$rcpDomain")
                })
            }
            
            val subtitles = try {
                val imdbId = fetchImdbId(tmdbId, isTv)
                if (imdbId != null) scrapeYtsSubtitles(imdbId) else JSArray()
            } catch (_: Exception) {
                JSArray()
            }

            return JSObject().apply {
                put("sources", JSArray().put(sourceObj))
                put("subtitles", subtitles)
            }
        } catch (e: Exception) {
            addLog("[Vidsrc] Native parse failed: ${e.message}. Querying streamdata API fallback...")
            try {
                val param = if (tmdbId.startsWith("tt")) "imdb" else "tmdb"
                val fallbackUrl = "https://streamdata.vaplayer.ru/api.php?$param=$tmdbId&type=${if (isTv) "tv" else "movie"}${if (isTv) "&season=$season&episode=$episode" else ""}"
                val jsonStr = proxyFetch(fallbackUrl, "https://brightpathsignals.com/", "https://brightpathsignals.com")
                val jsonObj = org.json.JSONObject(jsonStr)
                if (jsonObj.has("status_code") && (jsonObj.optInt("status_code") == 200 || jsonObj.optString("status_code") == "200")) {
                    val streamData = jsonObj.optJSONObject("data")
                    val streamUrls = streamData?.optJSONArray("stream_urls")
                    val imdbId = streamData?.optString("imdb_id")
                    if (streamUrls != null && streamUrls.length() > 0) {
                        val combinedSources = JSArray()
                        for (i in 0 until streamUrls.length()) {
                            val stream = streamUrls.getString(i)
                            val sourceObj = JSObject().apply {
                                put("url", stream)
                                put("quality", if (i == 0) "auto" else "backup $i")
                                put("isM3U8", true)
                                put("headers", JSObject().apply {
                                    put("Referer", "https://brightpathsignals.com/")
                                    put("Origin", "https://brightpathsignals.com")
                                })
                            }
                            combinedSources.put(sourceObj)
                        }
                        addLog("[Vidsrc] Fallback resolved ${combinedSources.length()} streams successfully.")
                        val fallbackSubtitles = try {
                            val subImdbId = imdbId ?: fetchImdbId(tmdbId, isTv)
                            if (subImdbId != null) scrapeYtsSubtitles(subImdbId) else JSArray()
                        } catch (_: Exception) {
                            JSArray()
                        }
                        return JSObject().apply {
                            put("sources", combinedSources)
                            put("subtitles", fallbackSubtitles)
                        }
                    }
                }
                addLog("[Vidsrc] Fallback API empty or returned error code.")
            } catch (fallbackErr: Exception) {
                addLog("[Vidsrc] Fallback streamdata API failed: ${fallbackErr.message}")
            }
            return JSObject().apply {
                put("sources", JSArray())
                put("subtitles", JSArray())
                put("error", "vidsrc.to: " + (e.message ?: "Unknown error"))
            }
        }
    }

    private fun resolveFilemoon(tmdbId: String, isTv: Boolean, season: Int, episode: Int): JSObject {
        addLog("[Filemoon] Resolving Filemoon natively for id: $tmdbId")
        val filemoonEmbedUrl = if (tmdbId.startsWith("http://") || tmdbId.startsWith("https://")) {
            tmdbId
        } else if (isTv) {
            "https://filemoon.to/e/$tmdbId/$season-$episode"
        } else {
            "https://filemoon.to/e/$tmdbId"
        }
        
        try {
            val req = Request.Builder().url(filemoonEmbedUrl).build()
            val html = client.newCall(req).execute().body?.string() ?: throw Exception("Filemoon page empty")
            addLog("[Filemoon] Fetched embed HTML successfully, size: ${html.length}")
            val extractedJson = jsEngine.runExtractor("filemoon", html, filemoonEmbedUrl)
            addLog("[Filemoon] Extracted JSON = $extractedJson")
            val data = JSObject(extractedJson)
            
            if (data.has("filemoon_redirect") && !data.isNull("filemoon_redirect")) {
                val redirectUrl = data.getString("filemoon_redirect") ?: ""
                addLog("[Filemoon] Found redirection URL inside parent page payload: $redirectUrl. Resolving recursively...")
                return resolveFilemoon(redirectUrl, isTv, season, episode)
            }
            
            if (data.has("source_url") && !data.isNull("source_url")) {
                val sourceObj = JSObject().apply {
                    put("url", data.getString("source_url"))
                    put("quality", "auto")
                    put("isM3U8", true)
                    put("headers", data.getJSObject("headers"))
                }
                addLog("[Filemoon] Successfully resolved stream url = ${data.getString("source_url")}")
                val filemoonSubs = try {
                    val imdbId = fetchImdbId(tmdbId, isTv)
                    if (imdbId != null) scrapeYtsSubtitles(imdbId) else JSArray()
                } catch (_: Exception) {
                    JSArray()
                }
                return JSObject().apply {
                    put("sources", JSArray().put(sourceObj))
                    put("subtitles", filemoonSubs)
                }
            }
        } catch (e: Exception) {
            addLog("[Filemoon] Failed to resolve: ${e.message}")
            return JSObject().apply {
                put("sources", JSArray())
                put("subtitles", JSArray())
                put("error", "Filemoon: " + (e.message ?: "Unknown error"))
            }
        }
        
        addLog("[Filemoon] Failed: No source url found")
        return JSObject().apply {
            put("sources", JSArray())
            put("subtitles", JSArray())
            put("error", "Filemoon: No source url found")
        }
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

            addLog("[Proxy] Converting subtitle to VTT: $targetUrl")

            val req = Request.Builder()
                .url(targetUrl)
                .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36")
                .build()

            val response = client.newCall(req).execute()
            if (!response.isSuccessful) throw Exception("HTTP ${response.code}")

            val bytes = response.body?.bytes() ?: throw Exception("Empty response body")
            val subtitleText = try {
                String(bytes, Charsets.UTF_8)
            } catch (_: Exception) {
                String(bytes, Charsets.ISO_8859_1)
            }

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
