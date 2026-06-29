package com.cinemovie.app

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import java.io.ByteArrayInputStream
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Headless WebView request observer designed to run on the native Main Thread.
 * Intercepts outgoing resource requests using standard Android WebView client hooks.
 */
class BackgroundRequestObserver(private val context: Context) {

    private var webView: WebView? = null
    private val isTargetFound = AtomicBoolean(false)
    private val handler = Handler(Looper.getMainLooper())
    private var timeoutRunnable: Runnable? = null

    interface ObserverListener {
        fun onResourceIntercepted(url: String)
        fun onTimeout()
    }

    fun startObservation(targetUrl: String, patterns: List<String>, listener: ObserverListener) {
        handler.post {
            setupWebView(targetUrl, patterns, listener)
        }
    }

    private fun setupWebView(targetUrl: String, patterns: List<String>, listener: ObserverListener) {
        isTargetFound.set(false)
        
        // Instantiate the WebView without attaching it to a parent layout
        val observerWebView = WebView(context).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.userAgentString = "Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36"
            settings.blockNetworkImage = true // Save bandwidth during validation
        }

        webView = observerWebView

        observerWebView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest?
            ): WebResourceResponse? {
                request?.url?.toString()?.let { url ->
                    Log.d("RequestObserver", "Intercepted: $url")

                    // Inspect request URL for required format matches (dynamic patterns)
                    var matchesPattern = false
                    for (pattern in patterns) {
                        if (url.contains(pattern)) {
                            matchesPattern = true
                            break
                        }
                    }

                    if (matchesPattern) {
                        Log.i("RequestObserver", "Matching target resource intercepted: $url")
                        
                        if (isTargetFound.compareAndSet(false, true)) {
                            handler.post {
                                cleanup()
                                listener.onResourceIntercepted(url)
                            }
                        }
                        
                        // Prevent the WebView from consuming network resources for the actual asset
                        return WebResourceResponse(
                            "text/plain", 
                            "UTF-8", 
                            ByteArrayInputStream("".toByteArray())
                        )
                    }
                }
                return super.shouldInterceptRequest(view, request)
            }
        }

        // Navigate to the target page
        observerWebView.loadUrl(targetUrl)

        // Set up 12-second fallback timeout
        timeoutRunnable = Runnable {
            if (isTargetFound.compareAndSet(false, true)) {
                cleanup()
                listener.onTimeout()
            }
        }
        handler.postDelayed(timeoutRunnable!!, 12000)
    }

    fun cleanup() {
        timeoutRunnable?.let { handler.removeCallbacks(it) }
        webView?.let {
            it.stopLoading()
            it.destroy()
        }
        webView = null
    }
}
