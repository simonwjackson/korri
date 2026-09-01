package com.limelight.korri.overlay;

import android.content.ComponentName;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;

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

        assertTrue(state.isSessionAccepted());
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
        assertFalse(direct.isSessionAccepted());
        assertFalse(direct.onKey(KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_DOWN));
        assertFalse(direct.onKey(KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_UP));

        KorriOverlayService.StateMachine mismatch = new KorriOverlayService.StateMachine(
                "com.simonwjackson.korri");
        mismatch.updateSession(artemis(), true);
        mismatch.updateForeground(
                "com.simonwjackson.korri", "com.limelight.KorriShellActivity");
        assertFalse(mismatch.isSessionAccepted());
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

        assertTrue(state.ownsVisibleOverlayForeground(
                "com.simonwjackson.korri", "android.widget.FrameLayout"));
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

        assertFalse(state.ownsVisibleOverlayForeground(
                "com.sec.android.app.launcher", "com.android.launcher3.Launcher"));
        assertEquals(LAUNCH, state.updateForeground(
                "com.sec.android.app.launcher", "com.android.launcher3.Launcher"));
        assertFalse(state.isShowing());
        assertFalse(state.onKey(KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_DOWN));
    }

    @Test
    public void shellActivityIsNeverOwnedEvenWhileOverlayIsVisible() {
        KorriOverlayService.StateMachine state = openOverlay();

        assertFalse(state.ownsVisibleOverlayForeground(
                "com.simonwjackson.korri", "com.limelight.KorriShellActivity"));
        assertEquals(LAUNCH, state.updateForeground(
                "com.simonwjackson.korri", "com.limelight.KorriShellActivity"));
        assertFalse(state.isShowing());
    }

    @Test
    public void unknownSamePackageClassFailsClosedWhileOverlayIsVisible() {
        KorriOverlayService.StateMachine state = openOverlay();

        assertFalse(state.ownsVisibleOverlayForeground(
                "com.simonwjackson.korri", "com.simonwjackson.korri.UnknownWindow"));
        assertEquals(LAUNCH, state.updateForeground(
                "com.simonwjackson.korri", "com.simonwjackson.korri.UnknownWindow"));
    }

    @Test
    public void shellForegroundMismatchesNormallyAfterOverlayDismissal() {
        KorriOverlayService.StateMachine state = openOverlay();
        state.updateForeground("com.simonwjackson.korri", "android.widget.FrameLayout");
        state.onKey(KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_DOWN);
        state.onKey(KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_UP);

        assertFalse(state.ownsVisibleOverlayForeground(
                "com.simonwjackson.korri", "com.limelight.KorriShellActivity"));
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
    public void guideOwnershipIsExactPerInputDevice() {
        KorriOverlayService.StateMachine state = new KorriOverlayService.StateMachine(
                "com.simonwjackson.korri");
        state.updateSession(artemis(), true);
        state.updateForeground("com.simonwjackson.korri", "com.limelight.Game");

        assertFalse(state.onKey(
                8, KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_UP, false));
        assertTrue(state.onKey(
                7, KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_DOWN, false));
        assertFalse(state.onKey(
                8, KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_DOWN, false));
        assertFalse(state.onKey(
                8, KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_UP, false));
        assertFalse(state.onKey(
                8, KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_UP, true));
        assertTrue(state.onKey(
                7, KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_DOWN, false));
        assertTrue(state.onKey(
                7, KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_UP, false));

        assertTrue(state.isShowing());
        assertEquals(1, state.toggleCount());
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
        KorriOverlayService.OverlayInput input = new KorriOverlayService.OverlayInput();
        assertInput(input, KeyEvent.KEYCODE_DPAD_UP,
                "{\"type\":\"direction\",\"direction\":\"up\","
                        + "\"releaseExpected\":true,\"gestureId\":1,"
                        + "\"source\":\"gamepad\"}",
                false);
        KorriOverlayService.OverlayInput.Decision directionRelease = input.route(
                1, KeyEvent.KEYCODE_DPAD_UP, InputDevice.SOURCE_GAMEPAD,
                KeyEvent.ACTION_UP, 0, true, false);
        assertTrue(directionRelease.consumed());
        assertEquals("{\"type\":\"direction-end\",\"direction\":\"up\","
                + "\"gestureId\":1,\"source\":\"gamepad\"}", directionRelease.inputJson());
        assertInput(input, KeyEvent.KEYCODE_DPAD_RIGHT,
                "{\"type\":\"direction\",\"direction\":\"right\","
                        + "\"releaseExpected\":true,\"gestureId\":2,"
                        + "\"repeat\":true,\"source\":\"gamepad\"}",
                false, 3);
        assertInput(input, KeyEvent.KEYCODE_BUTTON_A,
                "{\"type\":\"confirm\",\"source\":\"gamepad\"}", false);
        assertInput(input, KeyEvent.KEYCODE_BACK,
                "{\"type\":\"back\",\"source\":\"gamepad\"}", true);
        assertInput(input, KeyEvent.KEYCODE_BUTTON_B,
                "{\"type\":\"back\",\"source\":\"gamepad\"}", true);
        assertInput(input, KeyEvent.KEYCODE_BUTTON_START,
                "{\"type\":\"menu\",\"source\":\"gamepad\"}", false);
        assertInput(input, KeyEvent.KEYCODE_BUTTON_SELECT,
                "{\"type\":\"options\",\"source\":\"gamepad\"}", false);

        KorriOverlayService.OverlayInput.Decision release = input.route(
                1, KeyEvent.KEYCODE_BUTTON_A, InputDevice.SOURCE_GAMEPAD,
                KeyEvent.ACTION_UP, 0, true, false);

        assertTrue(release.consumed());
        assertNull(release.inputJson());
        assertFalse(release.dismiss());
    }

    @Test
    public void gamepadButtonsWithoutOverlaySemanticsAreStillOwnedUntilRelease() {
        for (int keyCode : new int[] {
                KeyEvent.KEYCODE_BUTTON_X,
                KeyEvent.KEYCODE_BUTTON_Y,
                KeyEvent.KEYCODE_BUTTON_L1,
                KeyEvent.KEYCODE_BUTTON_R1,
                KeyEvent.KEYCODE_BUTTON_L2,
                KeyEvent.KEYCODE_BUTTON_R2,
                KeyEvent.KEYCODE_BUTTON_THUMBL,
                KeyEvent.KEYCODE_BUTTON_THUMBR,
        }) {
            KorriOverlayService.OverlayInput input = new KorriOverlayService.OverlayInput();
            KorriOverlayService.OverlayInput.Decision down = input.route(
                    7, keyCode, InputDevice.SOURCE_GAMEPAD,
                    KeyEvent.ACTION_DOWN, 0, true, false);
            assertTrue(down.consumed());
            assertNull(down.inputJson());
            assertTrue(input.route(7, keyCode, InputDevice.SOURCE_JOYSTICK,
                    KeyEvent.ACTION_DOWN, 1, true, false).consumed());
            assertTrue(input.route(7, keyCode, InputDevice.SOURCE_GAMEPAD,
                    KeyEvent.ACTION_UP, 0, false, false).consumed());
        }
    }

    @Test
    public void androidReservedGamepadKeysPassThrough() {
        for (int keyCode : new int[] {
                KeyEvent.KEYCODE_VOLUME_UP,
                KeyEvent.KEYCODE_VOLUME_DOWN,
                KeyEvent.KEYCODE_VOLUME_MUTE,
                KeyEvent.KEYCODE_POWER,
                KeyEvent.KEYCODE_HOME,
                KeyEvent.KEYCODE_APP_SWITCH,
                KeyEvent.KEYCODE_SYSTEM_NAVIGATION_UP,
        }) {
            assertFalse(new KorriOverlayService.OverlayInput().route(
                    7, keyCode, InputDevice.SOURCE_GAMEPAD,
                    KeyEvent.ACTION_DOWN, 0, true, false).consumed());
        }
    }

    @Test
    public void focusedWindowTranslatesHatAndStickEdgesWithoutSyntheticKeys() {
        KorriOverlayService.OverlayMotionInput input =
                new KorriOverlayService.OverlayMotionInput();

        assertEquals(java.util.Arrays.asList("right", "up"),
                input.directions(7, 1f, -1f, -1f, 1f));
        assertTrue(input.directions(7, 1f, -1f, 0f, 0f).isEmpty());
        assertTrue(input.directions(7, 0f, 0f, 0f, 0f).isEmpty());
        assertEquals(java.util.Collections.singletonList("left"),
                input.directions(7, 0f, 0f, -0.51f, 0f));
        assertTrue(input.directions(7, 0f, 0f, -1f, 0f).isEmpty());
        assertTrue(input.directions(7, 0f, 0f, 0f, 0f).isEmpty());
        assertEquals(java.util.Collections.singletonList("left"),
                input.directions(7, 0f, 0f, -1f, 0f));
    }

    @Test
    public void joystickWindowConsumesAllActionsButMutatesOnlyMove() {
        assertTrue(KorriOverlayService.OverlayMotionInput.owns(
                InputDevice.SOURCE_JOYSTICK));
        assertTrue(KorriOverlayService.OverlayMotionInput.mutates(
                MotionEvent.ACTION_MOVE));
        assertFalse(KorriOverlayService.OverlayMotionInput.mutates(
                MotionEvent.ACTION_DOWN));
        assertFalse(KorriOverlayService.OverlayMotionInput.mutates(
                MotionEvent.ACTION_UP));
        assertFalse(KorriOverlayService.OverlayMotionInput.owns(
                InputDevice.SOURCE_TOUCHSCREEN));
    }

    @Test
    public void focusedWindowMotionEdgesAreIndependentPerController() {
        KorriOverlayService.OverlayMotionInput input =
                new KorriOverlayService.OverlayMotionInput();
        assertEquals(java.util.Collections.singletonList("down"),
                input.directions(7, 0f, 1f, 0f, 0f));
        assertEquals(java.util.Collections.singletonList("down"),
                input.directions(8, 0f, 1f, 0f, 0f));
        input.reset();
        assertEquals(java.util.Collections.singletonList("down"),
                input.directions(7, 0f, 1f, 0f, 0f));
    }

    @Test
    public void removedOverlayPassesGameplayInputThrough() {
        KorriOverlayService.OverlayInput.Decision decision =
                new KorriOverlayService.OverlayInput().route(
                        1, KeyEvent.KEYCODE_DPAD_LEFT, InputDevice.SOURCE_GAMEPAD,
                        KeyEvent.ACTION_DOWN, 0, false, false);
        assertFalse(decision.consumed());
        assertNull(decision.inputJson());
        assertFalse(decision.dismiss());
    }

    @Test
    public void heldPreOverlayMappedAndUnknownKeysRemainUnownedThroughRelease() {
        for (int keyCode : new int[] {
                KeyEvent.KEYCODE_BUTTON_A,
                KeyEvent.KEYCODE_BUTTON_X,
                KeyEvent.KEYCODE_BUTTON_12,
        }) {
            KorriOverlayService.OverlayInput input = new KorriOverlayService.OverlayInput();
            assertFalse(input.route(7, keyCode, InputDevice.SOURCE_GAMEPAD,
                    KeyEvent.ACTION_DOWN, 0, false, false).consumed());
            assertFalse(input.route(7, keyCode, InputDevice.SOURCE_GAMEPAD,
                    KeyEvent.ACTION_DOWN, 1, true, false).consumed());
            assertFalse(input.route(7, keyCode, InputDevice.SOURCE_GAMEPAD,
                    KeyEvent.ACTION_UP, 0, true, false).consumed());
        }
    }

    @Test
    public void nonGamepadKeysPassThroughWhileOverlayIsVisible() {
        for (int source : new int[] {
                InputDevice.SOURCE_KEYBOARD,
                InputDevice.SOURCE_TOUCHSCREEN,
        }) {
            for (int keyCode : new int[] {
                    KeyEvent.KEYCODE_DPAD_UP,
                    KeyEvent.KEYCODE_BUTTON_A,
                    KeyEvent.KEYCODE_BUTTON_X,
            }) {
                assertFalse(new KorriOverlayService.OverlayInput().route(
                        7, keyCode, source,
                        KeyEvent.ACTION_DOWN, 0, true, false).consumed());
            }
        }
    }

    @Test
    public void ownedKeyReleaseRemainsConsumedAfterOverlayCloses() {
        KorriOverlayService.OverlayInput input = new KorriOverlayService.OverlayInput();

        assertTrue(input.route(7, KeyEvent.KEYCODE_BACK, InputDevice.SOURCE_GAMEPAD,
                KeyEvent.ACTION_DOWN, 0, true, false).dismiss());
        KorriOverlayService.OverlayInput.Decision release = input.route(
                7, KeyEvent.KEYCODE_BACK, InputDevice.SOURCE_GAMEPAD,
                KeyEvent.ACTION_UP, 0, false, false);

        assertTrue(release.consumed());
        assertFalse(release.dismiss());
        assertFalse(input.route(7, KeyEvent.KEYCODE_BACK, InputDevice.SOURCE_GAMEPAD,
                KeyEvent.ACTION_UP, 0, false, false).consumed());
    }

    @Test
    public void ownershipIsPerDeviceAndConfirmRepeatHasNoDuplicateSemanticAction() {
        KorriOverlayService.OverlayInput input = new KorriOverlayService.OverlayInput();
        assertTrue(input.route(7, KeyEvent.KEYCODE_BUTTON_A, InputDevice.SOURCE_GAMEPAD,
                KeyEvent.ACTION_DOWN, 0, true, false).consumed());

        KorriOverlayService.OverlayInput.Decision repeat = input.route(
                7, KeyEvent.KEYCODE_BUTTON_A, InputDevice.SOURCE_GAMEPAD,
                KeyEvent.ACTION_DOWN, 2, true, false);
        assertTrue(repeat.consumed());
        assertNull(repeat.inputJson());
        assertFalse(input.route(8, KeyEvent.KEYCODE_BUTTON_A, InputDevice.SOURCE_GAMEPAD,
                KeyEvent.ACTION_UP, 0, true, false).consumed());
        assertTrue(input.route(7, KeyEvent.KEYCODE_BUTTON_A, InputDevice.SOURCE_GAMEPAD,
                KeyEvent.ACTION_UP, 0, false, true).consumed());
    }

    @Test
    public void factoryFailureAfterAttachCleansEveryResourceInReverseOnce() {
        KorriOverlayService.OverlayResources resources =
                new KorriOverlayService.OverlayResources();
        List<String> cleanup = new ArrayList<>();
        resources.add(() -> cleanup.add("web"));
        resources.add(() -> cleanup.add("root"));

        resources.destroy();
        resources.destroy();

        assertEquals(java.util.Arrays.asList("root", "web"), cleanup);
        assertTrue(resources.isDestroyed());
    }

    @Test
    public void neverReadyAndFatalBootstrapFailuresReturnInputOnce() {
        final Runnable[] scheduled = new Runnable[1];
        final int[] cancelCount = { 0 };
        final int[] fatalCount = { 0 };
        KorriOverlayService.BootstrapGuard timeout = new KorriOverlayService.BootstrapGuard(
                callback -> {
                    scheduled[0] = callback;
                    return () -> cancelCount[0]++;
                },
                () -> fatalCount[0]++);
        timeout.start();

        scheduled[0].run();
        timeout.fail();
        timeout.destroy();

        assertEquals(1, fatalCount[0]);
        assertEquals(1, cancelCount[0]);
    }

    @Test
    public void readyThenRendererLossTearsDownOnce() {
        final int[] cancelCount = { 0 };
        final int[] fatalCount = { 0 };
        KorriOverlayService.BootstrapGuard bootstrap =
                new KorriOverlayService.BootstrapGuard(
                        callback -> () -> cancelCount[0]++,
                        () -> fatalCount[0]++);
        bootstrap.start();

        bootstrap.ready();
        bootstrap.rendererLost();
        bootstrap.rendererLost();
        bootstrap.mainFrameFailed();
        bootstrap.destroy();

        assertEquals(1, cancelCount[0]);
        assertEquals(1, fatalCount[0]);
    }

    @Test
    public void readyThenMainFrameFailureTearsDownOnce() {
        final int[] cancelCount = { 0 };
        final int[] fatalCount = { 0 };
        KorriOverlayService.BootstrapGuard bootstrap =
                new KorriOverlayService.BootstrapGuard(
                        callback -> () -> cancelCount[0]++,
                        () -> fatalCount[0]++);
        bootstrap.start();

        bootstrap.ready();
        bootstrap.mainFrameFailed();
        bootstrap.mainFrameFailed();
        bootstrap.rendererLost();

        assertEquals(1, cancelCount[0]);
        assertEquals(1, fatalCount[0]);
    }

    @Test
    public void currentExactSessionRequestOpensOneHostIdempotentlyAndDismissesExactly() {
        RecordingWindowFactory factory = new RecordingWindowFactory();
        KorriOverlayService.WindowController windows =
                new KorriOverlayService.WindowController(factory);
        KorriOverlayService.StateMachine state = new KorriOverlayService.StateMachine(
                "com.simonwjackson.korri");
        state.updateSession(artemis(), true);
        state.updateForeground("com.simonwjackson.korri", "com.limelight.Game");
        RecordingRequestHost host = new RecordingRequestHost(state, windows);
        KorriOverlayHostExclusion owners = new KorriOverlayHostExclusion();
        KorriOverlayHostExclusion.Owner owner = owners.register(new InvisibleLegacyHost());
        KorriOverlayService.ProcessRequests requests =
                new KorriOverlayService.ProcessRequests(owners);
        requests.connect(host, new ImmediateDispatcher());

        assertEquals(KorriOverlayService.RequestResult.DELIVERED,
                requests.requestShow(owner, LAUNCH));
        assertEquals(KorriOverlayService.RequestResult.DELIVERED,
                requests.requestShow(owner, LAUNCH));
        assertTrue(windows.isVisible());
        assertEquals(1, factory.created.size());

        assertEquals(KorriOverlayService.RequestResult.REJECTED,
                requests.requestDismiss(owner, REPLACEMENT));
        assertTrue(windows.isVisible());
        assertEquals(KorriOverlayService.RequestResult.DELIVERED,
                requests.requestDismiss(owner, LAUNCH));
        assertFalse(windows.isVisible());
        assertEquals(1, factory.created.get(0).destroyCount);
    }

    @Test
    public void directStaleReplacementAndForegroundMismatchRequestsFailClosed() {
        assertRequestRejected(null, artemis(),
                "com.simonwjackson.korri", "com.limelight.Game");
        assertRequestRejected(REPLACEMENT, artemis(),
                "com.simonwjackson.korri", "com.limelight.Game");
        assertRequestRejected(LAUNCH, artemis(REPLACEMENT),
                "com.simonwjackson.korri", "com.limelight.Game");
        assertRequestRejected(LAUNCH, artemis(),
                "com.simonwjackson.korri", "com.limelight.KorriShellActivity");
    }

    @Test
    public void unavailableFallbackStillRejectsAStaleGameOwner() {
        KorriOverlayHostExclusion owners = new KorriOverlayHostExclusion();
        KorriOverlayHostExclusion.Owner staleOwner =
                owners.register(new InvisibleLegacyHost());
        KorriOverlayHostExclusion.Owner currentOwner =
                owners.register(new InvisibleLegacyHost());
        KorriOverlayService.ProcessRequests requests =
                new KorriOverlayService.ProcessRequests(owners);

        assertEquals(KorriOverlayService.RequestResult.REJECTED,
                requests.requestShow(staleOwner, LAUNCH));
        assertEquals(KorriOverlayService.RequestResult.UNAVAILABLE,
                requests.requestShow(currentOwner, LAUNCH));
    }

    @Test
    public void absentServiceIsUnavailableAndQueuedRequestCannotReachReplacement() {
        KorriOverlayHostExclusion owners = new KorriOverlayHostExclusion();
        KorriOverlayHostExclusion.Owner owner = owners.register(new InvisibleLegacyHost());
        KorriOverlayService.ProcessRequests requests =
                new KorriOverlayService.ProcessRequests(owners);
        assertEquals(KorriOverlayService.RequestResult.UNAVAILABLE,
                requests.requestShow(owner, LAUNCH));

        QueuedDispatcher dispatcher = new QueuedDispatcher();
        RecordingRequestHost stale = new RecordingRequestHost(
                armedState(artemis()), new KorriOverlayService.WindowController(
                        new RecordingWindowFactory()));
        RecordingRequestHost replacement = new RecordingRequestHost(
                armedState(artemis(REPLACEMENT)), new KorriOverlayService.WindowController(
                        new RecordingWindowFactory()));
        requests.connect(stale, dispatcher);
        assertEquals(KorriOverlayService.RequestResult.DELIVERED,
                requests.requestShow(owner, LAUNCH));
        assertEquals(0, stale.acceptRequests);
        assertEquals(0, stale.showRequests);

        requests.disconnect(stale);
        requests.connect(replacement, new ImmediateDispatcher());
        dispatcher.runQueued();
        assertEquals(0, stale.acceptRequests);
        assertEquals(0, stale.showRequests);
        assertEquals(0, replacement.acceptRequests);
        assertEquals(0, replacement.showRequests);
    }

    @Test
    public void workerThreadStaleGenerationIsRejectedOnlyAfterMainThreadDelivery() {
        KorriOverlayHostExclusion owners = new KorriOverlayHostExclusion();
        KorriOverlayHostExclusion.Owner staleOwner =
                owners.register(new InvisibleLegacyHost());
        owners.register(new InvisibleLegacyHost());
        QueuedDispatcher dispatcher = new QueuedDispatcher();
        RecordingRequestHost host = new RecordingRequestHost(
                armedState(artemis()), new KorriOverlayService.WindowController(
                        new RecordingWindowFactory()));
        KorriOverlayService.ProcessRequests requests =
                new KorriOverlayService.ProcessRequests(owners);
        requests.connect(host, dispatcher);

        assertEquals(KorriOverlayService.RequestResult.DELIVERED,
                requests.requestShow(staleOwner, LAUNCH));
        assertTrue(dispatcher.hasQueued());
        assertEquals(0, host.acceptRequests);
        dispatcher.runQueued();
        assertEquals(0, host.acceptRequests);
        assertEquals(0, host.showRequests);

        assertEquals(KorriOverlayService.RequestResult.DELIVERED,
                requests.requestDismiss(staleOwner, LAUNCH));
        assertTrue(dispatcher.hasQueued());
        assertEquals(0, host.acceptRequests);
        dispatcher.runQueued();
        assertEquals(0, host.acceptRequests);
        assertEquals(0, host.dismissRequests);
    }

    @Test
    public void gameReplacementAfterQueueRejectsRequestBeforeExecution() {
        KorriOverlayHostExclusion owners = new KorriOverlayHostExclusion();
        KorriOverlayHostExclusion.Owner owner = owners.register(new InvisibleLegacyHost());
        QueuedDispatcher dispatcher = new QueuedDispatcher();
        RecordingRequestHost host = new RecordingRequestHost(
                armedState(artemis()), new KorriOverlayService.WindowController(
                        new RecordingWindowFactory()));
        KorriOverlayService.ProcessRequests requests =
                new KorriOverlayService.ProcessRequests(owners);
        requests.connect(host, dispatcher);

        assertEquals(KorriOverlayService.RequestResult.DELIVERED,
                requests.requestShow(owner, LAUNCH));
        assertEquals(0, host.acceptRequests);
        owners.register(new InvisibleLegacyHost());
        dispatcher.runQueued();

        assertEquals(0, host.acceptRequests);
        assertEquals(0, host.showRequests);
    }

    @Test
    public void launchOrForegroundReplacementAfterQueueRejectsAtExecution() {
        for (boolean replaceLaunch : new boolean[] { false, true }) {
            KorriOverlayHostExclusion owners = new KorriOverlayHostExclusion();
            KorriOverlayHostExclusion.Owner owner =
                    owners.register(new InvisibleLegacyHost());
            KorriOverlayService.StateMachine state = armedState(artemis());
            QueuedDispatcher dispatcher = new QueuedDispatcher();
            RecordingRequestHost host = new RecordingRequestHost(
                    state, new KorriOverlayService.WindowController(
                            new RecordingWindowFactory()));
            KorriOverlayService.ProcessRequests requests =
                    new KorriOverlayService.ProcessRequests(owners);
            requests.connect(host, dispatcher);

            assertEquals(KorriOverlayService.RequestResult.DELIVERED,
                    requests.requestShow(owner, LAUNCH));
            if (replaceLaunch) {
                state.updateSession(artemis(REPLACEMENT), true);
            } else {
                state.updateForeground(
                        "com.simonwjackson.korri", "com.limelight.KorriShellActivity");
            }
            dispatcher.runQueued();

            assertEquals(0, host.showRequests);
        }
    }

    @Test
    public void productionWebViewTreatsMainFrameAndRendererLossAsFatal() throws Exception {
        String source = new String(java.nio.file.Files.readAllBytes(
                java.nio.file.Path.of(
                        "src/main/java/com/limelight/korri/overlay/KorriOverlayService.java")),
                java.nio.charset.StandardCharsets.UTF_8);

        assertTrue(source.contains(
                "if (request.isForMainFrame()) lifecycle.mainFrameFailed()"));
        assertTrue(source.contains("onRenderProcessGone"));
        assertTrue(source.contains("lifecycle.rendererLost();\n            return true;"));
        assertTrue(source.contains("if (fatalDuringCreate[0])"));
    }

    @Test
    public void productionOverlayClaimsAndroidFocusOnlyAfterAttachmentAndOnRestore()
            throws Exception {
        String source = new String(java.nio.file.Files.readAllBytes(
                java.nio.file.Path.of(
                        "src/main/java/com/limelight/korri/overlay/KorriOverlayService.java")),
                java.nio.charset.StandardCharsets.UTF_8);

        int focusable = source.indexOf("web.setFocusable(true);");
        int focusableInTouchMode = source.indexOf("web.setFocusableInTouchMode(true);");
        int addView = source.indexOf("windows.addView(root, params);");
        int cleanup = source.indexOf("resources.add(() -> {", addView);
        int initialFocus = source.indexOf("if (!web.requestFocus())", cleanup);
        int initialFailure = source.indexOf(
                "throw new IllegalStateException(\"overlay WebView could not claim Android focus\")",
                initialFocus);
        int loadUrl = source.indexOf("web.loadUrl(KorriOverlayBridge.OVERLAY_URL);", initialFailure);

        assertOrdered(focusable, focusableInTouchMode, addView, cleanup,
                initialFocus, initialFailure, loadUrl);
        assertFalse(source.substring(0, addView).contains("web.requestFocus()"));

        int restore = source.indexOf("public void restoreAfterFailure()", initialFocus);
        int restoreEnd = source.indexOf("public void destroy()", restore);
        String restoreBody = source.substring(restore, restoreEnd);
        assertOrdered(
                restoreBody.indexOf("windows.updateViewLayout(root, params);"),
                restoreBody.indexOf("root.setVisibility(View.VISIBLE);"),
                restoreBody.indexOf("if (!web.requestFocus()) fatal.run();"));
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

        windows.preDismiss();
        windows.preDismiss();
        assertTrue(windows.isPreDismissed());
        assertEquals(1, factory.created.get(0).preDismissCount);
        windows.refreshAuthority();
        assertEquals(1, factory.created.get(0).refreshCount);
        windows.restoreAfterFailure();
        assertFalse(windows.isPreDismissed());
        assertEquals(1, factory.created.get(0).restoreCount);

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

    private static void assertInput(
            KorriOverlayService.OverlayInput input,
            int keyCode, String json, boolean dismiss) {
        assertInput(input, keyCode, json, dismiss, 0);
    }

    private static void assertInput(
            KorriOverlayService.OverlayInput input,
            int keyCode, String json, boolean dismiss, int repeatCount) {
        if (repeatCount > 0) {
            input.route(1, keyCode, InputDevice.SOURCE_GAMEPAD,
                    KeyEvent.ACTION_DOWN, 0, true, false);
        }
        KorriOverlayService.OverlayInput.Decision decision = input.route(
                1, keyCode, InputDevice.SOURCE_GAMEPAD,
                KeyEvent.ACTION_DOWN, repeatCount, true, false);
        assertTrue(decision.consumed());
        assertEquals(json, decision.inputJson());
        assertEquals(dismiss, decision.dismiss());
    }

    private static void assertOrdered(int... positions) {
        int previous = -1;
        for (int position : positions) {
            assertTrue("missing or out-of-order source contract step", position > previous);
            previous = position;
        }
    }

    private static void assertRequestRejected(
            String requestedLaunchId,
            KorriActiveLaunch activeLaunch,
            String foregroundPackage,
            String foregroundClass) {
        RecordingWindowFactory factory = new RecordingWindowFactory();
        KorriOverlayService.StateMachine state = new KorriOverlayService.StateMachine(
                "com.simonwjackson.korri");
        state.updateSession(activeLaunch, true);
        state.updateForeground(foregroundPackage, foregroundClass);
        KorriOverlayHostExclusion owners = new KorriOverlayHostExclusion();
        KorriOverlayHostExclusion.Owner owner = owners.register(new InvisibleLegacyHost());
        KorriOverlayService.ProcessRequests requests =
                new KorriOverlayService.ProcessRequests(owners);
        requests.connect(
                new RecordingRequestHost(state,
                        new KorriOverlayService.WindowController(factory)),
                new ImmediateDispatcher());

        assertEquals(KorriOverlayService.RequestResult.REJECTED,
                requests.requestShow(owner, requestedLaunchId));
        assertEquals(0, factory.created.size());
    }

    private static KorriOverlayService.StateMachine armedState(KorriActiveLaunch launch) {
        KorriOverlayService.StateMachine state = new KorriOverlayService.StateMachine(
                "com.simonwjackson.korri");
        state.updateSession(launch, true);
        state.updateForeground("com.simonwjackson.korri", "com.limelight.Game");
        return state;
    }

    private static final class ImmediateDispatcher
            implements KorriOverlayService.MainDispatcher {
        @Override public boolean isMainThread() { return true; }
        @Override public void post(Runnable request) { request.run(); }
    }

    private static final class QueuedDispatcher
            implements KorriOverlayService.MainDispatcher {
        private Runnable queued;
        @Override public boolean isMainThread() { return false; }
        @Override public void post(Runnable request) { queued = request; }
        boolean hasQueued() { return queued != null; }
        void runQueued() {
            Runnable request = queued;
            queued = null;
            request.run();
        }
    }

    private static final class InvisibleLegacyHost
            implements KorriOverlayHostExclusion.LegacyHost {
        @Override public boolean isVisible() { return false; }
        @Override public void closeAndDestroy() { }
    }

    private static final class RecordingRequestHost
            implements KorriOverlayService.RequestHost {
        private final KorriOverlayService.StateMachine state;
        private final KorriOverlayService.WindowController windows;
        int acceptRequests;
        int showRequests;
        int dismissRequests;

        RecordingRequestHost(
                KorriOverlayService.StateMachine state,
                KorriOverlayService.WindowController windows) {
            this.state = state;
            this.windows = windows;
        }

        @Override
        public boolean accepts(
                KorriOverlayHostExclusion.Owner owner, String launchId) {
            acceptRequests++;
            return state.acceptsRequest(launchId);
        }

        @Override
        public boolean requestShow(
                KorriOverlayHostExclusion.Owner owner, String launchId) {
            showRequests++;
            boolean accepted = state.requestShow(launchId);
            windows.setVisible(state.isShowing());
            state.updateOverlayVisibility(windows.isVisible());
            return accepted;
        }

        @Override
        public boolean requestDismiss(
                KorriOverlayHostExclusion.Owner owner, String launchId) {
            dismissRequests++;
            boolean accepted = state.requestDismiss(launchId);
            windows.setVisible(state.isShowing());
            state.updateOverlayVisibility(windows.isVisible());
            return accepted;
        }
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
        int preDismissCount;
        int restoreCount;
        int destroyCount;

        @Override
        public void sendInput(String inputJson) {}

        @Override
        public void refreshAuthority() {
            refreshCount++;
        }

        @Override
        public boolean preDismiss() {
            preDismissCount++;
            return true;
        }

        @Override
        public void restoreAfterFailure() {
            restoreCount++;
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
