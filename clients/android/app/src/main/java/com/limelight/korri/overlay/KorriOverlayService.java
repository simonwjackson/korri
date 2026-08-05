package com.limelight.korri.overlay;

import android.accessibilityservice.AccessibilityService;
import android.app.ActivityManager;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.accessibility.AccessibilityEvent;

import com.simonwjackson.korri.korrid.KorriBrainService;

/**
 * Production Guide/session scope for the global gameplay overlay.
 *
 * U4 deliberately owns no window: showing is state-only until U5 installs the
 * origin-locked WebView. The service requests no screen content or gestures.
 */
public final class KorriOverlayService extends AccessibilityService {
    private static final long LIVENESS_CHECK_DELAY_MS = 500;
    private static final int MAX_LIVENESS_CHECKS = 8;

    private StateMachine state;
    private KorriLaunchContinuity continuity;
    private KorriActiveSessionMonitor sessionMonitor;

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        state = new StateMachine(getPackageName());
        Handler handler = new Handler(Looper.getMainLooper());
        continuity = new KorriLaunchContinuity(
                new KorriLaunchContinuity.ActivityManagerProcessInspector(
                        (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE)),
                callback -> {
                    handler.postDelayed(callback, LIVENESS_CHECK_DELAY_MS);
                    return () -> handler.removeCallbacks(callback);
                },
                KorriBrainService::clearActiveLaunchOnEnd,
                MAX_LIVENESS_CHECKS);
        sessionMonitor = new KorriActiveSessionMonitor(
                KorriBrainService::activeLaunch,
                launch -> syncSession(),
                callback -> {
                    handler.postDelayed(callback, LIVENESS_CHECK_DELAY_MS);
                    return () -> handler.removeCallbacks(callback);
                },
                MAX_LIVENESS_CHECKS);
        syncSession();
    }

    @Override
    protected boolean onKeyEvent(KeyEvent event) {
        syncSession();
        return state != null
                && state.onKey(event.getKeyCode(), event.getAction(), event.isCanceled());
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (state == null
                || event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
                || event.getPackageName() == null) {
            return;
        }
        KorriActiveLaunch observedLaunch = syncSession();
        String packageName = event.getPackageName().toString();
        String className = event.getClassName() == null ? null : event.getClassName().toString();
        boolean ownedOverlayForeground = state.ownsVisibleOverlayForeground(packageName);
        String suspendedLaunchId = state.updateForeground(packageName, className);
        if (suspendedLaunchId != null) {
            KorriBrainService.suspendOverlay(suspendedLaunchId);
        }
        if (continuity != null && !ownedOverlayForeground) {
            continuity.updateForeground(packageName, className);
        }
        if (observedLaunch == null) {
            sessionMonitor.watchForPublication();
        } else {
            sessionMonitor.cancel();
        }
    }

    @Override
    public void onInterrupt() {
        if (state != null) state.interrupt();
    }

    @Override
    public void onDestroy() {
        if (sessionMonitor != null) sessionMonitor.destroy();
        if (state != null) state.destroy();
        if (continuity != null) continuity.destroy();
        sessionMonitor = null;
        state = null;
        continuity = null;
        super.onDestroy();
    }

    private KorriActiveLaunch syncSession() {
        KorriActiveLaunch launch = KorriBrainService.activeLaunch();
        if (state != null) {
            state.updateSession(launch, KorriBrainService.isOverlayArmed());
        }
        if (continuity != null) {
            continuity.updateSession(launch);
        }
        return launch;
    }

    /** Pure public state machine; Android callbacks are only adapters. */
    public static final class StateMachine {
        private final String servicePackage;
        private KorriActiveLaunch launch;
        private boolean ownerArmed;
        private String foregroundPackage;
        private String foregroundClass;
        private boolean showing;
        private String matchedLaunchId;
        private String suspendedLaunchId;
        private boolean guideOwned;
        private int toggleCount;
        private boolean destroyed;

        public StateMachine(String servicePackage) {
            this.servicePackage = servicePackage;
        }

        public void updateSession(KorriActiveLaunch next, boolean armed) {
            boolean freshIdentity = next != null
                    && (launch == null || !launch.launchId().equals(next.launchId()));
            boolean endedOrReplaced = launch != null
                    && (next == null || !launch.launchId().equals(next.launchId()));
            launch = next;
            ownerArmed = next != null && armed;
            if (freshIdentity || next == null) {
                matchedLaunchId = null;
                suspendedLaunchId = null;
            }
            if (freshIdentity && isForegroundMatch()) {
                matchedLaunchId = next.launchId();
            }
            if (endedOrReplaced || next == null || !isForegroundMatch()) {
                hide();
            }
        }

        /** The U5 window host drives this same seam after real show/hide operations. */
        public void updateOverlayVisibility(boolean visible) {
            if (!visible || !destroyed) showing = visible;
        }

        public boolean ownsVisibleOverlayForeground(String packageName) {
            return showing && servicePackage.equals(packageName);
        }

        /** Returns the exact launch newly suspended by foreground discontinuity. */
        public String updateForeground(String packageName, String className) {
            if (ownsVisibleOverlayForeground(packageName)) return null;
            boolean wasMatchedForeground = isForegroundMatch()
                    && launch != null
                    && launch.launchId().equals(matchedLaunchId);
            foregroundPackage = packageName;
            foregroundClass = className;
            if (isForegroundMatch()) {
                if (!launch.launchId().equals(suspendedLaunchId)) {
                    matchedLaunchId = launch.launchId();
                }
                return null;
            }
            hide();
            if (wasMatchedForeground && !launch.launchId().equals(suspendedLaunchId)) {
                suspendedLaunchId = launch.launchId();
                ownerArmed = false;
                return suspendedLaunchId;
            }
            return null;
        }

        public boolean onKey(int keyCode, int action) {
            return onKey(keyCode, action, false);
        }

        public boolean onKey(int keyCode, int action, boolean canceled) {
            if (destroyed || keyCode != KeyEvent.KEYCODE_BUTTON_MODE) return false;
            boolean active = showing || isArmed();
            if (action == KeyEvent.ACTION_DOWN) {
                if (!guideOwned && !active) return false;
                guideOwned = true;
                return true;
            }
            if (action == KeyEvent.ACTION_UP) {
                boolean consume = guideOwned || active;
                if (guideOwned) {
                    guideOwned = false;
                    if (!canceled && active) {
                        updateOverlayVisibility(!showing);
                        toggleCount++;
                    }
                }
                return consume;
            }
            return guideOwned || active;
        }

        public boolean isShowing() {
            return showing;
        }

        public int toggleCount() {
            return toggleCount;
        }

        public boolean hasMatchedLaunch(String launchId) {
            return launchId != null && launchId.equals(matchedLaunchId);
        }

        public void interrupt() {
            updateOverlayVisibility(false);
            guideOwned = false;
        }

        public void destroy() {
            destroyed = true;
            launch = null;
            ownerArmed = false;
            matchedLaunchId = null;
            suspendedLaunchId = null;
            interrupt();
        }

        private boolean isArmed() {
            return ownerArmed
                    && launch != null
                    && launch.launchId().equals(matchedLaunchId)
                    && !launch.launchId().equals(suspendedLaunchId)
                    && isForegroundMatch();
        }

        private boolean isForegroundMatch() {
            return launch != null && launch.matchesForeground(
                    foregroundPackage, foregroundClass);
        }

        private void hide() {
            updateOverlayVisibility(false);
        }
    }
}
