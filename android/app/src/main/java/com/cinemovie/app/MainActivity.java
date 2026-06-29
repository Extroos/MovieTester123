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

        // Dynamically lock refresh rate to the display's maximum supported rate (e.g., 90Hz, 120Hz)
        // to bypass aggressive ColorOS/OPPO battery-saver refresh rate throttling.
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            try {
                android.view.Display display = getDisplay();
                if (display != null) {
                    android.view.Display.Mode[] modes = display.getSupportedModes();
                    float maxRate = 60.0f;
                    for (android.view.Display.Mode mode : modes) {
                        if (mode.getRefreshRate() > maxRate) {
                            maxRate = mode.getRefreshRate();
                        }
                    }
                    WindowManager.LayoutParams params = getWindow().getAttributes();
                    if (android.os.Build.VERSION.SDK_INT >= 31) {
                        java.lang.reflect.Field fieldMin = params.getClass().getField("preferredMinDisplayRefreshRate");
                        fieldMin.setFloat(params, maxRate);
                        java.lang.reflect.Field fieldMax = params.getClass().getField("preferredMaxDisplayRefreshRate");
                        fieldMax.setFloat(params, maxRate);
                    } else {
                        java.lang.reflect.Field field = params.getClass().getField("preferredFrameRate");
                        field.setFloat(params, maxRate);
                    }
                    getWindow().setAttributes(params);
                    android.util.Log.d("MainActivity", "Locked display refresh rate to max: " + maxRate);
                }
            } catch (Exception e) {
                android.util.Log.e("MainActivity", "Failed to lock refresh rate to max: " + e.getMessage());
            }
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

    private boolean isUserTouching = false;
    private final android.os.Handler touchBoostHandler = new android.os.Handler();
    private final Runnable resumeTouchBoostRunnable = () -> {
        isUserTouching = false;
    };

    private final Runnable touchBoostRunnable = new Runnable() {
        @Override
        public void run() {
            try {
                if (NativeStreamingEnginePlugin.isTouchBoostActive && !isUserTouching) {
                    long now = android.os.SystemClock.uptimeMillis();
                    
                    // Dispatch a complete, safe out-of-bounds gesture sequence on the DecorView
                    // to trigger the system-level ColorOS Input/Touch Boost without hitting any UI elements.
                    android.view.MotionEvent down = android.view.MotionEvent.obtain(
                        now, now, android.view.MotionEvent.ACTION_DOWN, -10.0f, -10.0f, 0
                    );
                    android.view.MotionEvent move = android.view.MotionEvent.obtain(
                        now, now + 5, android.view.MotionEvent.ACTION_MOVE, -10.0f, -10.0f, 0
                    );
                    android.view.MotionEvent up = android.view.MotionEvent.obtain(
                        now, now + 10, android.view.MotionEvent.ACTION_UP, -10.0f, -10.0f, 0
                    );

                    getWindow().getDecorView().dispatchTouchEvent(down);
                    getWindow().getDecorView().dispatchTouchEvent(move);
                    getWindow().getDecorView().dispatchTouchEvent(up);

                    down.recycle();
                    move.recycle();
                    up.recycle();
                }
            } catch (Exception e) {}
            // Run every 1000ms to keep the system Touch Boost timer refreshed
            touchBoostHandler.postDelayed(this, 1000);
        }
    };

    @Override
    public boolean dispatchTouchEvent(android.view.MotionEvent ev) {
        switch (ev.getActionMasked()) {
            case android.view.MotionEvent.ACTION_DOWN:
            case android.view.MotionEvent.ACTION_POINTER_DOWN:
            case android.view.MotionEvent.ACTION_MOVE:
                isUserTouching = true;
                touchBoostHandler.removeCallbacks(resumeTouchBoostRunnable);
                break;
            case android.view.MotionEvent.ACTION_UP:
            case android.view.MotionEvent.ACTION_POINTER_UP:
            case android.view.MotionEvent.ACTION_CANCEL:
                touchBoostHandler.removeCallbacks(resumeTouchBoostRunnable);
                touchBoostHandler.postDelayed(resumeTouchBoostRunnable, 500);
                break;
        }
        return super.dispatchTouchEvent(ev);
    }

    @Override
    public void onResume() {
        super.onResume();
        touchBoostHandler.postDelayed(touchBoostRunnable, 1000);
    }

    @Override
    public void onPause() {
        super.onPause();
        touchBoostHandler.removeCallbacks(touchBoostRunnable);
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

