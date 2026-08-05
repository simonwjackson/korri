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
                        LAUNCH, "not-registered",
                        KorriMoonlightActionExecutor.Effect.DISCONNECT)));
        String generation = coordinator.register(LAUNCH, executor);
        assertTrue(generation != null);
        assertTrue(coordinator.unregister(LAUNCH, generation, executor));
        assertEquals(KorriMoonlightActionExecutor.Outcome.UNAVAILABLE,
                coordinator.execute(KorriMoonlightActionExecutor.Request.command(
                        LAUNCH, generation,
                        KorriMoonlightActionExecutor.Effect.DISCONNECT)));
        assertEquals(LAUNCH + ":" + generation, publication.cleared.get(0));
    }

    @Test
    public void sameLaunchReplacementGetsNewGenerationAndRejectsOldTerminalInstructions()
            throws Exception {
        RecordingPublication publication = new RecordingPublication();
        KorriMoonlightActionCoordinator coordinator =
                new KorriMoonlightActionCoordinator(publication);
        RecordingActions first = new RecordingActions();
        RecordingActions replacement = new RecordingActions();
        KorriMoonlightActionExecutor executorA = executor(first);
        KorriMoonlightActionExecutor executorB = executor(replacement);

        String generationA = coordinator.register(LAUNCH, executorA);
        String generationB = coordinator.register(LAUNCH, executorB);
        assertFalse(generationA.equals(generationB));
        assertFalse(coordinator.unregister(LAUNCH, generationA, executorA));
        for (KorriMoonlightActionExecutor.Effect terminal : new KorriMoonlightActionExecutor.Effect[] {
                KorriMoonlightActionExecutor.Effect.DISCONNECT,
                KorriMoonlightActionExecutor.Effect.QUIT_HOST,
        }) {
            assertEquals(KorriMoonlightActionExecutor.Outcome.STALE,
                    coordinator.execute(KorriMoonlightActionExecutor.Request.command(
                            LAUNCH, generationA, terminal)));
        }
        assertEquals(KorriMoonlightActionExecutor.Outcome.EXECUTED,
                coordinator.execute(KorriMoonlightActionExecutor.Request.command(
                        LAUNCH, generationB,
                        KorriMoonlightActionExecutor.Effect.TOGGLE_KEYBOARD)));

        assertTrue(first.calls.isEmpty());
        assertEquals(java.util.Collections.singletonList("keyboard"), replacement.calls);
        assertTrue(publication.cleared.isEmpty());
        assertEquals(generationA,
                new JSONObject(publication.states.get(0)).getString("generation"));
        assertEquals(generationB,
                new JSONObject(publication.states.get(1)).getString("generation"));
    }

    @Test
    public void queuedOldTerminalEffectRechecksGenerationOnUiThread() {
        RecordingPublication publication = new RecordingPublication();
        KorriMoonlightActionCoordinator coordinator =
                new KorriMoonlightActionCoordinator(publication);
        RecordingActions first = new RecordingActions();
        KorriMoonlightActionExecutorTest.QueuedUiDispatcher queued =
                new KorriMoonlightActionExecutorTest.QueuedUiDispatcher();
        KorriMoonlightActionExecutor executorA =
                new KorriMoonlightActionExecutor(first, queued);
        queued.markCurrentUiThread();
        String generationA = coordinator.register(LAUNCH, executorA);
        RecordingActions replacement = new RecordingActions();
        KorriMoonlightActionExecutor executorB = executor(replacement);

        final KorriMoonlightActionExecutor.Outcome[] outcome = { null };
        Thread worker = new Thread(() -> outcome[0] = coordinator.execute(
                KorriMoonlightActionExecutor.Request.command(
                        LAUNCH, generationA,
                        KorriMoonlightActionExecutor.Effect.DISCONNECT)));
        worker.start();
        queued.awaitQueued();
        String generationB = coordinator.register(LAUNCH, executorB);
        assertFalse(generationA.equals(generationB));
        queued.drainOnTestUiThread();
        try {
            worker.join(1000);
        } catch (InterruptedException error) {
            throw new AssertionError(error);
        }

        assertEquals(KorriMoonlightActionExecutor.Outcome.STALE, outcome[0]);
        assertTrue(first.calls.isEmpty());
        assertTrue(replacement.calls.isEmpty());
    }

    @Test
    public void executedEffectSurvivesStatePublicationFailureAndCommandsSkipRefresh() {
        RecordingPublication publication = new RecordingPublication();
        KorriMoonlightActionCoordinator coordinator =
                new KorriMoonlightActionCoordinator(publication);
        RecordingActions actions = new RecordingActions();
        String generation = coordinator.register(LAUNCH, executor(actions));
        publication.failPublish = true;

        assertEquals(KorriMoonlightActionExecutor.Outcome.EXECUTED,
                coordinator.execute(KorriMoonlightActionExecutor.Request.toggle(
                        LAUNCH, generation,
                        KorriMoonlightActionExecutor.Effect.SET_FILL_MODE, true)));
        assertEquals(java.util.Collections.singletonList("fill:true"), actions.calls);
        assertEquals(java.util.Collections.singletonList(LAUNCH + ":" + generation),
                publication.cleared);

        publication.cleared.clear();
        assertEquals(KorriMoonlightActionExecutor.Outcome.EXECUTED,
                coordinator.execute(KorriMoonlightActionExecutor.Request.command(
                        LAUNCH, generation,
                        KorriMoonlightActionExecutor.Effect.TOGGLE_KEYBOARD)));
        assertTrue(publication.cleared.isEmpty());
    }

    @Test
    public void overlayOpeningRepublishesExternallyMutatedLiveValues() throws Exception {
        RecordingPublication publication = new RecordingPublication();
        KorriMoonlightActionCoordinator coordinator =
                new KorriMoonlightActionCoordinator(publication);
        RecordingActions actions = new RecordingActions();
        coordinator.register(LAUNCH, executor(actions));

        actions.fill = true;
        assertTrue(coordinator.republish(LAUNCH));

        JSONObject state = new JSONObject(publication.states.get(1));
        JSONObject fill = state.getJSONArray("effects").getJSONObject(4);
        assertEquals("set-fill-mode", fill.getString("effect"));
        assertTrue(fill.getJSONObject("value").getBoolean("value"));
    }

    @Test
    public void foreignLaunchCannotReachCurrentExecutor() {
        RecordingActions actions = new RecordingActions();
        KorriMoonlightActionCoordinator coordinator =
                new KorriMoonlightActionCoordinator(new RecordingPublication());
        String generation = coordinator.register(LAUNCH, executor(actions));

        assertEquals(KorriMoonlightActionExecutor.Outcome.STALE,
                coordinator.execute(KorriMoonlightActionExecutor.Request.command(
                        "fedcba9876543210fedcba9876543210", generation,
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
        boolean failPublish;

        @Override
        public boolean publish(String stateJson) {
            states.add(stateJson);
            return !failPublish;
        }

        @Override
        public boolean clear(String launchId, String generation) {
            cleared.add(launchId + ":" + generation);
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
        final java.util.Set<KorriMoonlightActionExecutor.Effect> unavailable =
                new java.util.HashSet<>();

        @Override public boolean available(KorriMoonlightActionExecutor.Effect effect) {
            return !unavailable.contains(effect);
        }
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
