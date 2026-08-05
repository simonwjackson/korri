package com.limelight.korri.overlay;

/** Executor-aware preparation before the overlay receives localhost authority. */
public final class KorriOverlayAuthorityBootstrap {
    public interface MoonlightPublication {
        boolean republish(String launchId);
    }

    private KorriOverlayAuthorityBootstrap() {}

    public static boolean prepare(
            String launchId,
            KorriActiveLaunch active,
            MoonlightPublication moonlightPublication) {
        if (active == null || !active.launchId().equals(launchId)) return false;
        if (!active.requiresExecutorPublication()) return true;
        return moonlightPublication.republish(launchId);
    }
}
