package com.cinemovie.app;

import android.content.Intent;
import android.net.Uri;
import androidx.mediarouter.app.MediaRouteChooserDialog;
import androidx.mediarouter.media.MediaRouteSelector;
import androidx.mediarouter.media.MediaControlIntent;
import com.google.android.gms.cast.CastMediaControlIntent;
import com.google.android.gms.cast.MediaStatus;
import com.google.android.gms.cast.framework.CastContext;
import com.google.android.gms.cast.framework.CastSession;
import com.google.android.gms.cast.framework.SessionManagerListener;
import com.google.android.gms.cast.framework.media.RemoteMediaClient;
import com.google.android.gms.cast.MediaInfo;
import com.google.android.gms.cast.MediaMetadata;
import com.google.android.gms.cast.MediaLoadRequestData;
import com.google.android.gms.cast.MediaTrack;
import com.google.android.gms.common.images.WebImage;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.BufferedOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.IOException;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.List;
import java.util.Map;
import java.net.NetworkInterface;
import java.util.Collections;
import java.net.InetAddress;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.GZIPInputStream;

@CapacitorPlugin(name = "SystemCast")
public class SystemCastPlugin extends Plugin {

    private String mVideoUrl = null;
    private String mLastLoadedVideoUrl = null;
    private String mTitle = null;
    private String mSubtitle = null;
    private String mPosterUrl = null;
    private long mCurrentTime = 0;
    private com.getcapacitor.JSArray mSubtitleTracks = null;
    private int mActiveTrackId = -1;

    private ServerSocket mServerSocket = null;
    private ExecutorService mExecutorService = null;
    private boolean mProxyRunning = false;
    private int mProxyPort = 8085;

    private final android.os.Handler progressHandler = new android.os.Handler(android.os.Looper.getMainLooper());
    private final Runnable progressRunnable = new Runnable() {
        @Override
        public void run() {
            try {
                CastSession session = CastContext.getSharedInstance(getContext()).getSessionManager().getCurrentCastSession();
                if (session != null && session.isConnected() && session.getRemoteMediaClient() != null) {
                    RemoteMediaClient client = session.getRemoteMediaClient();
                    
                    int playerState = client.getPlayerState();
                    if (playerState == MediaStatus.PLAYER_STATE_UNKNOWN || playerState == MediaStatus.PLAYER_STATE_IDLE) {
                        progressHandler.postDelayed(this, 1000);
                        return;
                    }
                    
                    long positionMs = client.getApproximateStreamPosition();
                    long durationMs = client.getStreamDuration();
                    boolean isPaused = client.isPaused();
                    boolean isBuffering = playerState == MediaStatus.PLAYER_STATE_BUFFERING;
                    
                    if (positionMs >= 0) {
                        JSObject progress = new JSObject();
                        progress.put("currentTime", positionMs / 1000.0);
                        progress.put("duration", durationMs / 1000.0);
                        progress.put("paused", isPaused);
                        progress.put("buffering", isBuffering);
                        
                        notifyListeners("onCastProgressChanged", progress);
                    }
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
            progressHandler.postDelayed(this, 1000);
        }
    };

    private void startProgressUpdates() {
        progressHandler.removeCallbacks(progressRunnable);
        progressHandler.post(progressRunnable);
    }

    private void stopProgressUpdates() {
        progressHandler.removeCallbacks(progressRunnable);
    }

    private void startCastService() {
        try {
            Intent serviceIntent = new Intent(getContext(), CastForegroundService.class);
            serviceIntent.putExtra("title", mTitle != null ? mTitle : "CineMovie TV Cast");
            serviceIntent.putExtra("subtitle", mSubtitle != null ? mSubtitle : "Casting to TV");
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                getContext().startForegroundService(serviceIntent);
            } else {
                getContext().startService(serviceIntent);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void stopCastService() {
        try {
            Intent serviceIntent = new Intent(getContext(), CastForegroundService.class);
            getContext().stopService(serviceIntent);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private final SessionManagerListener<CastSession> sessionManagerListener = new SessionManagerListener<CastSession>() {
        @Override
        public void onSessionStarting(CastSession session) {}

        @Override
        public void onSessionStarted(CastSession session, String sessionId) {
            loadMediaOnSession(session);
            startProgressUpdates();
            String deviceName = "";
            if (session.getCastDevice() != null) {
                deviceName = session.getCastDevice().getFriendlyName();
            }
            sendCastStatus(true, deviceName);
            startCastService();
        }

        @Override
        public void onSessionStartFailed(CastSession session, int error) {
            stopProgressUpdates();
            sendCastStatus(false, "");
            stopCastService();
        }

        @Override
        public void onSessionEnding(CastSession session) {}

        @Override
        public void onSessionEnded(CastSession session, int error) {
            mLastLoadedVideoUrl = null;
            stopProgressUpdates();
            sendCastStatus(false, "");
            stopCastService();
        }

        @Override
        public void onSessionSuspended(CastSession session, int reason) {}

        @Override
        public void onSessionResuming(CastSession session, String sessionId) {}

        @Override
        public void onSessionResumed(CastSession session, boolean wasSuspended) {
            loadMediaOnSession(session);
            startProgressUpdates();
            String deviceName = "";
            if (session.getCastDevice() != null) {
                deviceName = session.getCastDevice().getFriendlyName();
            }
            sendCastStatus(true, deviceName);
            startCastService();
        }

        @Override
        public void onSessionResumeFailed(CastSession session, int error) {
            stopProgressUpdates();
            sendCastStatus(false, "");
            stopCastService();
        }
    };

    @Override
    public void load() {
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    CastContext castContext = CastContext.getSharedInstance(getContext());
                    castContext.getSessionManager().addSessionManagerListener(sessionManagerListener, CastSession.class);
                } catch (Exception e) {
                    e.printStackTrace();
                }
                startLocalProxyServer();
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    CastContext castContext = CastContext.getSharedInstance(getContext());
                    castContext.getSessionManager().removeSessionManagerListener(sessionManagerListener, CastSession.class);
                    stopProgressUpdates();
                } catch (Exception e) {
                    e.printStackTrace();
                }
                stopLocalProxyServer();
            }
        });
    }

    @PluginMethod
    public void launchCastSettings(final PluginCall call) {
        mVideoUrl = call.getString("videoUrl", null);
        mTitle = call.getString("title", "CineMovie Video");
        mSubtitle = call.getString("subtitle", "");
        mPosterUrl = call.getString("posterUrl", "");
        mCurrentTime = (long) (call.getDouble("currentTime", 0.0) * 1000.0);
        mSubtitleTracks = call.getArray("subtitleTracks", null);
        mActiveTrackId = call.getInt("activeTrackId", -1);

        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    CastSession session = CastContext.getSharedInstance(getContext()).getSessionManager().getCurrentCastSession();
                    if (session != null && session.isConnected()) {
                        RemoteMediaClient client = session.getRemoteMediaClient();
                        boolean isSameVideo = false;
                        if (mLastLoadedVideoUrl != null && isSameVideoUrl(mLastLoadedVideoUrl, mVideoUrl)) {
                            isSameVideo = true;
                        } else if (client != null && client.getMediaStatus() != null && client.getMediaStatus().getMediaInfo() != null) {
                            String currentUrl = client.getMediaStatus().getMediaInfo().getContentId();
                            if (isSameVideoUrl(currentUrl, mVideoUrl)) {
                                isSameVideo = true;
                            }
                        }

                        // If it is the same video but the subtitle tracks / delay parameters changed,
                        // we force a reload to apply the new tracks, but we use the TV's current position
                        // as the source of truth so the playhead never jumps back to the phone's progress.
                        boolean forceReload = false;
                        if (isSameVideo && client != null && client.getMediaStatus() != null && client.getMediaStatus().getMediaInfo() != null) {
                            List<MediaTrack> currentTracks = client.getMediaStatus().getMediaInfo().getMediaTracks();
                            if (areTracksDifferent(currentTracks, mSubtitleTracks)) {
                                forceReload = true;
                            }
                        }

                        if (!isSameVideo || forceReload) {
                            if (isSameVideo && client != null && client.getMediaStatus() != null) {
                                long tvPosition = client.getApproximateStreamPosition();
                                if (tvPosition > 0) {
                                    mCurrentTime = tvPosition;
                                }
                            }
                            loadMediaOnSession(session);
                        } else {
                            if (client != null) {
                                if (mActiveTrackId != -1) {
                                    client.setActiveMediaTracks(new long[]{mActiveTrackId});
                                } else {
                                    client.setActiveMediaTracks(new long[]{}); // Clear active tracks / disable subtitles
                                }
                            }
                        }
                        call.resolve();
                        return;
                    }

                    // Create selector for Cast and general media devices
                    MediaRouteSelector selector = new MediaRouteSelector.Builder()
                            .addControlCategory(CastMediaControlIntent.categoryForCast("CC1AD845"))
                            .addControlCategory(MediaControlIntent.CATEGORY_LIVE_AUDIO)
                            .addControlCategory(MediaControlIntent.CATEGORY_LIVE_VIDEO)
                            .build();

                    // Create and show the standard in-app MediaRouteChooserDialog
                    MediaRouteChooserDialog dialog = new MediaRouteChooserDialog(getActivity());
                    dialog.setRouteSelector(selector);
                    dialog.show();
                    call.resolve();
                } catch (Exception e) {
                    // If dialog display fails, fall back to showing the standard system settings
                    try {
                        Intent intent = new Intent("android.settings.CAST_SETTINGS");
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        getActivity().startActivity(intent);
                        call.resolve();
                    } catch (Exception ex) {
                        call.reject("Could not open cast options: " + ex.getMessage());
                    }
                }
            }
        });
    }

    @PluginMethod
    public void disconnectCast(final PluginCall call) {
        mLastLoadedVideoUrl = null;
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    CastContext.getSharedInstance(getContext()).getSessionManager().endCurrentSession(true);
                    stopProgressUpdates();
                    call.resolve();
                } catch (Exception e) {
                    call.reject("Failed to disconnect: " + e.getMessage());
                }
            }
        });
    }

    @PluginMethod
    public void play(final PluginCall call) {
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    CastSession session = CastContext.getSharedInstance(getContext()).getSessionManager().getCurrentCastSession();
                    if (session != null && session.getRemoteMediaClient() != null) {
                        session.getRemoteMediaClient().play();
                    }
                    call.resolve();
                } catch (Exception e) {
                    call.reject(e.getMessage());
                }
            }
        });
    }

    @PluginMethod
    public void pause(final PluginCall call) {
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    CastSession session = CastContext.getSharedInstance(getContext()).getSessionManager().getCurrentCastSession();
                    if (session != null && session.getRemoteMediaClient() != null) {
                        session.getRemoteMediaClient().pause();
                    }
                    call.resolve();
                } catch (Exception e) {
                    call.reject(e.getMessage());
                }
            }
        });
    }

    @PluginMethod
    public void seek(final PluginCall call) {
        final double timeSec = call.getDouble("time", 0.0);
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    CastSession session = CastContext.getSharedInstance(getContext()).getSessionManager().getCurrentCastSession();
                    if (session != null && session.getRemoteMediaClient() != null) {
                        session.getRemoteMediaClient().seek((long) (timeSec * 1000.0));
                    }
                    call.resolve();
                } catch (Exception e) {
                    call.reject(e.getMessage());
                }
            }
        });
    }

    private void startLocalProxyServer() {
        if (mProxyRunning) return;
        mProxyRunning = true;
        mExecutorService = Executors.newCachedThreadPool();
        mExecutorService.submit(new Runnable() {
            @Override
            public void run() {
                try {
                    mServerSocket = new ServerSocket(0); // Bind to random free port
                    mProxyPort = mServerSocket.getLocalPort();
                    while (mProxyRunning) {
                        final Socket clientSocket = mServerSocket.accept();
                        mExecutorService.submit(new Runnable() {
                            @Override
                            public void run() {
                                handleSocketClient(clientSocket);
                            }
                        });
                    }
                } catch (Exception e) {
                    // Closed
                }
            }
        });
    }

    private void stopLocalProxyServer() {
        mProxyRunning = false;
        try {
            if (mServerSocket != null) {
                mServerSocket.close();
                mServerSocket = null;
            }
        } catch (Exception ignored) {}
        if (mExecutorService != null) {
            mExecutorService.shutdown();
            mExecutorService = null;
        }
    }

    private void handleSocketClient(Socket clientSocket) {
        HttpURLConnection conn = null;
        InputStream is = null;
        boolean hasError = false;
        try {
            BufferedReader reader = new BufferedReader(new InputStreamReader(clientSocket.getInputStream()));
            String firstLine = reader.readLine();
            if (firstLine == null) {
                clientSocket.close();
                return;
            }

            String[] parts = firstLine.split(" ");
            if (parts.length < 2) {
                sendSocketError(clientSocket, 400, "Bad Request");
                return;
            }

            String method = parts[0];
            String path = parts[1];

            // 1. Handle CORS Preflight OPTIONS requests directly
            if (method.equalsIgnoreCase("OPTIONS")) {
                BufferedOutputStream out = new BufferedOutputStream(clientSocket.getOutputStream());
                out.write("HTTP/1.1 200 OK\r\n".getBytes("UTF-8"));
                out.write("Access-Control-Allow-Origin: *\r\n".getBytes("UTF-8"));
                out.write("Access-Control-Allow-Headers: *\r\n".getBytes("UTF-8"));
                out.write("Access-Control-Allow-Methods: GET, OPTIONS, HEAD\r\n".getBytes("UTF-8"));
                out.write("Content-Length: 0\r\n".getBytes("UTF-8"));
                out.write("\r\n".getBytes("UTF-8"));
                out.flush();
                clientSocket.close();
                return;
            }

            if (!method.equalsIgnoreCase("GET") || !path.startsWith("/proxy")) {
                sendSocketError(clientSocket, 404, "Not Found");
                return;
            }

            int queryIdx = path.indexOf("?");
            if (queryIdx < 0) {
                sendSocketError(clientSocket, 400, "Bad Request");
                return;
            }

            String query = path.substring(queryIdx + 1);
            String targetUrlStr = null;
            double delaySeconds = 0.0;
            String originReferer = null;
            String[] pairs = query.split("&");
            for (String pair : pairs) {
                int idx = pair.indexOf("=");
                if (idx > 0) {
                    String key = java.net.URLDecoder.decode(pair.substring(0, idx), "UTF-8");
                    String value = java.net.URLDecoder.decode(pair.substring(idx + 1), "UTF-8");
                    if (key.equals("url")) {
                        targetUrlStr = value;
                    } else if (key.equals("delay")) {
                        try {
                            delaySeconds = Double.parseDouble(value);
                        } catch (NumberFormatException ignored) {}
                    } else if (key.equals("origin_referer") || key.equals("referer")) {
                        originReferer = value;
                    }
                }
            }

            if (targetUrlStr == null || !targetUrlStr.startsWith("http")) {
                sendSocketError(clientSocket, 400, "Bad Request");
                return;
            }

            if (delaySeconds == 0.0 && targetUrlStr.contains("delay=")) {
                try {
                    int delayIdx = targetUrlStr.indexOf("delay=");
                    String delayVal = targetUrlStr.substring(delayIdx + 6);
                    int ampIdx = delayVal.indexOf("&");
                    if (ampIdx > 0) {
                        delayVal = delayVal.substring(0, ampIdx);
                    }
                    delaySeconds = Double.parseDouble(delayVal);
                } catch (Exception ignored) {}
            }

            if (originReferer == null) {
                if (targetUrlStr.contains("origin_referer=")) {
                    try {
                        int refIdx = targetUrlStr.indexOf("origin_referer=");
                        String refVal = targetUrlStr.substring(refIdx + 15);
                        int ampIdx = refVal.indexOf("&");
                        if (ampIdx > 0) {
                            refVal = refVal.substring(0, ampIdx);
                        }
                        originReferer = java.net.URLDecoder.decode(refVal, "UTF-8");
                    } catch (Exception ignored) {}
                } else if (targetUrlStr.contains("referer=")) {
                    try {
                        int refIdx = targetUrlStr.indexOf("referer=");
                        String refVal = targetUrlStr.substring(refIdx + 8);
                        int ampIdx = refVal.indexOf("&");
                        if (ampIdx > 0) {
                            refVal = refVal.substring(0, ampIdx);
                        }
                        originReferer = java.net.URLDecoder.decode(refVal, "UTF-8");
                    } catch (Exception ignored) {}
                }
            }

            String rangeHeader = null;
            String cookieHeader = null;
            String acceptHeader = null;
            String acceptLanguageHeader = null;
            String userAgentHeader = null;
            String line;
            while ((line = reader.readLine()) != null && !line.trim().isEmpty()) {
                String lower = line.toLowerCase();
                if (lower.startsWith("range:")) {
                    rangeHeader = line.substring(6).trim();
                } else if (lower.startsWith("cookie:")) {
                    cookieHeader = line.substring(7).trim();
                } else if (lower.startsWith("accept:")) {
                    acceptHeader = line.substring(7).trim();
                } else if (lower.startsWith("accept-language:")) {
                    acceptLanguageHeader = line.substring(16).trim();
                } else if (lower.startsWith("user-agent:")) {
                    userAgentHeader = line.substring(11).trim();
                }
            }

            // 2. Loop through HTTP redirects manually to forward headers (Referer, Range, Cookies, User-Agent)
            URL targetUrl = new URL(targetUrlStr);
            int responseCode = -1;
            int redirects = 0;
            while (redirects < 10) {
                conn = (HttpURLConnection) targetUrl.openConnection();
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(30000);
                conn.setUseCaches(false);
                conn.setInstanceFollowRedirects(false); // Follow manually

                String refererToUse = (originReferer != null && !originReferer.isEmpty()) ? originReferer : "https://vidlink.pro/";
                String originToUse = "https://vidlink.pro";
                if (originReferer != null && !originReferer.isEmpty()) {
                    try {
                        URL refUrl = new URL(originReferer);
                        String portStr = refUrl.getPort() != -1 ? ":" + refUrl.getPort() : "";
                        originToUse = refUrl.getProtocol() + "://" + refUrl.getHost() + portStr;
                    } catch (Exception e) {
                        originToUse = originReferer;
                    }
                }

                conn.setRequestProperty("Referer", refererToUse);
                conn.setRequestProperty("Origin", originToUse);
                
                // Forward User-Agent or use high-quality browser fallback to satisfy CDN bot filters
                String uaToUse = (userAgentHeader != null && !userAgentHeader.isEmpty()) ? userAgentHeader 
                        : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
                conn.setRequestProperty("User-Agent", uaToUse);

                if (rangeHeader != null) {
                    conn.setRequestProperty("Range", rangeHeader);
                }
                if (cookieHeader != null) {
                    conn.setRequestProperty("Cookie", cookieHeader);
                }
                if (acceptHeader != null) {
                    conn.setRequestProperty("Accept", acceptHeader);
                }
                if (acceptLanguageHeader != null) {
                    conn.setRequestProperty("Accept-Language", acceptLanguageHeader);
                }

                conn.connect();
                responseCode = conn.getResponseCode();

                if (responseCode == 301 || responseCode == 302 || responseCode == 303 || responseCode == 307 || responseCode == 308) {
                    List<String> setCookies = conn.getHeaderFields().get("Set-Cookie");
                    cookieHeader = mergeCookies(cookieHeader, setCookies);

                    String location = conn.getHeaderField("Location");
                    if (location != null) {
                        targetUrl = new URL(targetUrl, location);
                        conn.disconnect();
                        redirects++;
                        continue;
                    }
                }
                break;
            }

            BufferedOutputStream out = new BufferedOutputStream(clientSocket.getOutputStream());
            
            out.write(("HTTP/1.1 " + responseCode + " " + conn.getResponseMessage() + "\r\n").getBytes("UTF-8"));
            out.write("Access-Control-Allow-Origin: *\r\n".getBytes("UTF-8"));
            out.write("Access-Control-Allow-Headers: *\r\n".getBytes("UTF-8"));
            out.write("Access-Control-Allow-Methods: GET, OPTIONS, HEAD\r\n".getBytes("UTF-8"));
            out.write("Connection: close\r\n".getBytes("UTF-8"));

            boolean isManifest = targetUrlStr.contains(".m3u8") || 
                                 targetUrl.toString().contains(".m3u8") ||
                                 (conn.getContentType() != null && 
                                  (conn.getContentType().contains("mpegurl") || conn.getContentType().contains("mpegURL")));
            boolean isSubtitles = targetUrlStr.contains(".vtt") || 
                                  targetUrl.toString().contains(".vtt") ||
                                  (conn.getContentType() != null && 
                                   conn.getContentType().contains("text/vtt"));

            String contentEncoding = conn.getContentEncoding();
            boolean isGzip = "gzip".equalsIgnoreCase(contentEncoding);

            out.write("Cache-Control: no-cache, no-store, must-revalidate, private\r\n".getBytes("UTF-8"));
            out.write("Pragma: no-cache\r\n".getBytes("UTF-8"));
            out.write("Expires: 0\r\n".getBytes("UTF-8"));

            for (Map.Entry<String, List<String>> header : conn.getHeaderFields().entrySet()) {
                String name = header.getKey();
                if (name != null && !name.equalsIgnoreCase("Access-Control-Allow-Origin")) {
                    // Exclude Connection, Transfer-Encoding and Content-Encoding for all responses
                    if (name.equalsIgnoreCase("Connection") || 
                        name.equalsIgnoreCase("Transfer-Encoding") || 
                        name.equalsIgnoreCase("Content-Encoding")) {
                        continue;
                    }
                    if (name.equalsIgnoreCase("Cache-Control") || 
                        name.equalsIgnoreCase("Pragma") || 
                        name.equalsIgnoreCase("Expires")) {
                        continue;
                    }
                    if (name.equalsIgnoreCase("Content-Length")) {
                        continue; // Custom Content-Length is sent explicitly downstream
                    }
                    out.write((name + ": " + header.getValue().get(0) + "\r\n").getBytes("UTF-8"));
                }
            }

            InputStream rawIs = (responseCode >= 400) ? conn.getErrorStream() : conn.getInputStream();
            if (rawIs != null && isGzip) {
                is = new GZIPInputStream(rawIs);
            } else {
                is = rawIs;
            }

            long remoteContentLength = conn.getContentLengthLong();
            boolean shouldBufferInMemory = isManifest || isSubtitles || 
                                           targetUrlStr.contains(".ts") || 
                                           targetUrlStr.contains(".key") ||
                                           targetUrlStr.contains(".vtt") ||
                                           (remoteContentLength > 0 && remoteContentLength < 15 * 1024 * 1024);

            if (isManifest && is != null) {
                String phoneIP = getLocalIPAddress();
                String proxyBase = "http://" + phoneIP + ":" + mProxyPort + "/proxy?url=";
                String refererSuffix = "";
                if (originReferer != null && !originReferer.isEmpty()) {
                    refererSuffix = "&origin_referer=" + java.net.URLEncoder.encode(originReferer, "UTF-8");
                }
                
                java.io.BufferedReader manifestReader = new java.io.BufferedReader(new java.io.InputStreamReader(is));
                StringBuilder rewrittenManifest = new StringBuilder();
                while ((line = manifestReader.readLine()) != null) {
                    if (line.startsWith("http")) {
                        String resolvedUrl = resolveRelativeUrl(targetUrl.toString(), line);
                        rewrittenManifest.append(proxyBase).append(java.net.URLEncoder.encode(resolvedUrl, "UTF-8")).append(refererSuffix).append("\n");
                    } else if (!line.startsWith("#") && !line.trim().isEmpty()) {
                        String absoluteSegmentUrl = resolveRelativeUrl(targetUrl.toString(), line);
                        rewrittenManifest.append(proxyBase).append(java.net.URLEncoder.encode(absoluteSegmentUrl, "UTF-8")).append(refererSuffix).append("\n");
                    } else {
                        if (line.startsWith("#") && line.contains("URI=\"")) {
                            try {
                                int uriIdx = line.indexOf("URI=\"");
                                if (uriIdx >= 0) {
                                    int endIdx = line.indexOf("\"", uriIdx + 5);
                                    if (endIdx > 0) {
                                        String uriVal = line.substring(uriIdx + 5, endIdx);
                                        if (!uriVal.startsWith("blob:") && !uriVal.startsWith("data:")) {
                                            String absoluteUrl = resolveRelativeUrl(targetUrl.toString(), uriVal);
                                            String proxiedUrl = proxyBase + java.net.URLEncoder.encode(absoluteUrl, "UTF-8") + refererSuffix;
                                            line = line.substring(0, uriIdx + 5) + proxiedUrl + line.substring(endIdx);
                                        }
                                    }
                                }
                            } catch (Exception ignored) {}
                        }
                        rewrittenManifest.append(line).append("\n");
                    }
                }
                
                String manifestContent = rewrittenManifest.toString();
                if (manifestContent.contains("#EXT-X-STREAM-INF:")) {
                    manifestContent = filterMasterManifest(manifestContent, targetUrl.toString(), proxyBase, refererSuffix);
                }
                
                byte[] responseBytes = manifestContent.getBytes("UTF-8");
                out.write(("Content-Length: " + responseBytes.length + "\r\n\r\n").getBytes("UTF-8"));
                out.write(responseBytes);
            } else if (isSubtitles && delaySeconds != 0.0 && is != null) {
                java.io.BufferedReader vttReader = new java.io.BufferedReader(new java.io.InputStreamReader(is, "UTF-8"));
                StringBuilder vttContent = new StringBuilder();
                while ((line = vttReader.readLine()) != null) {
                    vttContent.append(line).append("\n");
                }
                String shifted = shiftVttTimestamps(vttContent.toString(), delaySeconds);
                byte[] responseBytes = shifted.getBytes("UTF-8");
                out.write(("Content-Length: " + responseBytes.length + "\r\n\r\n").getBytes("UTF-8"));
                out.write(responseBytes);
            } else if (is != null) {
                if (shouldBufferInMemory) {
                    java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
                    byte[] buf = new byte[65536];
                    int r;
                    while ((r = is.read(buf)) != -1) {
                        bos.write(buf, 0, r);
                    }
                    byte[] segmentData = bos.toByteArray();
                    out.write(("Content-Length: " + segmentData.length + "\r\n\r\n").getBytes("UTF-8"));
                    out.write(segmentData);
                } else {
                    if (remoteContentLength > 0 && !isGzip) {
                        out.write(("Content-Length: " + remoteContentLength + "\r\n\r\n").getBytes("UTF-8"));
                    } else {
                        out.write("\r\n".getBytes("UTF-8"));
                    }
                    byte[] buffer = new byte[131072];
                    int bytesRead;
                    while ((bytesRead = is.read(buffer)) != -1) {
                        out.write(buffer, 0, bytesRead);
                    }
                }
            }
            out.flush();
            clientSocket.close();
        } catch (Exception e) {
            e.printStackTrace();
            hasError = true;
            try { clientSocket.close(); } catch (Exception ignored) {}
        } finally {
            if (is != null) try { is.close(); } catch (Exception ignored) {}
            if (conn != null) {
                if (hasError) {
                    conn.disconnect(); // Disconnect on socket or transfer error to discard bad state
                }
            }
        }
    }

    private void sendSocketError(Socket socket, int code, String msg) {
        try {
            BufferedOutputStream out = new BufferedOutputStream(socket.getOutputStream());
            out.write(("HTTP/1.1 " + code + " " + msg + "\r\n\r\n").getBytes("UTF-8"));
            out.flush();
            socket.close();
        } catch (Exception ignored) {}
    }

    private String resolveRelativeUrl(String baseUrl, String relativePath) {
        try {
            String cleanBase = extractProxyTargetUrl(baseUrl);
            URL base = new URL(cleanBase);
            String baseQuery = base.getQuery();
            
            String nestedRelativeTarget = extractProxyTargetUrl(relativePath);
            if (nestedRelativeTarget != null && !nestedRelativeTarget.equals(relativePath)) {
                URL nestedAbsolute = new URL(base, nestedRelativeTarget);
                String resolvedNested = nestedAbsolute.toString();
                
                if (baseQuery != null && !baseQuery.isEmpty()) {
                    int qIdx = resolvedNested.indexOf('?');
                    if (qIdx < 0) {
                        resolvedNested = resolvedNested + "?" + baseQuery;
                    } else {
                        String resolvedQuery = resolvedNested.substring(qIdx + 1);
                        String mergedQuery = mergeQueryStrings(baseQuery, resolvedQuery);
                        resolvedNested = resolvedNested.substring(0, qIdx) + "?" + mergedQuery;
                    }
                }
                
                String proxyPrefix = relativePath;
                if (relativePath.contains("/proxy?url=")) {
                    proxyPrefix = relativePath.substring(0, relativePath.indexOf("/proxy?url=") + 11);
                } else if (relativePath.contains("/local-proxy?url=")) {
                    proxyPrefix = relativePath.substring(0, relativePath.indexOf("/local-proxy?url=") + 17);
                }
                
                String extraParams = "";
                int qIdx = relativePath.indexOf('?');
                if (qIdx >= 0) {
                    String relativeQuery = relativePath.substring(qIdx + 1);
                    StringBuilder sb = new StringBuilder();
                    for (String pair : relativeQuery.split("&")) {
                        int eq = pair.indexOf('=');
                        if (eq > 0) {
                            String key = java.net.URLDecoder.decode(pair.substring(0, eq), "UTF-8");
                            if (!key.equals("url")) {
                                if (sb.length() > 0) sb.append('&');
                                sb.append(pair);
                            }
                        }
                    }
                    if (sb.length() > 0) {
                        extraParams = "&" + sb.toString();
                    }
                }
                
                return proxyPrefix + java.net.URLEncoder.encode(resolvedNested, "UTF-8") + extraParams;
            } else {
                URL absolute = new URL(base, relativePath);
                String resolved = absolute.toString();
                if (baseQuery != null && !baseQuery.isEmpty()) {
                    int qIdx = resolved.indexOf('?');
                    if (qIdx < 0) {
                        resolved = resolved + "?" + baseQuery;
                    } else {
                        String resolvedQuery = resolved.substring(qIdx + 1);
                        String mergedQuery = mergeQueryStrings(baseQuery, resolvedQuery);
                        resolved = resolved.substring(0, qIdx) + "?" + mergedQuery;
                    }
                }
                return resolved;
            }
        } catch (Exception e) {
            return relativePath;
        }
    }

    private String mergeQueryStrings(String baseQuery, String relativeQuery) {
        if (baseQuery == null || baseQuery.isEmpty()) return relativeQuery;
        if (relativeQuery == null || relativeQuery.isEmpty()) return baseQuery;
        
        java.util.Map<String, String> params = new java.util.LinkedHashMap<>();
        for (String param : baseQuery.split("&")) {
            int eq = param.indexOf('=');
            if (eq > 0) {
                params.put(param.substring(0, eq), param.substring(eq + 1));
            } else if (!param.isEmpty()) {
                params.put(param, "");
            }
        }
        for (String param : relativeQuery.split("&")) {
            int eq = param.indexOf('=');
            if (eq > 0) {
                params.put(param.substring(0, eq), param.substring(eq + 1));
            } else if (!param.isEmpty()) {
                params.put(param, "");
            }
        }
        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, String> entry : params.entrySet()) {
            if (sb.length() > 0) sb.append('&');
            sb.append(entry.getKey());
            if (!entry.getValue().isEmpty()) {
                sb.append('=').append(entry.getValue());
            }
        }
        return sb.toString();
    }

    private String getLocalIPAddress() {
        try {
            List<NetworkInterface> interfaces = Collections.list(NetworkInterface.getNetworkInterfaces());
            // Prioritize active Wi-Fi interface (wlan)
            for (NetworkInterface intf : interfaces) {
                if (intf.getName().toLowerCase().contains("wlan")) {
                    List<InetAddress> addrs = Collections.list(intf.getInetAddresses());
                    for (InetAddress addr : addrs) {
                        if (!addr.isLoopbackAddress()) {
                            String sAddr = addr.getHostAddress();
                            if (sAddr.indexOf(':') < 0) { // IPv4
                                return sAddr;
                            }
                        }
                    }
                }
            }
            // Fallback to other active interfaces
            for (NetworkInterface intf : interfaces) {
                List<InetAddress> addrs = Collections.list(intf.getInetAddresses());
                for (InetAddress addr : addrs) {
                    if (!addr.isLoopbackAddress()) {
                        String sAddr = addr.getHostAddress();
                        if (sAddr.indexOf(':') < 0) {
                            return sAddr;
                        }
                    }
                }
            }
        } catch (Exception ex) {
            ex.printStackTrace();
        }
        return "127.0.0.1";
    }

    private void loadMediaOnSession(CastSession session) {
        if (session == null || mVideoUrl == null) return;
        mLastLoadedVideoUrl = mVideoUrl;
        
        try {
            String targetCastUrl = mVideoUrl;
            if (mVideoUrl.startsWith("http")) {
                String phoneIP = getLocalIPAddress();
                targetCastUrl = "http://" + phoneIP + ":" + mProxyPort + "/proxy?url=" + java.net.URLEncoder.encode(mVideoUrl, "UTF-8");
            }

            MediaMetadata movieMetadata = new MediaMetadata(MediaMetadata.MEDIA_TYPE_MOVIE);
            movieMetadata.putString(MediaMetadata.KEY_TITLE, mTitle != null ? mTitle : "CineMovie");
            movieMetadata.putString(MediaMetadata.KEY_SUBTITLE, mSubtitle != null ? mSubtitle : "");
            if (mPosterUrl != null && !mPosterUrl.isEmpty()) {
                movieMetadata.addImage(new WebImage(Uri.parse(mPosterUrl)));
            }
            
            String contentType = targetCastUrl.contains(".m3u8") ? "application/x-mpegURL" : "video/mp4";
            
            MediaInfo.Builder mediaInfoBuilder = new MediaInfo.Builder(targetCastUrl)
                    .setStreamType(MediaInfo.STREAM_TYPE_BUFFERED)
                    .setContentType(contentType)
                    .setMetadata(movieMetadata);

            if (mSubtitleTracks != null && mSubtitleTracks.length() > 0) {
                java.util.List<MediaTrack> tracksList = new java.util.ArrayList<>();
                for (int i = 0; i < mSubtitleTracks.length(); i++) {
                    try {
                        com.getcapacitor.JSObject trackObj = com.getcapacitor.JSObject.fromJSONObject(mSubtitleTracks.getJSONObject(i));
                        int id = trackObj.getInteger("id", i + 1);
                        String src = trackObj.getString("src");
                        String label = trackObj.getString("label", "Subtitles");
                        String language = trackObj.getString("language", "en");

                        if (src != null && !src.isEmpty() && !src.startsWith("blob:")) {
                            String targetSrc = src;
                            if (src.startsWith("http") && !src.contains("/proxy?url=")) {
                                String phoneIP = getLocalIPAddress();
                                targetSrc = "http://" + phoneIP + ":" + mProxyPort + "/proxy?url=" + java.net.URLEncoder.encode(src, "UTF-8");
                            }
                            MediaTrack castTrack = new MediaTrack.Builder(id, MediaTrack.TYPE_TEXT)
                                    .setName(label)
                                    .setContentId(targetSrc)
                                    .setContentType("text/vtt")
                                    .setSubtype(MediaTrack.SUBTYPE_SUBTITLES)
                                    .setLanguage(language)
                                    .build();
                            tracksList.add(castTrack);
                        }
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                }
                if (!tracksList.isEmpty()) {
                    mediaInfoBuilder.setMediaTracks(tracksList);
                }
            }

            MediaInfo mediaInfo = mediaInfoBuilder.build();
            
            MediaLoadRequestData.Builder loadRequestBuilder = new MediaLoadRequestData.Builder()
                    .setMediaInfo(mediaInfo)
                    .setAutoplay(false)
                    .setCurrentTime(mCurrentTime);

            if (mActiveTrackId != -1) {
                loadRequestBuilder.setActiveTrackIds(new long[]{mActiveTrackId});
            }

            MediaLoadRequestData loadRequestData = loadRequestBuilder.build();
            
            session.getRemoteMediaClient().load(loadRequestData);

            // Add a short delay (1.5 seconds) before playing to stabilize TV buffer and subtitles
            new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(new Runnable() {
                @Override
                public void run() {
                    try {
                        CastSession currentSession = CastContext.getSharedInstance(getContext()).getSessionManager().getCurrentCastSession();
                        if (currentSession != null && currentSession.isConnected() && currentSession.getRemoteMediaClient() != null) {
                            currentSession.getRemoteMediaClient().play();
                        }
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                }
            }, 1500);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private String shiftVttTimestamps(String vttContent, double delaySeconds) {
        if (delaySeconds == 0.0) return vttContent;
        
        String[] lines = vttContent.split("\n", -1);
        java.util.regex.Pattern pattern = java.util.regex.Pattern.compile("(\\d{1,2}:)?(\\d{1,2}):(\\d{1,2})\\.(\\d{1,3})");
        StringBuilder sb = new StringBuilder();
        
        for (String line : lines) {
            if (line.contains("-->")) {
                java.util.regex.Matcher matcher = pattern.matcher(line);
                StringBuffer lineSb = new StringBuffer();
                while (matcher.find()) {
                    String hoursStr = matcher.group(1);
                    String minutesStr = matcher.group(2);
                    String secondsStr = matcher.group(3);
                    String millisStr = matcher.group(4);
                    
                    int hours = 0;
                    if (hoursStr != null) {
                        hours = Integer.parseInt(hoursStr.replace(":", ""));
                    }
                    int minutes = Integer.parseInt(minutesStr);
                    int seconds = Integer.parseInt(secondsStr);
                    int millis = Integer.parseInt(millisStr);
                    if (millisStr.length() == 1) {
                        millis = millis * 100;
                    } else if (millisStr.length() == 2) {
                        millis = millis * 10;
                    }
                    
                    long totalMillis = (hours * 3600L + minutes * 60L + seconds) * 1000L + millis;
                    long shiftedMillis = totalMillis + (long) (delaySeconds * 1000.0);
                    if (shiftedMillis < 0) shiftedMillis = 0;
                    
                    long sh = shiftedMillis / 3600000L;
                    long sm = (shiftedMillis % 3600000L) / 60000L;
                    long ss = (shiftedMillis % 60000L) / 1000L;
                    long sms = shiftedMillis % 1000L;
                    
                    String shiftedTime;
                    if (hoursStr != null || sh > 0) {
                        shiftedTime = String.format("%02d:%02d:%02d.%03d", sh, sm, ss, sms);
                    } else {
                        shiftedTime = String.format("%02d:%02d.%03d", sm, ss, sms);
                    }
                    matcher.appendReplacement(lineSb, java.util.regex.Matcher.quoteReplacement(shiftedTime));
                }
                matcher.appendTail(lineSb);
                sb.append(lineSb.toString()).append("\n");
            } else {
                sb.append(line).append("\n");
            }
        }
        
        if (!vttContent.endsWith("\n") && sb.length() > 0) {
            sb.setLength(sb.length() - 1);
        }
        
        return sb.toString();
    }

    private void sendCastStatus(boolean connected, String deviceName) {
        JSObject ret = new JSObject();
        ret.put("connected", connected);
        ret.put("deviceName", deviceName);
        notifyListeners("onCastStatusChanged", ret);
    }

    private String extractProxyTargetUrl(String url) {
        if (url == null) return null;
        try {
            String decoded = url;
            boolean found = true;
            while (found) {
                found = false;
                if (decoded.contains("/proxy?url=")) {
                    int start = decoded.indexOf("/proxy?url=") + 11;
                    String rest = decoded.substring(start);
                    int end = rest.indexOf("&");
                    String encodedTarget = (end > 0) ? rest.substring(0, end) : rest;
                    decoded = java.net.URLDecoder.decode(encodedTarget, "UTF-8");
                    found = true;
                } else if (decoded.contains("/local-proxy?url=")) {
                    int start = decoded.indexOf("/local-proxy?url=") + 17;
                    String rest = decoded.substring(start);
                    int end = rest.indexOf("&");
                    String encodedTarget = (end > 0) ? rest.substring(0, end) : rest;
                    decoded = java.net.URLDecoder.decode(encodedTarget, "UTF-8");
                    found = true;
                }
            }
            return decoded;
        } catch (Exception e) {
            e.printStackTrace();
        }
        return url;
    }

    private boolean isSameVideoUrl(String url1, String url2) {
        if (url1 == null || url2 == null) return false;
        String clean1 = extractProxyTargetUrl(url1);
        String clean2 = extractProxyTargetUrl(url2);
        if (clean1 == null || clean2 == null) return false;
        clean1 = clean1.replaceAll("[&?]delay=[^&]*", "");
        clean2 = clean2.replaceAll("[&?]delay=[^&]*", "");
        return clean1.equals(clean2);
    }

    private boolean areTracksDifferent(List<MediaTrack> currentTracks, com.getcapacitor.JSArray newTracks) {
        if (newTracks == null) return currentTracks != null && !currentTracks.isEmpty();
        if (currentTracks == null) return newTracks.length() > 0;
        
        java.util.List<MediaTrack> currentTextTracks = new java.util.ArrayList<>();
        for (MediaTrack t : currentTracks) {
            if (t.getType() == MediaTrack.TYPE_TEXT) {
                currentTextTracks.add(t);
            }
        }
        
        if (currentTextTracks.size() != newTracks.length()) return true;
        
        for (int i = 0; i < newTracks.length(); i++) {
            try {
                com.getcapacitor.JSObject trackObj = com.getcapacitor.JSObject.fromJSONObject(newTracks.getJSONObject(i));
                String newSrc = trackObj.getString("src");
                if (newSrc != null && newSrc.startsWith("http") && !newSrc.contains("/proxy?url=")) {
                    String phoneIP = getLocalIPAddress();
                    newSrc = "http://" + phoneIP + ":" + mProxyPort + "/proxy?url=" + java.net.URLEncoder.encode(newSrc, "UTF-8");
                }
                
                MediaTrack currentTrack = currentTextTracks.get(i);
                if (currentTrack.getContentId() == null || !currentTrack.getContentId().equals(newSrc)) {
                    return true;
                }
            } catch (Exception e) {
                return true;
            }
        }
        return false;
    }

    @PluginMethod
    public void setSubtitleStyle(final PluginCall call) {
        final String color = call.getString("color", "#ffffff");
        final String size = call.getString("size", "normal");
        final double opacity = call.getDouble("opacity", 0.0);
        
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    CastSession session = CastContext.getSharedInstance(getContext()).getSessionManager().getCurrentCastSession();
                    if (session != null && session.isConnected() && session.getRemoteMediaClient() != null) {
                        com.google.android.gms.cast.TextTrackStyle style = new com.google.android.gms.cast.TextTrackStyle();
                        
                        // Parse foreground color
                        try {
                            style.setForegroundColor(android.graphics.Color.parseColor(color));
                        } catch (Exception e) {
                            style.setForegroundColor(android.graphics.Color.WHITE);
                        }
                        
                        // Parse background color with opacity
                        int alpha = (int) (opacity * 255);
                        style.setBackgroundColor(android.graphics.Color.argb(alpha, 0, 0, 0));
                        
                        // Parse font scale
                        float fontScale = 1.0f;
                        if (size.equals("small")) {
                            fontScale = 0.8f;
                        } else if (size.equals("large")) {
                            fontScale = 1.3f;
                        } else if (size.equals("xlarge")) {
                            fontScale = 1.6f;
                        }
                        style.setFontScale(fontScale);
                        
                        // Apply style to the client
                        session.getRemoteMediaClient().setTextTrackStyle(style);
                    }
                    call.resolve();
                } catch (Exception e) {
                    call.reject(e.getMessage());
                }
            }
        });
    }

    private String filterMasterManifest(String manifestContent, String baseUrl, String proxyBase, String refererSuffix) {
        try {
            String[] lines = manifestContent.split("\n");
            java.util.List<HlsVariant> variants = new java.util.ArrayList<>();
            
            String currentStreamInf = null;
            for (String line : lines) {
                String trimmed = line.trim();
                if (trimmed.startsWith("#EXT-X-STREAM-INF:")) {
                    currentStreamInf = trimmed;
                } else if (currentStreamInf != null && !trimmed.startsWith("#") && !trimmed.isEmpty()) {
                    variants.add(new HlsVariant(currentStreamInf, trimmed));
                    currentStreamInf = null;
                }
            }
            
            if (variants.isEmpty()) {
                return manifestContent;
            }
            
            HlsVariant bestVariant = variants.get(0);
            long maxBandwidth = extractBandwidth(bestVariant.streamInf);
            for (int i = 1; i < variants.size(); i++) {
                HlsVariant v = variants.get(i);
                long bw = extractBandwidth(v.streamInf);
                if (bw > maxBandwidth) {
                    maxBandwidth = bw;
                    bestVariant = v;
                }
            }
            
            StringBuilder sb = new StringBuilder();
            sb.append("#EXTM3U\n");
            
            for (String line : lines) {
                String trimmed = line.trim();
                if (trimmed.startsWith("#EXT-X-VERSION") || trimmed.startsWith("#EXT-X-INDEPENDENT-SEGMENTS")) {
                    sb.append(trimmed).append("\n");
                }
            }
            
            sb.append(bestVariant.streamInf).append("\n");
            sb.append(bestVariant.url).append("\n");
            
            return sb.toString();
        } catch (Exception e) {
            e.printStackTrace();
            return manifestContent;
        }
    }
    
    private static class HlsVariant {
        String streamInf;
        String url;
        HlsVariant(String streamInf, String url) {
            this.streamInf = streamInf;
            this.url = url;
        }
    }
    
    private long extractBandwidth(String streamInf) {
        try {
            int bwIdx = streamInf.indexOf("BANDWIDTH=");
            if (bwIdx >= 0) {
                int start = bwIdx + 10;
                int end = streamInf.length();
                for (int i = start; i < streamInf.length(); i++) {
                    char c = streamInf.charAt(i);
                    if (c == ',' || c == '\r' || c == '\n') {
                        end = i;
                        break;
                    }
                }
                return Long.parseLong(streamInf.substring(start, end).trim());
            }
        } catch (Exception ignored) {}
        return 0;
    }

    private String mergeCookies(String existingCookies, List<String> newSetCookies) {
        java.util.Map<String, String> cookieMap = new java.util.LinkedHashMap<>();
        if (existingCookies != null && !existingCookies.trim().isEmpty()) {
            String[] pairs = existingCookies.split(";");
            for (String pair : pairs) {
                int eq = pair.indexOf("=");
                if (eq > 0) {
                    String name = pair.substring(0, eq).trim();
                    String value = pair.substring(eq + 1).trim();
                    cookieMap.put(name, value);
                }
            }
        }
        if (newSetCookies != null) {
            for (String setCookie : newSetCookies) {
                if (setCookie == null) continue;
                int semi = setCookie.indexOf(";");
                String data = (semi > 0) ? setCookie.substring(0, semi) : setCookie;
                int eq = data.indexOf("=");
                if (eq > 0) {
                    String name = data.substring(0, eq).trim();
                    String value = data.substring(eq + 1).trim();
                    cookieMap.put(name, value);
                }
            }
        }
        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, String> entry : cookieMap.entrySet()) {
            if (sb.length() > 0) {
                sb.append("; ");
            }
            sb.append(entry.getKey()).append("=").append(entry.getValue());
        }
        return sb.toString();
    }
}
