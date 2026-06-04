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
    private String mTitle = null;
    private String mSubtitle = null;
    private String mPosterUrl = null;
    private long mCurrentTime = 0;

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
                    long positionMs = client.getApproximateStreamPosition();
                    long durationMs = client.getStreamDuration();
                    boolean isPaused = client.isPaused();
                    boolean isBuffering = client.getPlayerState() == MediaStatus.PLAYER_STATE_BUFFERING;
                    
                    JSObject progress = new JSObject();
                    progress.put("currentTime", positionMs / 1000.0);
                    progress.put("duration", durationMs / 1000.0);
                    progress.put("paused", isPaused);
                    progress.put("buffering", isBuffering);
                    
                    notifyListeners("onCastProgressChanged", progress);
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
        }

        @Override
        public void onSessionStartFailed(CastSession session, int error) {
            stopProgressUpdates();
            sendCastStatus(false, "");
        }

        @Override
        public void onSessionEnding(CastSession session) {}

        @Override
        public void onSessionEnded(CastSession session, int error) {
            stopProgressUpdates();
            sendCastStatus(false, "");
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
        }

        @Override
        public void onSessionResumeFailed(CastSession session, int error) {
            stopProgressUpdates();
            sendCastStatus(false, "");
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

        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
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
            String[] pairs = query.split("&");
            for (String pair : pairs) {
                int idx = pair.indexOf("=");
                if (idx > 0) {
                    String key = java.net.URLDecoder.decode(pair.substring(0, idx), "UTF-8");
                    String value = java.net.URLDecoder.decode(pair.substring(idx + 1), "UTF-8");
                    if (key.equals("url")) {
                        targetUrlStr = value;
                    }
                }
            }

            if (targetUrlStr == null || !targetUrlStr.startsWith("http")) {
                sendSocketError(clientSocket, 400, "Bad Request");
                return;
            }

            String rangeHeader = null;
            String line;
            while ((line = reader.readLine()) != null && !line.trim().isEmpty()) {
                if (line.toLowerCase().startsWith("range:")) {
                    rangeHeader = line.substring(6).trim();
                }
            }

            // 2. Loop through HTTP redirects manually to forward headers (Referer & Range)
            URL targetUrl = new URL(targetUrlStr);
            int responseCode = -1;
            int redirects = 0;
            while (redirects < 10) {
                conn = (HttpURLConnection) targetUrl.openConnection();
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(10000);
                conn.setReadTimeout(15000);
                conn.setInstanceFollowRedirects(false); // Follow manually

                conn.setRequestProperty("Referer", "https://vidlink.pro/");
                conn.setRequestProperty("Origin", "https://vidlink.pro");
                if (rangeHeader != null) {
                    conn.setRequestProperty("Range", rangeHeader);
                }

                conn.connect();
                responseCode = conn.getResponseCode();

                if (responseCode == 301 || responseCode == 302 || responseCode == 303 || responseCode == 307 || responseCode == 308) {
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
                                 (conn.getContentType() != null && 
                                  (conn.getContentType().contains("mpegurl") || conn.getContentType().contains("mpegURL")));

            for (Map.Entry<String, List<String>> header : conn.getHeaderFields().entrySet()) {
                String name = header.getKey();
                if (name != null && !name.equalsIgnoreCase("Access-Control-Allow-Origin")) {
                    // Exclude Connection, Transfer-Encoding and Content-Encoding for all responses
                    if (name.equalsIgnoreCase("Connection") || 
                        name.equalsIgnoreCase("Transfer-Encoding") || 
                        name.equalsIgnoreCase("Content-Encoding")) {
                        continue;
                    }
                    if (isManifest && name.equalsIgnoreCase("Content-Length")) {
                        continue; // Custom length is sent for manifests
                    }
                    out.write((name + ": " + header.getValue().get(0) + "\r\n").getBytes("UTF-8"));
                }
            }

            String contentEncoding = conn.getContentEncoding();
            InputStream rawIs = (responseCode >= 400) ? conn.getErrorStream() : conn.getInputStream();
            if (rawIs != null && "gzip".equalsIgnoreCase(contentEncoding)) {
                is = new GZIPInputStream(rawIs);
            } else {
                is = rawIs;
            }

            if (isManifest && is != null) {
                String phoneIP = getLocalIPAddress();
                String proxyBase = "http://" + phoneIP + ":" + mProxyPort + "/proxy?url=";
                
                java.io.BufferedReader manifestReader = new java.io.BufferedReader(new java.io.InputStreamReader(is));
                StringBuilder rewrittenManifest = new StringBuilder();
                while ((line = manifestReader.readLine()) != null) {
                    if (line.startsWith("http")) {
                        rewrittenManifest.append(proxyBase).append(java.net.URLEncoder.encode(line, "UTF-8")).append("\n");
                    } else if (!line.startsWith("#") && !line.trim().isEmpty()) {
                        String absoluteSegmentUrl = resolveRelativeUrl(targetUrl.toString(), line);
                        rewrittenManifest.append(proxyBase).append(java.net.URLEncoder.encode(absoluteSegmentUrl, "UTF-8")).append("\n");
                    } else {
                        rewrittenManifest.append(line).append("\n");
                    }
                }
                
                byte[] responseBytes = rewrittenManifest.toString().getBytes("UTF-8");
                out.write(("Content-Length: " + responseBytes.length + "\r\n\r\n").getBytes("UTF-8"));
                out.write(responseBytes);
            } else if (is != null) {
                out.write("\r\n".getBytes("UTF-8"));
                byte[] buffer = new byte[8192];
                int bytesRead;
                while ((bytesRead = is.read(buffer)) != -1) {
                    out.write(buffer, 0, bytesRead);
                }
            }
            out.flush();
            clientSocket.close();
        } catch (Exception e) {
            e.printStackTrace();
            try { clientSocket.close(); } catch (Exception ignored) {}
        } finally {
            if (is != null) try { is.close(); } catch (Exception ignored) {}
            if (conn != null) conn.disconnect();
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
            URL base = new URL(baseUrl);
            URL absolute = new URL(base, relativePath);
            return absolute.toString();
        } catch (Exception e) {
            return relativePath;
        }
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
            
            MediaInfo mediaInfo = new MediaInfo.Builder(targetCastUrl)
                    .setStreamType(MediaInfo.STREAM_TYPE_BUFFERED)
                    .setContentType(contentType)
                    .setMetadata(movieMetadata)
                    .build();
            
            MediaLoadRequestData loadRequestData = new MediaLoadRequestData.Builder()
                    .setMediaInfo(mediaInfo)
                    .setAutoplay(true)
                    .setCurrentTime(mCurrentTime)
                    .build();
            
            session.getRemoteMediaClient().load(loadRequestData);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void sendCastStatus(boolean connected, String deviceName) {
        JSObject ret = new JSObject();
        ret.put("connected", connected);
        ret.put("deviceName", deviceName);
        notifyListeners("onCastStatusChanged", ret);
    }
}
