package com.cinemovie.app

import android.app.Activity
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import java.io.ByteArrayInputStream
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Headless WebView request observer designed to run on the native Main Thread.
 * Intercepts outgoing resource requests using standard Android WebView client hooks.
 */
class BackgroundRequestObserver(private val activity: Activity) {

    private var webView: WebView? = null
    private val isTargetFound = AtomicBoolean(false)
    private val handler = Handler(Looper.getMainLooper())
    private var timeoutRunnable: Runnable? = null

    interface ObserverListener {
        fun onResourceIntercepted(url: String)
        fun onTimeout()
        fun onLog(msg: String)
    }

    fun startObservation(targetUrl: String, patterns: List<String>, listener: ObserverListener) {
        handler.post {
            setupWebView(targetUrl, patterns, listener)
        }
    }

    private fun setupWebView(targetUrl: String, patterns: List<String>, listener: ObserverListener) {
        isTargetFound.set(false)
        
        // Instantiate the WebView using the Activity context
        val observerWebView = WebView(activity).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            settings.mediaPlaybackRequiresUserGesture = false
            settings.userAgentString = "Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36"
            settings.blockNetworkImage = true // Save bandwidth during validation
            
            // Configure layout to be invisible but attached
            visibility = View.GONE
            layoutParams = ViewGroup.LayoutParams(1, 1)
        }

        webView = observerWebView

        // Attach invisibly to the Activity's root layout to ensure OS grants JS execution cycles
        try {
            val rootView = activity.window.decorView.findViewById<ViewGroup>(android.R.id.content)
            rootView.addView(observerWebView)
            listener.onLog("[Observer] WebView attached to Activity root layout")
        } catch (e: Exception) {
            listener.onLog("[Observer] Failed to attach WebView: ${e.message}")
        }

        observerWebView.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                super.onPageStarted(view, url, favicon)
                listener.onLog("[Observer] Page started loading: $url")
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                listener.onLog("[Observer] Page finished loading: $url")
            }

            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest?
            ): WebResourceResponse? {
                request?.url?.toString()?.let { url ->
                    // Inspect request URL for required format matches (dynamic patterns)
                    var matchesPattern = false
                    for (pattern in patterns) {
                        if (url.contains(pattern)) {
                            matchesPattern = true
                            break
                        }
                    }

                    if (matchesPattern) {
                        listener.onLog("[Observer] Intercepted matching target: $url")
                        
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
            try {
                val parent = it.parent as? ViewGroup
                parent?.removeView(it)
            } catch (ignored: Exception) {}
            it.destroy()
        }
        webView = null
    }
}
