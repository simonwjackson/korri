package com.limelight.korri.moonlight;

import com.simonwjackson.korri.korrid.KorridServer;

/** Process-local exact-launch owner for the current live Artemis executor. */
public final class KorriMoonlightActionCoordinator {
    public interface Publication {
        boolean publish(String stateJson);
        boolean clear(String launchId);
    }

    private static final KorriMoonlightActionCoordinator PROCESS =
            new KorriMoonlightActionCoordinator(new Publication() {
                @Override
                public boolean publish(String stateJson) {
                    return KorridServer.publishMoonlightExecutorState(stateJson);
                }

                @Override
                public boolean clear(String launchId) {
                    return KorridServer.clearMoonlightExecutorState(launchId);
                }
            });

    private final Publication publication;
    private String launchId;
    private KorriMoonlightActionExecutor executor;

    public KorriMoonlightActionCoordinator(Publication publication) {
        this.publication = publication;
    }

    public static KorriMoonlightActionCoordinator process() {
        return PROCESS;
    }

    /** A replacement object may claim the same serialized launch identity. */
    public synchronized boolean register(
            String nextLaunchId, KorriMoonlightActionExecutor nextExecutor) {
        if (nextLaunchId == null || nextLaunchId.isEmpty() || nextExecutor == null) return false;
        String state = nextExecutor.stateJson(nextLaunchId);
        if (state.isEmpty() || !publication.publish(state)) return false;
        launchId = nextLaunchId;
        executor = nextExecutor;
        return true;
    }

    /** Late teardown clears only the exact object that currently owns the launch. */
    public synchronized boolean unregister(
            String expectedLaunchId, KorriMoonlightActionExecutor expectedExecutor) {
        if (executor != expectedExecutor || !sameLaunch(expectedLaunchId)) return false;
        executor = null;
        launchId = null;
        publication.clear(expectedLaunchId);
        return true;
    }

    public KorriMoonlightActionExecutor.Outcome execute(
            KorriMoonlightActionExecutor.Request request) {
        final KorriMoonlightActionExecutor selected;
        final String selectedLaunch;
        synchronized (this) {
            if (executor == null) return KorriMoonlightActionExecutor.Outcome.UNAVAILABLE;
            if (request == null || !sameLaunch(request.launchId())) {
                return KorriMoonlightActionExecutor.Outcome.STALE;
            }
            selected = executor;
            selectedLaunch = launchId;
        }

        KorriMoonlightActionExecutor.Outcome outcome = selected.execute(request);
        if (outcome == KorriMoonlightActionExecutor.Outcome.EXECUTED) {
            synchronized (this) {
                if (executor == selected && sameLaunch(selectedLaunch)) {
                    if (!publication.publish(selected.stateJson(selectedLaunch))) {
                        return KorriMoonlightActionExecutor.Outcome.UNAVAILABLE;
                    }
                } else {
                    return KorriMoonlightActionExecutor.Outcome.STALE;
                }
            }
        }
        return outcome;
    }

    private boolean sameLaunch(String value) {
        return launchId != null && launchId.equals(value);
    }
}
