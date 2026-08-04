package com.limelight.korri.overlay;

import android.content.ComponentName;
import android.view.KeyEvent;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

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
    public void ownAccessibilityWindowDoesNotBreakGuideClose() {
        KorriOverlayService.StateMachine state = new KorriOverlayService.StateMachine(
                "com.simonwjackson.korri");
        state.updateSession(artemis(), true);
        state.updateForeground("com.simonwjackson.korri", "com.limelight.Game");
        state.onKey(KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_DOWN);
        state.onKey(KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_UP);
        assertTrue(state.isShowing());

        state.updateForeground("com.simonwjackson.korri", KorriOverlayService.class.getName());
        assertTrue(state.onKey(KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_DOWN));
        assertTrue(state.onKey(KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_UP));
        assertFalse(state.isShowing());
        assertEquals(2, state.toggleCount());
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
}
