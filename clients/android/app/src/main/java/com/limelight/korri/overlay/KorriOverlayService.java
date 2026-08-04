package com.limelight.korri.overlay;

import android.accessibilityservice.AccessibilityService;
import android.app.ActivityManager;
import android.content.Context;
import android.view.KeyEvent;
import android.view.accessibility.AccessibilityEvent;

import com.simonwjackson.korri.korrid.KorriBrainService;

import java.util.List;

/**
 * Production Guide/session scope for the global gameplay overlay.
 *
 * U4 deliberately owns no window: showing is state-only until U5 installs the
 * origin-locked WebView. The service requests no screen content or gestures.
 */
public final class KorriOverlayService extends AccessibilityService {
    private StateMachine state;

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        state = new StateMachine(getPackageName());
        syncSession();
    }

    @Override
    protected boolean onKeyEvent(KeyEvent event) {
        syncSession();
        return state != null && state.onKey(event.getKeyCode(), event.getAction());
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (state == null
                || event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
                || event.getPackageName() == null) {
            return;
        }
        syncSession();
        String packageName = event.getPackageName().toString();
        String className = event.getClassName() == null ? null : event.getClassName().toString();
        state.updateForeground(packageName, className);

        KorriActiveLaunch launch = KorriBrainService.activeLaunch();
        if (launch != null
                && state.hasMatchedLaunch(launch.launchId())
                && !launch.matchesForeground(packageName, className)
                && !isTargetProcessRunning(launch.targetPackage())) {
            KorriBrainService.clearActiveLaunchOnEnd(launch.launchId());
            syncSession();
        }
    }

    @Override
    public void onInterrupt() {
        if (state != null) state.destroy();
    }

    @Override
    public void onDestroy() {
        if (state != null) state.destroy();
        state = null;
        super.onDestroy();
    }

    private void syncSession() {
        if (state != null) {
            state.updateSession(
                    KorriBrainService.activeLaunch(), KorriBrainService.isOverlayArmed());
        }
    }

    private boolean isTargetProcessRunning(String targetPackage) {
        ActivityManager manager = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
        List<ActivityManager.RunningAppProcessInfo> processes =
                manager == null ? null : manager.getRunningAppProcesses();
        if (processes == null) return true; // absence of evidence is not end evidence
        for (ActivityManager.RunningAppProcessInfo process : processes) {
            if (targetPackage.equals(process.processName)) return true;
            if (process.pkgList != null) {
                for (String packageName : process.pkgList) {
                    if (targetPackage.equals(packageName)) return true;
                }
            }
        }
        return false;
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
        private boolean guideDown;
        private int toggleCount;
        private boolean destroyed;

        public StateMachine(String servicePackage) {
            this.servicePackage = servicePackage;
        }

        public void updateSession(KorriActiveLaunch next, boolean armed) {
            boolean replaced = launch != null
                    && (next == null || !launch.launchId().equals(next.launchId()));
            launch = next;
            ownerArmed = next != null && armed;
            if (replaced || next == null) {
                matchedLaunchId = null;
            }
            if (replaced || next == null || !isForegroundMatch()) {
                hide();
            }
        }

        public void updateForeground(String packageName, String className) {
            if (showing
                    && servicePackage.equals(packageName)
                    && KorriOverlayService.class.getName().equals(className)) {
                return;
            }
            foregroundPackage = packageName;
            foregroundClass = className;
            if (isForegroundMatch()) {
                matchedLaunchId = launch.launchId();
            } else {
                hide();
            }
        }

        public boolean onKey(int keyCode, int action) {
            if (destroyed || keyCode != KeyEvent.KEYCODE_BUTTON_MODE) return false;
            boolean consume = showing || isArmed();
            if (!consume) {
                guideDown = false;
                return false;
            }
            if (action == KeyEvent.ACTION_DOWN) {
                guideDown = true;
                return true;
            }
            if (action == KeyEvent.ACTION_UP) {
                if (guideDown) {
                    guideDown = false;
                    showing = !showing;
                    toggleCount++;
                }
                return true;
            }
            return true;
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

        public void destroy() {
            destroyed = true;
            launch = null;
            ownerArmed = false;
            matchedLaunchId = null;
            hide();
        }

        private boolean isArmed() {
            return ownerArmed && launch != null && isForegroundMatch();
        }

        private boolean isForegroundMatch() {
            return launch != null && launch.matchesForeground(
                    foregroundPackage, foregroundClass);
        }

        private void hide() {
            showing = false;
            guideDown = false;
        }
    }
}
