package com.limelight.korri.moonlight;

import com.simonwjackson.korri.korrid.KorridServer;

import java.security.SecureRandom;

/** Process-local exact-launch owner for the current live Artemis executor. */
public final class KorriMoonlightActionCoordinator {
    public interface Publication {
        boolean publish(String stateJson);
        boolean clear(String launchId, String generation);
    }

    private static final KorriMoonlightActionCoordinator PROCESS =
            new KorriMoonlightActionCoordinator(new Publication() {
                @Override
                public boolean publish(String stateJson) {
                    return KorridServer.publishMoonlightExecutorState(stateJson);
                }

                @Override
                public boolean clear(String launchId, String generation) {
                    return KorridServer.clearMoonlightExecutorState(launchId, generation);
                }
            });

    private static final SecureRandom RANDOM = new SecureRandom();

    private final Publication publication;
    private String launchId;
    private String generation;
    private KorriMoonlightActionExecutor executor;

    public KorriMoonlightActionCoordinator(Publication publication) {
        this.publication = publication;
    }

    public static KorriMoonlightActionCoordinator process() {
        return PROCESS;
    }

    /** A replacement object gets a fresh process-local identity even for the same launch. */
    public synchronized String register(
            String nextLaunchId, KorriMoonlightActionExecutor nextExecutor) {
        if (nextLaunchId == null || nextLaunchId.isEmpty() || nextExecutor == null) return null;
        String nextGeneration = generation();
        String state = nextExecutor.stateJson(nextLaunchId, nextGeneration);
        if (state.isEmpty() || !publication.publish(state)) return null;
        launchId = nextLaunchId;
        generation = nextGeneration;
        executor = nextExecutor;
        return nextGeneration;
    }

    /** Late teardown clears only the exact object and opaque generation currently registered. */
    public synchronized boolean unregister(
            String expectedLaunchId,
            String expectedGeneration,
            KorriMoonlightActionExecutor expectedExecutor) {
        if (executor != expectedExecutor || !sameIdentity(
                expectedLaunchId, expectedGeneration)) return false;
        executor = null;
        launchId = null;
        generation = null;
        publication.clear(expectedLaunchId, expectedGeneration);
        return true;
    }

    /** Refresh live values immediately before exposing controls to an overlay opening. */
    public synchronized boolean republish(String expectedLaunchId) {
        if (executor == null || !sameLaunch(expectedLaunchId)) return false;
        String state = executor.stateJson(launchId, generation);
        if (state.isEmpty()) return false;
        return publication.publish(state);
    }

    public KorriMoonlightActionExecutor.Outcome execute(
            KorriMoonlightActionExecutor.Request request) {
        final KorriMoonlightActionExecutor selected;
        final String selectedLaunch;
        final String selectedGeneration;
        synchronized (this) {
            if (executor == null) return KorriMoonlightActionExecutor.Outcome.UNAVAILABLE;
            if (request == null || !"android-moonlight".equals(request.executorId())
                    || !sameIdentity(request.launchId(), request.generation())) {
                return KorriMoonlightActionExecutor.Outcome.STALE;
            }
            selected = executor;
            selectedLaunch = launchId;
            selectedGeneration = generation;
        }

        KorriMoonlightActionExecutor.Outcome outcome = selected.execute(
                request,
                () -> isCurrent(selected, selectedLaunch, selectedGeneration));
        if (outcome == KorriMoonlightActionExecutor.Outcome.EXECUTED
                && request.needsStatePublication()) {
            synchronized (this) {
                if (isCurrent(selected, selectedLaunch, selectedGeneration)) {
                    if (!publication.publish(selected.stateJson(
                            selectedLaunch, selectedGeneration))) {
                        publication.clear(selectedLaunch, selectedGeneration);
                    }
                }
            }
        }
        return outcome;
    }

    private synchronized boolean isCurrent(
            KorriMoonlightActionExecutor expectedExecutor,
            String expectedLaunch,
            String expectedGeneration) {
        return executor == expectedExecutor
                && sameIdentity(expectedLaunch, expectedGeneration);
    }

    private boolean sameIdentity(String value, String generationValue) {
        return sameLaunch(value)
                && generation != null
                && generation.equals(generationValue);
    }

    private boolean sameLaunch(String value) {
        return launchId != null && launchId.equals(value);
    }

    private static String generation() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        StringBuilder encoded = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) encoded.append(String.format("%02x", value & 0xff));
        return encoded.toString();
    }
}
