package com.limelight.korri.overlay;

import org.junit.Test;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

import static org.junit.Assert.assertEquals;

public class KorriActiveSessionMonitorTest {
    private static final String LAUNCH_A = "0123456789abcdef0123456789abcdef";
    private static final String LAUNCH_B = "fedcba9876543210fedcba9876543210";

    @Test
    public void eventBeforePublicationIsReconciledWithinBoundedChecks() {
        SessionSource source = new SessionSource();
        ManualScheduler scheduler = new ManualScheduler();
        List<KorriActiveLaunch> observed = new ArrayList<>();
        KorriActiveSessionMonitor monitor =
                new KorriActiveSessionMonitor(source, observed::add, scheduler, 3);

        monitor.watchForPublication();
        scheduler.runNext();
        source.launch = external(LAUNCH_A, "org.example.a");
        scheduler.runNext();

        assertEquals(1, observed.size());
        assertEquals(LAUNCH_A, observed.get(0).launchId());
        assertEquals(0, scheduler.pending());
    }

    @Test
    public void replacementWatchCancelsOlderGenerationAndPublishesCurrentIdentity() {
        SessionSource source = new SessionSource();
        ManualScheduler scheduler = new ManualScheduler();
        List<KorriActiveLaunch> observed = new ArrayList<>();
        KorriActiveSessionMonitor monitor =
                new KorriActiveSessionMonitor(source, observed::add, scheduler, 3);

        monitor.watchForPublication();
        monitor.watchForPublication();
        source.launch = external(LAUNCH_B, "org.example.b");
        scheduler.runAll();

        assertEquals(1, observed.size());
        assertEquals(LAUNCH_B, observed.get(0).launchId());
    }

    @Test
    public void unavailablePublicationChecksStopAtBoundAndDestroyCancelsPendingWork() {
        SessionSource source = new SessionSource();
        ManualScheduler scheduler = new ManualScheduler();
        List<KorriActiveLaunch> observed = new ArrayList<>();
        KorriActiveSessionMonitor monitor =
                new KorriActiveSessionMonitor(source, observed::add, scheduler, 2);

        monitor.watchForPublication();
        scheduler.runAll();
        assertEquals(2, source.reads);
        assertEquals(0, scheduler.pending());

        monitor.watchForPublication();
        monitor.destroy();
        scheduler.runAll();
        assertEquals(2, source.reads);
        assertEquals(0, observed.size());
    }

    private static KorriActiveLaunch external(String launchId, String packageName) {
        return KorriActiveLaunch.packageLaunch(
                launchId, "game", "Game", packageName, "@korri:android-app/android-app");
    }

    private static final class SessionSource implements KorriActiveSessionMonitor.Source {
        KorriActiveLaunch launch;
        int reads;

        @Override
        public KorriActiveLaunch current() {
            reads++;
            return launch;
        }
    }

    private static final class ManualScheduler implements KorriActiveSessionMonitor.Scheduler {
        final Deque<ScheduledCallback> callbacks = new ArrayDeque<>();

        @Override
        public KorriActiveSessionMonitor.Cancellable schedule(Runnable callback) {
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
            int count = 0;
            for (ScheduledCallback callback : callbacks) {
                if (!callback.cancelled) count++;
            }
            return count;
        }
    }

    private static final class ScheduledCallback implements KorriActiveSessionMonitor.Cancellable {
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
}
