package com.limelight.korri.overlay;

import android.content.ComponentName;
import android.view.KeyEvent;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.List;

@RunWith(RobolectricTestRunner.class)
public class KorriOverlayServiceTest {
    private static final String LAUNCH = "0123456789abcdef0123456789abcdef";

    private static final String REPLACEMENT = "fedcba9876543210fedcba9876543210";

    private static KorriActiveLaunch artemis() {
        return artemis(LAUNCH);
    }

    private static KorriActiveLaunch artemis(String launchId) {
        return KorriActiveLaunch.artemis(
                launchId,
                "skate3",
                "Skate 3",
                "com.simonwjackson.korri",
                new ComponentName("com.simonwjackson.korri", "com.limelight.Game"),
                "@korri:moonlight/moonlight",
                "android-moonlight",
                false);
    }

    @Test
    public void matchingKorriLaunchConsumesBothGuideHalvesAndTogglesOnRelease() {
        KorriOverlayService.StateMachine state = new KorriOverlayService.StateMachine(
                "com.simonwjackson.korri");
        state.updateSession(artemis(), true);
        state.updateForeground("com.simonwjackson.korri", "com.limelight.Game");

        assertTrue(state.onKey(KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_DOWN));
        assertFalse(state.isShowing());
        assertTrue(state.onKey(KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_UP));
        assertTrue(state.isShowing());
        assertEquals(1, state.toggleCount());
    }

    @Test
    public void directLaunchAndForegroundMismatchPassGuideThrough() {
        KorriOverlayService.StateMachine direct = new KorriOverlayService.StateMachine(
                "com.simonwjackson.korri");
        direct.updateForeground("org.example.game", "org.example.game.Game");
        assertFalse(direct.onKey(KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_DOWN));
        assertFalse(direct.onKey(KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_UP));

        KorriOverlayService.StateMachine mismatch = new KorriOverlayService.StateMachine(
                "com.simonwjackson.korri");
        mismatch.updateSession(artemis(), true);
        mismatch.updateForeground(
                "com.simonwjackson.korri", "com.limelight.KorriShellActivity");
        assertFalse(mismatch.onKey(KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_DOWN));
        assertFalse(mismatch.onKey(KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_UP));
    }

    @Test
    public void matchedLaunchStaysDisarmedAfterDirectForegroundReturn() {
        KorriOverlayService.StateMachine state = new KorriOverlayService.StateMachine(
                "com.simonwjackson.korri");
        state.updateSession(artemis(), true);
        state.updateForeground("com.simonwjackson.korri", "com.limelight.Game");

        assertEquals(
                LAUNCH,
                state.updateForeground(
                        "com.simonwjackson.korri", "com.limelight.KorriShellActivity"));
        state.updateForeground("com.simonwjackson.korri", "com.limelight.Game");
        state.updateSession(artemis(), true);

        assertFalse(state.onKey(KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_DOWN));
        assertFalse(state.onKey(KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_UP));
    }

    @Test
    public void freshKorriPublicationRearmsKnownMatchingForeground() {
        KorriOverlayService.StateMachine state = new KorriOverlayService.StateMachine(
                "com.simonwjackson.korri");
        state.updateSession(artemis(), true);
        state.updateForeground("com.simonwjackson.korri", "com.limelight.Game");
        state.updateForeground(
                "com.simonwjackson.korri", "com.limelight.KorriShellActivity");
        state.updateForeground("com.simonwjackson.korri", "com.limelight.Game");

        state.updateSession(artemis(REPLACEMENT), true);

        assertTrue(state.onKey(KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_DOWN));
        assertTrue(state.onKey(KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_UP));
    }

    @Test
    public void measuredFrameLayoutEventIsOwnedWhileOverlayIsShowing() {
        KorriOverlayService.StateMachine state = openOverlay();

        assertTrue(state.ownsVisibleOverlayForeground("com.simonwjackson.korri"));
        assertNull(state.updateForeground(
                "com.simonwjackson.korri", "android.widget.FrameLayout"));
        assertTrue(state.isShowing());
        assertTrue(state.hasMatchedLaunch(LAUNCH));
    }

    @Test
    public void guideReleaseClosesAfterOwnOverlayForegroundEvent() {
        KorriOverlayService.StateMachine state = openOverlay();
        state.updateForeground("com.simonwjackson.korri", "android.widget.FrameLayout");

        assertTrue(state.onKey(KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_DOWN));
        assertTrue(state.onKey(KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_UP));
        assertFalse(state.isShowing());
        assertEquals(2, state.toggleCount());
    }

    @Test
    public void launcherForegroundEventStillSuspendsAndHidesVisibleOverlay() {
        KorriOverlayService.StateMachine state = openOverlay();

        assertFalse(state.ownsVisibleOverlayForeground("com.sec.android.app.launcher"));
        assertEquals(LAUNCH, state.updateForeground(
                "com.sec.android.app.launcher", "com.android.launcher3.Launcher"));
        assertFalse(state.isShowing());
        assertFalse(state.onKey(KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_DOWN));
    }

    @Test
    public void shellForegroundMismatchesNormallyAfterOverlayDismissal() {
        KorriOverlayService.StateMachine state = openOverlay();
        state.updateForeground("com.simonwjackson.korri", "android.widget.FrameLayout");
        state.onKey(KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_DOWN);
        state.onKey(KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_UP);

        assertFalse(state.ownsVisibleOverlayForeground("com.simonwjackson.korri"));
        assertEquals(LAUNCH, state.updateForeground(
                "com.simonwjackson.korri", "com.limelight.KorriShellActivity"));
        assertFalse(state.onKey(KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_DOWN));
    }

    @Test
    public void mismatchEndAndRevocationHideAndRestoreInput() {
        KorriOverlayService.StateMachine state = new KorriOverlayService.StateMachine(
                "com.simonwjackson.korri");
        state.updateSession(artemis(), true);
        state.updateForeground("com.simonwjackson.korri", "com.limelight.Game");
        state.onKey(KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_DOWN);
        state.onKey(KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_UP);
        assertTrue(state.isShowing());

        state.updateForeground("org.example.other", "org.example.other.Main");
        assertFalse(state.isShowing());
        assertFalse(state.onKey(KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_DOWN));

        state.updateSession(null, false);
        state.destroy();
        assertFalse(state.isShowing());
        assertFalse(state.onKey(KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_UP));
    }

    @Test
    public void guideOwnershipSurvivesScopeLossUntilReleaseWithoutToggling() {
        KorriOverlayService.StateMachine state = new KorriOverlayService.StateMachine(
                "com.simonwjackson.korri");
        state.updateSession(artemis(), true);
        state.updateForeground("com.simonwjackson.korri", "com.limelight.Game");

        assertTrue(state.onKey(KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_DOWN));
        state.updateForeground("org.example.other", "org.example.other.Main");
        state.updateSession(null, false);

        assertTrue(state.onKey(KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_UP));
        assertFalse(state.isShowing());
        assertEquals(0, state.toggleCount());
        assertFalse(state.onKey(KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_UP));
    }

    @Test
    public void cancelledGuideReleaseIsConsumedWithoutToggling() {
        KorriOverlayService.StateMachine state = new KorriOverlayService.StateMachine(
                "com.simonwjackson.korri");
        state.updateSession(artemis(), true);
        state.updateForeground("com.simonwjackson.korri", "com.limelight.Game");

        assertTrue(state.onKey(KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_DOWN));
        assertTrue(state.onKey(KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_UP, true));
        assertFalse(state.isShowing());
        assertEquals(0, state.toggleCount());
    }

    @Test
    public void interruptResetsTransientStateButDestroyIsTerminal() {
        KorriOverlayService.StateMachine state = new KorriOverlayService.StateMachine(
                "com.simonwjackson.korri");
        state.updateSession(artemis(), true);
        state.updateForeground("com.simonwjackson.korri", "com.limelight.Game");
        state.onKey(KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_DOWN);

        state.interrupt();
        assertFalse(state.isShowing());
        assertTrue(state.onKey(KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_DOWN));
        assertTrue(state.onKey(KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_UP));
        assertTrue(state.isShowing());

        state.destroy();
        assertFalse(state.onKey(KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_DOWN));
    }

    @Test
    public void unrelatedKeysAlwaysPassThrough() {
        KorriOverlayService.StateMachine state = new KorriOverlayService.StateMachine(
                "com.simonwjackson.korri");
        state.updateSession(artemis(), true);
        state.updateForeground("com.simonwjackson.korri", "com.limelight.Game");

        assertFalse(state.onKey(KeyEvent.KEYCODE_BUTTON_A, KeyEvent.ACTION_DOWN));
        assertFalse(state.onKey(KeyEvent.KEYCODE_DPAD_UP, KeyEvent.ACTION_DOWN));
    }

    @Test
    public void showingOverlayConsumesAndSemanticallyTranslatesEveryOwnedInput() throws Exception {
        assertInput(KeyEvent.KEYCODE_DPAD_UP,
                "{\"type\":\"direction\",\"direction\":\"up\",\"source\":\"gamepad\"}",
                false);
        assertInput(KeyEvent.KEYCODE_DPAD_RIGHT,
                "{\"type\":\"direction\",\"direction\":\"right\","
                        + "\"repeat\":true,\"source\":\"gamepad\"}",
                false, 3);
        assertInput(KeyEvent.KEYCODE_BUTTON_A,
                "{\"type\":\"confirm\",\"source\":\"gamepad\"}", false);
        assertInput(KeyEvent.KEYCODE_BACK,
                "{\"type\":\"back\",\"source\":\"gamepad\"}", true);
        assertInput(KeyEvent.KEYCODE_BUTTON_B,
                "{\"type\":\"back\",\"source\":\"gamepad\"}", true);
        assertInput(KeyEvent.KEYCODE_BUTTON_START,
                "{\"type\":\"menu\",\"source\":\"gamepad\"}", false);
        assertInput(KeyEvent.KEYCODE_BUTTON_SELECT,
                "{\"type\":\"options\",\"source\":\"gamepad\"}", false);

        KorriOverlayService.OverlayInput.Decision release =
                KorriOverlayService.OverlayInput.route(
                        KeyEvent.KEYCODE_BUTTON_A, KeyEvent.ACTION_UP, 0, true);
        assertTrue(release.consumed());
        assertNull(release.inputJson());
        assertFalse(release.dismiss());
    }

    @Test
    public void removedOverlayPassesGameplayInputThrough() {
        KorriOverlayService.OverlayInput.Decision decision =
                KorriOverlayService.OverlayInput.route(
                        KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.ACTION_DOWN, 0, false);
        assertFalse(decision.consumed());
        assertNull(decision.inputJson());
        assertFalse(decision.dismiss());
    }

    @Test
    public void windowLifecycleAddsRemovesRefreshesAndDestroysIdempotently() {
        RecordingWindowFactory factory = new RecordingWindowFactory();
        KorriOverlayService.WindowController windows =
                new KorriOverlayService.WindowController(factory);

        windows.setVisible(true);
        windows.setVisible(true);
        windows.refreshAuthority();
        assertTrue(windows.isVisible());
        assertEquals(1, factory.created.size());
        assertEquals(1, factory.created.get(0).refreshCount);

        windows.setVisible(false);
        windows.setVisible(false);
        assertFalse(windows.isVisible());
        assertEquals(1, factory.created.get(0).destroyCount);

        windows.setVisible(true);
        windows.destroy();
        windows.destroy();
        windows.setVisible(true);
        assertEquals(2, factory.created.size());
        assertEquals(1, factory.created.get(1).destroyCount);
        assertFalse(windows.isVisible());
    }

    private static void assertInput(int keyCode, String json, boolean dismiss) {
        assertInput(keyCode, json, dismiss, 0);
    }

    private static void assertInput(
            int keyCode, String json, boolean dismiss, int repeatCount) {
        KorriOverlayService.OverlayInput.Decision decision =
                KorriOverlayService.OverlayInput.route(
                        keyCode, KeyEvent.ACTION_DOWN, repeatCount, true);
        assertTrue(decision.consumed());
        assertEquals(json, decision.inputJson());
        assertEquals(dismiss, decision.dismiss());
    }

    private static final class RecordingWindowFactory
            implements KorriOverlayService.WindowFactory {
        final List<RecordingWindow> created = new ArrayList<>();

        @Override
        public KorriOverlayService.OverlayWindow create() {
            RecordingWindow window = new RecordingWindow();
            created.add(window);
            return window;
        }
    }

    private static final class RecordingWindow
            implements KorriOverlayService.OverlayWindow {
        int refreshCount;
        int destroyCount;

        @Override
        public void sendInput(String inputJson) {}

        @Override
        public void refreshAuthority() {
            refreshCount++;
        }

        @Override
        public void destroy() {
            destroyCount++;
        }
    }

    private static KorriOverlayService.StateMachine openOverlay() {
        KorriOverlayService.StateMachine state = new KorriOverlayService.StateMachine(
                "com.simonwjackson.korri");
        state.updateSession(artemis(), true);
        state.updateForeground("com.simonwjackson.korri", "com.limelight.Game");
        state.onKey(KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_DOWN);
        state.onKey(KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_UP);
        assertTrue(state.isShowing());
        return state;
    }
}
