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

        // Create an isolated dummy View to consume simulated touch events so they don't interfere with the WebView
        try {
            dummyTouchView = new View(this);
            dummyTouchView.setLayoutParams(new android.view.ViewGroup.LayoutParams(1, 1));
            dummyTouchView.setVisibility(View.VISIBLE);
            dummyTouchView.setOnTouchListener((v, e) -> true); // Completely consume events locally
            ((android.view.ViewGroup) getWindow().getDecorView()).addView(dummyTouchView);
        } catch (Exception e) {
            android.util.Log.e("MainActivity", "Failed to add dummyTouchView: " + e.getMessage());
        }
    }

    private View dummyTouchView;
    private boolean isUserTouching = false;
    private final android.os.Handler touchBoostHandler = new android.os.Handler();
    private final Runnable resumeTouchBoostRunnable = () -> {
        isUserTouching = false;
    };

    private final Runnable touchBoostRunnable = new Runnable() {
        @Override
        public void run() {
            try {
                if (NativeStreamingEnginePlugin.isTouchBoostActive && !isUserTouching && dummyTouchView != null) {
                    long now = android.os.SystemClock.uptimeMillis();
                    android.view.MotionEvent event = android.view.MotionEvent.obtain(
                        now,
                        now,
                        android.view.MotionEvent.ACTION_MOVE,
                        0.5f,
                        0.5f,
                        0
                    );
                    dummyTouchView.dispatchTouchEvent(event);
                    event.recycle();
                }
            } catch (Exception e) {}
            touchBoostHandler.postDelayed(this, 120);
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
                // Delay resuming the fake touch loop to let the user's gesture finish completely
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

