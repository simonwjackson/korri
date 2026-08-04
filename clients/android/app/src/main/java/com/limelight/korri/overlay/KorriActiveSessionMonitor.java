package com.limelight.korri.overlay;

/** Bounded publication-order reconciler for the process-local active launch record. */
public final class KorriActiveSessionMonitor {
    public interface Source {
        KorriActiveLaunch current();
    }

    public interface Observer {
        void update(KorriActiveLaunch launch);
    }

    public interface Cancellable {
        void cancel();
    }

    public interface Scheduler {
        Cancellable schedule(Runnable callback);
    }

    private final Source source;
    private final Observer observer;
    private final Scheduler scheduler;
    private final int maxChecks;
    private Cancellable pending;
    private int generation;
    private boolean destroyed;

    public KorriActiveSessionMonitor(
            Source source, Observer observer, Scheduler scheduler, int maxChecks) {
        if (maxChecks < 1) throw new IllegalArgumentException("maxChecks must be positive");
        this.source = source;
        this.observer = observer;
        this.scheduler = scheduler;
        this.maxChecks = maxChecks;
    }

    public void watchForPublication() {
        if (destroyed) return;
        cancelPending();
        int callbackGeneration = ++generation;
        schedule(callbackGeneration, 0);
    }

    public void cancel() {
        if (destroyed) return;
        generation++;
        cancelPending();
    }

    public void destroy() {
        if (destroyed) return;
        destroyed = true;
        generation++;
        cancelPending();
    }

    private void schedule(int callbackGeneration, int completedChecks) {
        pending = scheduler.schedule(() -> check(callbackGeneration, completedChecks));
    }

    private void check(int callbackGeneration, int completedChecks) {
        if (destroyed || callbackGeneration != generation) return;
        pending = null;
        KorriActiveLaunch launch = source.current();
        if (launch != null) {
            observer.update(launch);
            return;
        }
        int nextCompletedChecks = completedChecks + 1;
        if (nextCompletedChecks < maxChecks) {
            schedule(callbackGeneration, nextCompletedChecks);
        }
    }

    private void cancelPending() {
        if (pending != null) {
            pending.cancel();
            pending = null;
        }
    }
}
