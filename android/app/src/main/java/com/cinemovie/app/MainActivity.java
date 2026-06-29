package com.cinemovie.app;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register custom SystemCastPlugin before super.onCreate initializes the bridge
        registerPlugin(SystemCastPlugin.class);
        registerPlugin(NativeStreamingEnginePlugin.class);
        super.onCreate(savedInstanceState);




        // Keep screen on during video playback
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // Force display to keep refresh rate at least at 60Hz to prevent ColorOS / aggressive ARR
        // from throttling WebView video playback down to 30Hz when no touch interaction is detected.
        try {
            WindowManager.LayoutParams params = getWindow().getAttributes();
            if (android.os.Build.VERSION.SDK_INT >= 31) { // Android 12 (S)
                java.lang.reflect.Field fieldMin = params.getClass().getField("preferredMinDisplayRefreshRate");
                fieldMin.setFloat(params, 60.0f);
                java.lang.reflect.Field fieldMax = params.getClass().getField("preferredMaxDisplayRefreshRate");
                fieldMax.setFloat(params, 120.0f);
            } else if (android.os.Build.VERSION.SDK_INT >= 30) { // Android 11 (R)
                java.lang.reflect.Field field = params.getClass().getField("preferredFrameRate");
                field.setFloat(params, 60.0f);
            }
            getWindow().setAttributes(params);
            android.util.Log.d("MainActivity", "Successfully set WebView preferred refresh rate via reflection");
        } catch (Exception e) {
            android.util.Log.w("MainActivity", "Failed to set preferred refresh rate: " + e.getMessage());
        }

        // Allow default hardware-accelerated surface rendering (View.LAYER_TYPE_NONE)
        // instead of forcing off-screen hardware texture layers, which breaks native video decoding sync.
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            // Disable native Android scrollbars to prevent them from showing on devices
            webView.setVerticalScrollBarEnabled(false);
            webView.setHorizontalScrollBarEnabled(false);

            // Allow mixed content for HTTP streaming APIs (e.g. VidSrc)
            WebSettings settings = webView.getSettings();
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
                settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            }
        }

        // Listen for system UI changes to re-enforce immersive mode
        getWindow().getDecorView().setOnSystemUiVisibilityChangeListener(visibility -> {
            hideSystemBarsIfNeeded();
        });
    }



    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemBarsIfNeeded();
        }
    }

    private void hideSystemBarsIfNeeded() {
        // Check window layout flags
        int flags = getWindow().getAttributes().flags;
        boolean isFullscreenFlag = (flags & WindowManager.LayoutParams.FLAG_FULLSCREEN) != 0;
        
        // Check system UI visibility flags (older APIs)
        int uiVisibility = getWindow().getDecorView().getSystemUiVisibility();
        boolean isFullscreenUi = (uiVisibility & View.SYSTEM_UI_FLAG_FULLSCREEN) != 0;

        // Check window insets visibility (newer APIs)
        boolean isStatusBarHidden = false;
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
            WindowInsets insets = getWindow().getDecorView().getRootWindowInsets();
            if (insets != null) {
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
                    isStatusBarHidden = !insets.isVisible(WindowInsets.Type.statusBars());
                }
            }
        }

        // If the web player is in fullscreen or status bar is hidden, ensure the navigation bar is also hidden
        if (isFullscreenFlag || isFullscreenUi || isStatusBarHidden) {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
                WindowInsetsController controller = getWindow().getInsetsController();
                if (controller != null) {
                    controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                    controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                }
            } else {
                getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_FULLSCREEN
                );
            }
        }
    }
}

