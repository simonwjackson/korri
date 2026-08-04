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

import com.limelight.korri.overlay.KorriActiveLaunch;

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
    private static final String EXTRA_ALLOWED_ORIGIN = "allowedOrigin";
    private static final String EXTRA_LOCAL_STORAGE_ROOT = "localStorageRoot";

    /**
     * Guards double-starts: the activity and the service both want a running
     * brain, and whoever arrives first should win without the other noticing.
     */
    private static boolean started = false;
    private static int port = 0;

    /** One process-local session snapshot. launchId is its only wire identity;
     * owner identity closes Activity-recreation compare-and-clear races. */
    private static KorriActiveLaunch activeLaunch;
    private static Object activeLaunchOwner;
    private static boolean overlayArmed;

    public static synchronized KorriActiveLaunch publishLocalActiveLaunch(
            Object owner, String signedSpecJson) throws Exception {
        return installActiveLaunch(
                owner, KorriActiveLaunch.fromJson(KorridServer.publishLocalActiveLaunch(
                        signedSpecJson)));
    }

    public static synchronized KorriActiveLaunch publishMoonlightActiveLaunch(
            Object owner,
            String signedSpecJson,
            String applicationPackage,
            String gameClassName) throws Exception {
        return installActiveLaunch(
                owner,
                KorriActiveLaunch.fromJson(KorridServer.publishMoonlightActiveLaunch(
                        signedSpecJson, applicationPackage, gameClassName)));
    }

    private static KorriActiveLaunch installActiveLaunch(
            Object owner, KorriActiveLaunch launch) {
        activeLaunch = launch;
        activeLaunchOwner = owner;
        overlayArmed = true;
        return launch;
    }

    public static synchronized KorriActiveLaunch activeLaunch() {
        return activeLaunch;
    }

    public static synchronized boolean isOverlayArmed() {
        return overlayArmed;
    }

    public static synchronized void setOverlayArmed(boolean armed) {
        overlayArmed = activeLaunch != null && armed;
    }

    /** Recreated Game Activities retain the serialized launchId but replace
     * only the in-process owner object. */
    public static synchronized boolean claimActiveLaunch(String launchId, Object owner) {
        if (activeLaunch == null || !activeLaunch.launchId().equals(launchId)) {
            return false;
        }
        activeLaunchOwner = owner;
        return true;
    }

    public static synchronized boolean clearActiveLaunch(Object owner, String launchId) {
        if (!matchesActive(owner, launchId) || !KorridServer.clearActiveLaunch(launchId)) {
            return false;
        }
        clearJavaActiveLaunch();
        return true;
    }

    /** Positive process/stream-end evidence has no Activity owner, but still
     * compares the exact serialized session before clearing. */
    public static synchronized boolean clearActiveLaunchOnEnd(String launchId) {
        if (activeLaunch == null
                || !activeLaunch.launchId().equals(launchId)
                || !KorridServer.clearActiveLaunch(launchId)) {
            return false;
        }
        clearJavaActiveLaunch();
        return true;
    }

    private static boolean matchesActive(Object owner, String launchId) {
        return activeLaunch != null
                && activeLaunchOwner == owner
                && activeLaunch.launchId().equals(launchId);
    }

    private static void clearJavaActiveLaunch() {
        activeLaunch = null;
        activeLaunchOwner = null;
        overlayArmed = false;
    }

    public static synchronized void publishActiveLaunchForTest(
            Object owner, KorriActiveLaunch launch) {
        installActiveLaunch(owner, launch);
    }

    public static synchronized boolean clearActiveLaunchForTest(Object owner, String launchId) {
        if (!matchesActive(owner, launchId)) return false;
        clearJavaActiveLaunch();
        return true;
    }

    public static synchronized void resetActiveLaunchForTest() {
        clearJavaActiveLaunch();
    }

    /**
     * Starts the brain if it is not already up, then asks Android to keep the
     * process around. Synchronous, so callers can rely on the port immediately
     * rather than racing service startup.
     */
    public static synchronized int ensureRunning(
            Context context, String allowedOrigin, String localStorageRoot) {
        startBrainIfNeeded(allowedOrigin, localStorageRoot);
        Intent intent = new Intent(context.getApplicationContext(), KorriBrainService.class)
                .putExtra(EXTRA_ALLOWED_ORIGIN, allowedOrigin)
                .putExtra(EXTRA_LOCAL_STORAGE_ROOT, localStorageRoot);
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

    private static synchronized void startBrainIfNeeded(
            String allowedOrigin, String localStorageRoot) {
        if (started) {
            return;
        }
        int startedPort = KorridServer.startAndLog(allowedOrigin, localStorageRoot);
        port = startedPort;
        started = true;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForeground(NOTIFICATION_ID, buildNotification());
        if (!started) {
            if (intent == null) {
                Log.e(TAG, "brain service restarted without launch parameters; stopping");
                return stopWithoutRestart(startId);
            }
            String allowedOrigin = intent.getStringExtra(EXTRA_ALLOWED_ORIGIN);
            String localStorageRoot = intent.getStringExtra(EXTRA_LOCAL_STORAGE_ROOT);
            if (allowedOrigin == null || localStorageRoot == null) {
                Log.e(TAG, "brain service launch parameters missing; stopping");
                return stopWithoutRestart(startId);
            }
            try {
                synchronized (KorriBrainService.class) {
                    startBrainIfNeeded(allowedOrigin, localStorageRoot);
                }
            } catch (RuntimeException error) {
                Log.e(TAG, "brain service failed to start korrid; stopping", error);
                return stopWithoutRestart(startId);
            }
        }
        Log.i(TAG, "brain service up, korrid on 127.0.0.1:" + port);
        // If Android kills the process, redeliver the intent so the service
        // can restart the Rust brain with the same portal origin and storage root.
        return START_REDELIVER_INTENT;
    }

    @Override
    public void onDestroy() {
        Log.i(TAG, "brain service stopping, korrid going down with it");
        synchronized (KorriBrainService.class) {
            try {
                if (started) {
                    KorridServer.stop();
                }
            } finally {
                started = false;
                port = 0;
                clearJavaActiveLaunch();
            }
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private int stopWithoutRestart(int startId) {
        removeForegroundState();
        stopSelf(startId);
        return START_NOT_STICKY;
    }

    @SuppressWarnings("deprecation")
    private void removeForegroundState() {
        if (Build.VERSION.SDK_INT >= 24) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
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
