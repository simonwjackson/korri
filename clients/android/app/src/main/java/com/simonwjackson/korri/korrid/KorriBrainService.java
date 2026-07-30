package com.simonwjackson.korri.korrid;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

/**
 * Keeps korrid alive while Korri is not on screen.
 *
 * Korri's brain is the Rust server behind {@link KorridServer}; this class
 * holds no logic of its own. Its whole job is to be the thing Android keeps
 * running, because Android only extends that courtesy to a declared service.
 *
 * Before this existed, korrid's lifetime was owned by the shell activity and
 * stopped in its onDestroy -- so launching a game, which takes the activity
 * away, also took the brain away. Ownership now sits here: the activity became
 * one client of a running brain rather than the reason it is running.
 */
public final class KorriBrainService extends Service {
    private static final String TAG = "KorriBrain";
    private static final String CHANNEL = "korri-brain";
    private static final int NOTIFICATION_ID = 1;

    /**
     * Guards double-starts: the activity and the service both want a running
     * brain, and whoever arrives first should win without the other noticing.
     */
    private static boolean started = false;
    private static int port = 0;

    /**
     * Starts the brain if it is not already up, then asks Android to keep the
     * process around. Synchronous, so callers can rely on the port immediately
     * rather than racing service startup.
     */
    public static synchronized int ensureRunning(
            Context context, String allowedOrigin, String localStorageRoot) {
        if (!started) {
            port = KorridServer.startAndLog(allowedOrigin, localStorageRoot);
            started = true;
        }
        Intent intent = new Intent(context.getApplicationContext(), KorriBrainService.class);
        if (Build.VERSION.SDK_INT >= 26) {
            context.getApplicationContext().startForegroundService(intent);
        } else {
            context.getApplicationContext().startService(intent);
        }
        return port;
    }

    /** Explicit shutdown. Deliberately not called when a screen goes away. */
    public static void shutdown(Context context) {
        context.getApplicationContext()
                .stopService(new Intent(context.getApplicationContext(), KorriBrainService.class));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForeground(NOTIFICATION_ID, buildNotification());
        Log.i(TAG, "brain service up, korrid on 127.0.0.1:" + port);
        // Android should bring this back if it ever has to reclaim the process.
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        Log.i(TAG, "brain service stopping, korrid going down with it");
        KorridServer.stop();
        synchronized (KorriBrainService.class) {
            started = false;
            port = 0;
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private Notification buildNotification() {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26) {
            // IMPORTANCE_LOW: required to exist, but it should never make noise.
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL, "Korri", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Shown while Korri is ready to play.");
            manager.createNotificationChannel(channel);
        }
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(this, CHANNEL)
                : new Notification.Builder(this);
        return builder
                .setContentTitle("Korri")
                .setContentText("Ready to play")
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setOngoing(true)
                .build();
    }
}
