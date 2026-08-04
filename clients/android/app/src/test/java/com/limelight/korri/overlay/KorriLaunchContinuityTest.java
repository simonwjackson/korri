package com.limelight.korri.overlay;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

import java.util.ArrayDeque;
import java.util.Arrays;
import java.util.Collections;
import java.util.Deque;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

@RunWith(RobolectricTestRunner.class)
public class KorriLaunchContinuityTest {
    private static final String LAUNCH_A = "0123456789abcdef0123456789abcdef";
    private static final String LAUNCH_B = "fedcba9876543210fedcba9876543210";

    @Test
    public void eventThenDelayedDeathClearsExactLaunchAndDifferentDirectRelaunchCannotRearmIt() {
        ConfigurableInspector inspector = new ConfigurableInspector();
        ManualScheduler scheduler = new ManualScheduler();
        RecordingEnd end = new RecordingEnd();
        KorriLaunchContinuity continuity = new KorriLaunchContinuity(inspector, scheduler, end, 4);
        KorriActiveLaunch launch = external(LAUNCH_A, "org.example.game");
        KorriLaunchContinuity.ProcessIdentity original = process(41, 10041, "org.example.game", "org.example.game");
        KorriLaunchContinuity.ProcessIdentity replacement = process(57, 10041, "org.example.game", "org.example.game");

        inspector.add(complete(original));
        continuity.updateSession(launch);
        continuity.updateForeground("org.example.game", "org.example.game.Game");

        continuity.updateForeground("com.simonwjackson.korri", "com.limelight.KorriShellActivity");
        inspector.add(KorriLaunchContinuity.ProcessObservation.unavailable());
        scheduler.runNext();
        assertEquals(Collections.emptyList(), end.launchIds);

        inspector.add(complete(replacement));
        scheduler.runNext();
        assertEquals(Collections.singletonList(LAUNCH_A), end.launchIds);

        continuity.updateForeground("org.example.game", "org.example.game.Game");
        assertEquals(0, scheduler.pending());
    }

    @Test
    public void lateDeathCheckForOlderLaunchCannotClearReplacementLaunch() {
        ConfigurableInspector inspector = new ConfigurableInspector();
        ManualScheduler scheduler = new ManualScheduler();
        RecordingEnd end = new RecordingEnd();
        KorriLaunchContinuity continuity = new KorriLaunchContinuity(inspector, scheduler, end, 4);
        KorriActiveLaunch launchA = external(LAUNCH_A, "org.example.a");
        KorriActiveLaunch launchB = external(LAUNCH_B, "org.example.b");

        inspector.add(complete(process(10, 1010, "org.example.a", "org.example.a")));
        continuity.updateSession(launchA);
        continuity.updateForeground("org.example.a", "org.example.a.Game");
        continuity.updateForeground("com.simonwjackson.korri", "com.limelight.KorriShellActivity");

        inspector.add(complete(process(20, 2020, "org.example.b", "org.example.b")));
        continuity.updateSession(launchB);
        continuity.updateForeground("org.example.b", "org.example.b.Game");
        scheduler.runNext();

        assertEquals(Collections.emptyList(), end.launchIds);
        assertTrue(continuity.hasBoundIdentity(LAUNCH_B, 20));
    }

    private static KorriActiveLaunch external(String launchId, String packageName) {
        return KorriActiveLaunch.packageLaunch(
                launchId, "game", "Game", packageName, "@korri:android-app/android-app");
    }

    private static KorriLaunchContinuity.ProcessIdentity process(
            int pid, int uid, String processName, String packageName) {
        return new KorriLaunchContinuity.ProcessIdentity(pid, uid, processName, packageName);
    }

    private static KorriLaunchContinuity.ProcessObservation complete(
            KorriLaunchContinuity.ProcessIdentity... identities) {
        return KorriLaunchContinuity.ProcessObservation.complete(Arrays.asList(identities));
    }

    private static final class ConfigurableInspector implements KorriLaunchContinuity.ProcessInspector {
        private final Deque<KorriLaunchContinuity.ProcessObservation> observations = new ArrayDeque<>();

        void add(KorriLaunchContinuity.ProcessObservation observation) {
            observations.addLast(observation);
        }

        @Override
        public KorriLaunchContinuity.ProcessObservation inspect() {
            return observations.removeFirst();
        }
    }

    private static final class ManualScheduler implements KorriLaunchContinuity.Scheduler {
        private final Deque<Runnable> callbacks = new ArrayDeque<>();

        @Override
        public void schedule(Runnable callback) {
            callbacks.addLast(callback);
        }

        void runNext() {
            callbacks.removeFirst().run();
        }

        int pending() {
            return callbacks.size();
        }
    }

    private static final class RecordingEnd implements KorriLaunchContinuity.EndLaunch {
        final List<String> launchIds = new java.util.ArrayList<>();

        @Override
        public void clear(String launchId) {
            launchIds.add(launchId);
        }
    }
}
