package com.cinemovie.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.net.wifi.WifiManager;
import androidx.core.app.NotificationCompat;
import com.google.android.gms.cast.framework.CastContext;
import com.google.android.gms.cast.framework.CastSession;
import com.google.android.gms.cast.framework.media.RemoteMediaClient;

public class CastForegroundService extends Service {

    private static final String CHANNEL_ID = "cast_service_channel";
    private static final int NOTIFICATION_ID = 4321;
    
    private String mCachedTitle = "CineMovie TV Cast";
    private String mCachedSubtitle = "Casting video to your TV";

    private PowerManager.WakeLock mWakeLock = null;
    private WifiManager.WifiLock mWifiLock = null;

    private final RemoteMediaClient.Callback mediaCallback = new RemoteMediaClient.Callback() {
        @Override
        public void onStatusUpdated() {
            updateNotification();
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();

        // Acquire WakeLock to keep CPU active during cast
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                mWakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "CineMovie:CastWakeLock");
                mWakeLock.acquire();
            }
        } catch (Exception e) {
            e.printStackTrace();
        }

        // Acquire WifiLock to keep Wi-Fi radio high-perf
        try {
            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    mWifiLock = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "CineMovie:CastWifiLock");
                } else {
                    mWifiLock = wm.createWifiLock(WifiManager.WIFI_MODE_FULL, "CineMovie:CastWifiLock");
                }
                mWifiLock.acquire();
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String action = intent.getAction();
            if (action != null) {
                handleAction(action);
            }
            String intentTitle = intent.getStringExtra("title");
            if (intentTitle != null) {
                mCachedTitle = intentTitle;
            }
            String intentSubtitle = intent.getStringExtra("subtitle");
            if (intentSubtitle != null) {
                mCachedSubtitle = intentSubtitle;
            }
        }

        try {
            CastSession session = CastContext.getSharedInstance(this).getSessionManager().getCurrentCastSession();
            if (session != null && session.getRemoteMediaClient() != null) {
                session.getRemoteMediaClient().unregisterCallback(mediaCallback);
                session.getRemoteMediaClient().registerCallback(mediaCallback);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }

        Notification notification = buildNotification(mCachedTitle, mCachedSubtitle);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        try {
            CastSession session = CastContext.getSharedInstance(this).getSessionManager().getCurrentCastSession();
            if (session != null && session.getRemoteMediaClient() != null) {
                session.getRemoteMediaClient().unregisterCallback(mediaCallback);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }

        // Release locks safely
        if (mWakeLock != null && mWakeLock.isHeld()) {
            try { mWakeLock.release(); } catch (Exception ignored) {}
            mWakeLock = null;
        }
        if (mWifiLock != null && mWifiLock.isHeld()) {
            try { mWifiLock.release(); } catch (Exception ignored) {}
            mWifiLock = null;
        }

        super.onDestroy();
    }

    private void handleAction(String action) {
        try {
            CastSession session = CastContext.getSharedInstance(this).getSessionManager().getCurrentCastSession();
            if (session != null && session.isConnected() && session.getRemoteMediaClient() != null) {
                RemoteMediaClient client = session.getRemoteMediaClient();
                if ("ACTION_PLAY_PAUSE".equals(action)) {
                    if (client.isPaused()) {
                        client.play();
                    } else {
                        client.pause();
                    }
                } else if ("ACTION_SKIP".equals(action)) {
                    long currentPos = client.getApproximateStreamPosition();
                    client.seek(currentPos + 10000); // Skip forward 10 seconds
                } else if ("ACTION_STOP".equals(action)) {
                    CastContext.getSharedInstance(this).getSessionManager().endCurrentSession(true);
                    stopSelf();
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private Notification buildNotification(String title, String subtitle) {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, notificationIntent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        Intent playIntent = new Intent(this, CastForegroundService.class).setAction("ACTION_PLAY_PAUSE");
        PendingIntent playPendingIntent = PendingIntent.getService(
                this, 1, playIntent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        Intent skipIntent = new Intent(this, CastForegroundService.class).setAction("ACTION_SKIP");
        PendingIntent skipPendingIntent = PendingIntent.getService(
                this, 2, skipIntent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        Intent stopIntent = new Intent(this, CastForegroundService.class).setAction("ACTION_STOP");
        PendingIntent stopPendingIntent = PendingIntent.getService(
                this, 3, stopIntent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        boolean isPaused = true;
        try {
            CastSession session = CastContext.getSharedInstance(this).getSessionManager().getCurrentCastSession();
            if (session != null && session.isConnected() && session.getRemoteMediaClient() != null) {
                isPaused = session.getRemoteMediaClient().isPaused();
            }
        } catch (Exception ignored) {}

        int playPauseIcon = isPaused ? android.R.drawable.ic_media_play : android.R.drawable.ic_media_pause;
        String playPauseLabel = isPaused ? "Play" : "Pause";
        int smallIcon = android.R.drawable.ic_media_play;

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(subtitle)
                .setSmallIcon(smallIcon)
                .setContentIntent(pendingIntent)
                .addAction(playPauseIcon, playPauseLabel, playPendingIntent)
                .addAction(android.R.drawable.ic_media_next, "Skip 10s", skipPendingIntent)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Disconnect", stopPendingIntent)
                .setStyle(new androidx.media.app.NotificationCompat.MediaStyle()
                        .setShowActionsInCompactView(0, 1, 2))
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .build();
    }

    private void updateNotification() {
        String title = mCachedTitle;
        String subtitle = mCachedSubtitle;
        try {
            CastSession session = CastContext.getSharedInstance(this).getSessionManager().getCurrentCastSession();
            if (session != null && session.getRemoteMediaClient() != null) {
                com.google.android.gms.cast.MediaInfo info = session.getRemoteMediaClient().getMediaInfo();
                if (info != null && info.getMetadata() != null) {
                    title = info.getMetadata().getString(com.google.android.gms.cast.MediaMetadata.KEY_TITLE);
                    subtitle = info.getMetadata().getString(com.google.android.gms.cast.MediaMetadata.KEY_SUBTITLE);
                }
            }
        } catch (Exception ignored) {}

        Notification notification = buildNotification(title, subtitle);
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, notification);
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel serviceChannel = new NotificationChannel(
                    CHANNEL_ID,
                    "CineMovie Cast Service Channel",
                    NotificationManager.IMPORTANCE_LOW
            );
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(serviceChannel);
            }
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
