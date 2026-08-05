package com.limelight.korri.moonlight;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

import java.util.ArrayList;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

@RunWith(RobolectricTestRunner.class)
public class KorriMoonlightActionCoordinatorTest {
    private static final String LAUNCH = "0123456789abcdef0123456789abcdef";

    @Test
    public void unavailableBeforeRegistrationAndAfterIdentityClear() {
        RecordingPublication publication = new RecordingPublication();
        KorriMoonlightActionCoordinator coordinator =
                new KorriMoonlightActionCoordinator(publication);
        KorriMoonlightActionExecutor executor = executor(new RecordingActions());

        assertEquals(KorriMoonlightActionExecutor.Outcome.UNAVAILABLE,
                coordinator.execute(KorriMoonlightActionExecutor.Request.command(
                        LAUNCH, KorriMoonlightActionExecutor.Effect.DISCONNECT)));
        assertTrue(coordinator.register(LAUNCH, executor));
        assertTrue(coordinator.unregister(LAUNCH, executor));
        assertEquals(KorriMoonlightActionExecutor.Outcome.UNAVAILABLE,
                coordinator.execute(KorriMoonlightActionExecutor.Request.command(
                        LAUNCH, KorriMoonlightActionExecutor.Effect.DISCONNECT)));
        assertEquals(LAUNCH, publication.cleared.get(0));
    }

    @Test
    public void sameLaunchReplacementSurvivesOldLateUnregister() {
        RecordingPublication publication = new RecordingPublication();
        KorriMoonlightActionCoordinator coordinator =
                new KorriMoonlightActionCoordinator(publication);
        RecordingActions first = new RecordingActions();
        RecordingActions replacement = new RecordingActions();
        KorriMoonlightActionExecutor executorA = executor(first);
        KorriMoonlightActionExecutor executorB = executor(replacement);

        assertTrue(coordinator.register(LAUNCH, executorA));
        assertTrue(coordinator.register(LAUNCH, executorB));
        assertFalse(coordinator.unregister(LAUNCH, executorA));
        assertEquals(KorriMoonlightActionExecutor.Outcome.EXECUTED,
                coordinator.execute(KorriMoonlightActionExecutor.Request.command(
                        LAUNCH, KorriMoonlightActionExecutor.Effect.TOGGLE_KEYBOARD)));

        assertTrue(first.calls.isEmpty());
        assertEquals(java.util.Collections.singletonList("keyboard"), replacement.calls);
        assertTrue(publication.cleared.isEmpty());
    }

    @Test
    public void foreignLaunchCannotReachCurrentExecutor() {
        RecordingActions actions = new RecordingActions();
        KorriMoonlightActionCoordinator coordinator =
                new KorriMoonlightActionCoordinator(new RecordingPublication());
        coordinator.register(LAUNCH, executor(actions));

        assertEquals(KorriMoonlightActionExecutor.Outcome.STALE,
                coordinator.execute(KorriMoonlightActionExecutor.Request.command(
                        "fedcba9876543210fedcba9876543210",
                        KorriMoonlightActionExecutor.Effect.DISCONNECT)));
        assertTrue(actions.calls.isEmpty());
    }

    private static KorriMoonlightActionExecutor executor(RecordingActions actions) {
        return new KorriMoonlightActionExecutor(actions, new ImmediateUiDispatcher());
    }

    private static final class RecordingPublication
            implements KorriMoonlightActionCoordinator.Publication {
        final List<String> states = new ArrayList<>();
        final List<String> cleared = new ArrayList<>();

        @Override
        public boolean publish(String stateJson) {
            states.add(stateJson);
            return true;
        }

        @Override
        public boolean clear(String launchId) {
            cleared.add(launchId);
            return true;
        }
    }

    static final class ImmediateUiDispatcher
            implements KorriMoonlightActionExecutor.UiDispatcher {
        @Override
        public boolean isUiThread() {
            return true;
        }

        @Override
        public void dispatch(Runnable action) {
            action.run();
        }
    }

    static final class RecordingActions implements KorriMoonlightActionExecutor.Actions {
        final List<String> calls = new ArrayList<>();
        boolean fill;
        boolean zoom;
        String mouseMode = "0";
        boolean localCursor;
        int sharpness = 20;
        int threshold = 8;
        boolean faceFlip;
        boolean rumble = true;
        boolean pip;

        @Override public boolean fillMode() { return fill; }
        @Override public void setFillMode(boolean value) { fill = value; calls.add("fill:" + value); }
        @Override public boolean zoomMode() { return zoom; }
        @Override public void setZoomMode(boolean value) { zoom = value; calls.add("zoom:" + value); }
        @Override public String mouseMode() { return mouseMode; }
        @Override public void setMouseMode(String value) { mouseMode = value; calls.add("mouse:" + value); }
        @Override public boolean localCursor() { return localCursor; }
        @Override public void toggleLocalCursor() { localCursor = !localCursor; calls.add("cursor"); }
        @Override public int sgsrSharpness() { return sharpness; }
        @Override public void setSgsrSharpness(int value) { sharpness = value; calls.add("sharpness:" + value); }
        @Override public int sgsrEdgeThreshold() { return threshold; }
        @Override public void setSgsrEdgeThreshold(int value) { threshold = value; calls.add("threshold:" + value); }
        @Override public boolean faceButtonFlip() { return faceFlip; }
        @Override public void setFaceButtonFlip(boolean value) { faceFlip = value; calls.add("face:" + value); }
        @Override public boolean rumble() { return rumble; }
        @Override public void setRumble(boolean value) { rumble = value; calls.add("rumble:" + value); }
        @Override public boolean pictureInPicture() { return pip; }
        @Override public void setPictureInPicture(boolean value) { pip = value; calls.add("pip:" + value); }
        @Override public void disconnect() { calls.add("disconnect"); }
        @Override public void quitHost() { calls.add("quit"); }
        @Override public void toggleKeyboard() { calls.add("keyboard"); }
        @Override public void toggleFullKeyboard() { calls.add("full-keyboard"); }
        @Override public void rotateScreen() { calls.add("rotate"); }
        @Override public void toggleHud() { calls.add("hud"); }
        @Override public void toggleFloatingMenu() { calls.add("floating"); }
        @Override public void toggleKeyboardController() { calls.add("keyboard-controller"); }
        @Override public void switchTouchSensitivity() { calls.add("touch-sensitivity"); }
    }
}
