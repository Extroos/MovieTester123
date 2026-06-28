package com.cinemovie.app;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.view.View;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register custom SystemCastPlugin before super.onCreate initializes the bridge
        registerPlugin(SystemCastPlugin.class);
        super.onCreate(savedInstanceState);

        // Hardware Acceleration & Rendering Boost for Framer Motion & YouTube Iframes
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            // Force hardware compositing
            webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);

            // Allow mixed content for HTTP streaming APIs (e.g. VidSrc)
            WebSettings settings = webView.getSettings();
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
                settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            }
        }

    }
}
