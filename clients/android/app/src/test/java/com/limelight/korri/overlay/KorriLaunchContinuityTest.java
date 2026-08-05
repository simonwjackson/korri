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
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

@RunWith(RobolectricTestRunner.class)
public class KorriLaunchContinuityTest {
    private static final String LAUNCH_A = "0123456789abcdef0123456789abcdef";
    private static final String LAUNCH_B = "fedcba9876543210fedcba9876543210";

    @Test
    public void eventBeforePublicationAndUnavailableInspectionRetryInitialBinding() {
        ConfigurableInspector inspector = new ConfigurableInspector();
        ManualScheduler scheduler = new ManualScheduler();
        RecordingEnd end = new RecordingEnd();
        KorriLaunchContinuity continuity = new KorriLaunchContinuity(inspector, scheduler, end, 4);
        KorriLaunchContinuity.ProcessIdentity original =
                process(41, 10041, "org.example.game", "org.example.game");

        continuity.updateForeground("org.example.game", "org.example.game.Game");
        assertEquals(0, scheduler.pending());
        continuity.updateSession(external(LAUNCH_A, "org.example.game"));
        assertEquals(1, scheduler.pending());

        inspector.add(KorriLaunchContinuity.ProcessObservation.unavailable());
        scheduler.runNext();
        assertEquals(1, scheduler.pending());
        inspector.add(complete(original));
        scheduler.runNext();

        assertTrue(continuity.hasBoundIdentity(LAUNCH_A, 41));
        assertEquals(0, scheduler.pending());
        assertEquals(Collections.emptyList(), end.launchIds);
    }

    @Test
    public void delayedDeathClearsOnlyAfterExactBoundProcessDisappears() {
        ConfigurableInspector inspector = new ConfigurableInspector();
        ManualScheduler scheduler = new ManualScheduler();
        RecordingEnd end = new RecordingEnd();
        KorriLaunchContinuity continuity = new KorriLaunchContinuity(inspector, scheduler, end, 5);
        KorriLaunchContinuity.ProcessIdentity original =
                process(41, 10041, "org.example.game", "org.example.game");
        KorriLaunchContinuity.ProcessIdentity replacement =
                process(57, 10041, "org.example.game", "org.example.game");

        continuity.updateSession(external(LAUNCH_A, "org.example.game"));
        continuity.updateForeground("org.example.game", "org.example.game.Game");
        inspector.add(complete(original));
        scheduler.runNext();
        continuity.updateForeground(
                "com.simonwjackson.korri", "com.limelight.KorriShellActivity");

        inspector.add(KorriLaunchContinuity.ProcessObservation.unavailable());
        scheduler.runNext();
        inspector.add(complete(original));
        scheduler.runNext();
        assertEquals(Collections.emptyList(), end.launchIds);
        inspector.add(complete(replacement));
        scheduler.runNext();

        assertEquals(Collections.singletonList(LAUNCH_A), end.launchIds);
        assertEquals(0, scheduler.pending());
    }

    @Test
    public void suspendedExactProcessPollingStopsAtMaxChecksWithoutClaimingEnd() {
        ConfigurableInspector inspector = new ConfigurableInspector();
        ManualScheduler scheduler = new ManualScheduler();
        RecordingEnd end = new RecordingEnd();
        KorriLaunchContinuity continuity = new KorriLaunchContinuity(inspector, scheduler, end, 3);
        KorriLaunchContinuity.ProcessIdentity original =
                process(41, 10041, "org.example.game", "org.example.game");

        continuity.updateSession(external(LAUNCH_A, "org.example.game"));
        continuity.updateForeground("org.example.game", "org.example.game.Game");
        inspector.add(complete(original));
        scheduler.runNext();
        continuity.updateForeground("org.example.other", "org.example.other.Main");

        inspector.add(complete(original));
        inspector.add(complete(original));
        inspector.add(complete(original));
        scheduler.runNext();
        assertEquals(1, scheduler.pending());
        scheduler.runNext();
        assertEquals(1, scheduler.pending());
        scheduler.runNext();

        assertEquals(4, inspector.inspections);
        assertTrue(continuity.hasBoundIdentity(LAUNCH_A, 41));
        assertEquals(Collections.emptyList(), end.launchIds);
        assertEquals(0, scheduler.pending());
    }

    @Test
    public void laterForegroundMismatchStartsFreshBoundedDeathObservation() {
        ConfigurableInspector inspector = new ConfigurableInspector();
        ManualScheduler scheduler = new ManualScheduler();
        RecordingEnd end = new RecordingEnd();
        KorriLaunchContinuity continuity = new KorriLaunchContinuity(inspector, scheduler, end, 2);
        KorriLaunchContinuity.ProcessIdentity original =
                process(41, 10041, "org.example.game", "org.example.game");

        continuity.updateSession(external(LAUNCH_A, "org.example.game"));
        continuity.updateForeground("org.example.game", "org.example.game.Game");
        inspector.add(complete(original));
        scheduler.runNext();
        continuity.updateForeground("org.example.other", "org.example.other.Main");
        inspector.add(complete(original));
        inspector.add(complete(original));
        scheduler.runAll();
        assertEquals(0, scheduler.pending());
        assertEquals(Collections.emptyList(), end.launchIds);

        continuity.updateForeground("com.android.launcher", "com.android.launcher3.Launcher");
        assertEquals(1, scheduler.pending());
        inspector.add(complete());
        scheduler.runNext();

        assertEquals(Collections.singletonList(LAUNCH_A), end.launchIds);
        assertEquals(0, scheduler.pending());
    }

    @Test
    public void replacementCancelsOlderCallbacksAndBindsOnlyFreshLaunch() {
        ConfigurableInspector inspector = new ConfigurableInspector();
        ManualScheduler scheduler = new ManualScheduler();
        RecordingEnd end = new RecordingEnd();
        KorriLaunchContinuity continuity = new KorriLaunchContinuity(inspector, scheduler, end, 4);
        KorriLaunchContinuity.ProcessIdentity original =
                process(10, 1010, "org.example.a", "org.example.a");

        continuity.updateSession(external(LAUNCH_A, "org.example.a"));
        continuity.updateForeground("org.example.a", "org.example.a.Game");
        inspector.add(complete(original));
        scheduler.runNext();
        continuity.updateForeground("org.example.other", "org.example.other.Main");
        assertEquals(1, scheduler.pending());

        continuity.updateSession(external(LAUNCH_B, "org.example.b"));
        assertEquals(0, scheduler.pending());
        continuity.updateForeground("org.example.b", "org.example.b.Game");
        inspector.add(complete(process(20, 2020, "org.example.b", "org.example.b")));
        scheduler.runNext();

        assertEquals(Collections.emptyList(), end.launchIds);
        assertFalse(continuity.hasBoundIdentity(LAUNCH_A, 10));
        assertTrue(continuity.hasBoundIdentity(LAUNCH_B, 20));
    }

    @Test
    public void destructionCancelsSuspendedObservationAndIdleSessionsDoNotPoll() {
        ConfigurableInspector inspector = new ConfigurableInspector();
        ManualScheduler scheduler = new ManualScheduler();
        RecordingEnd end = new RecordingEnd();
        KorriLaunchContinuity continuity = new KorriLaunchContinuity(inspector, scheduler, end, 3);
        KorriLaunchContinuity.ProcessIdentity original =
                process(41, 10041, "org.example.game", "org.example.game");

        continuity.updateForeground("org.example.game", "org.example.game.Game");
        continuity.updateSession(external(LAUNCH_A, "org.example.game"));
        inspector.add(complete(original));
        scheduler.runNext();
        continuity.updateForeground("org.example.other", "org.example.other.Main");
        assertEquals(1, scheduler.pending());
        continuity.destroy();

        assertEquals(0, scheduler.pending());
        scheduler.runAll();
        assertEquals(1, inspector.inspections);
        assertEquals(Collections.emptyList(), end.launchIds);
        continuity.updateSession(null);
        continuity.updateForeground("org.example.game", "org.example.game.Game");
        assertEquals(0, scheduler.pending());
    }

    @Test
    public void initialBindingRetriesAreBoundedWhileInspectorStaysUnavailable() {
        ConfigurableInspector inspector = new ConfigurableInspector();
        ManualScheduler scheduler = new ManualScheduler();
        KorriLaunchContinuity continuity =
                new KorriLaunchContinuity(inspector, scheduler, launchId -> {}, 3);

        continuity.updateForeground("org.example.game", "org.example.game.Game");
        continuity.updateSession(external(LAUNCH_A, "org.example.game"));
        inspector.add(KorriLaunchContinuity.ProcessObservation.unavailable());
        inspector.add(KorriLaunchContinuity.ProcessObservation.unavailable());
        inspector.add(KorriLaunchContinuity.ProcessObservation.unavailable());
        scheduler.runAll();

        assertEquals(3, inspector.inspections);
        assertEquals(0, scheduler.pending());
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
        int inspections;

        void add(KorriLaunchContinuity.ProcessObservation observation) {
            observations.addLast(observation);
        }

        @Override
        public KorriLaunchContinuity.ProcessObservation inspect() {
            inspections++;
            return observations.removeFirst();
        }
    }

    private static final class ManualScheduler implements KorriLaunchContinuity.Scheduler {
        private final Deque<ScheduledCallback> callbacks = new ArrayDeque<>();

        @Override
        public KorriLaunchContinuity.Cancellable schedule(Runnable callback) {
            ScheduledCallback scheduled = new ScheduledCallback(callback);
            callbacks.addLast(scheduled);
            return scheduled;
        }

        void runNext() {
            while (!callbacks.isEmpty()) {
                ScheduledCallback callback = callbacks.removeFirst();
                if (!callback.cancelled) {
                    callback.callback.run();
                    return;
                }
            }
        }

        void runAll() {
            while (pending() > 0) runNext();
        }

        int pending() {
            int pending = 0;
            for (ScheduledCallback callback : callbacks) {
                if (!callback.cancelled) pending++;
            }
            return pending;
        }
    }

    private static final class ScheduledCallback implements KorriLaunchContinuity.Cancellable {
        final Runnable callback;
        boolean cancelled;

        ScheduledCallback(Runnable callback) {
            this.callback = callback;
        }

        @Override
        public void cancel() {
            cancelled = true;
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
