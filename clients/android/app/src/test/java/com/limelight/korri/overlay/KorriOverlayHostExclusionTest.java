package com.limelight.korri.overlay;

import org.junit.Test;

import static org.junit.Assert.assertEquals;

public class KorriOverlayHostExclusionTest {
    @Test
    public void fallbackOpenThenServiceConnectClosesCurrentLegacyHost() {
        KorriOverlayHostExclusion exclusion = new KorriOverlayHostExclusion();
        RecordingLegacyHost legacy = new RecordingLegacyHost(true);
        exclusion.register(legacy);

        exclusion.globalConnected();

        assertEquals(1, legacy.closeAndDestroyCount);
    }

    @Test
    public void successfulGlobalOpenClosesLegacyBeforeOpeningGlobalHost() {
        KorriOverlayHostExclusion exclusion = new KorriOverlayHostExclusion();
        RecordingLegacyHost legacy = new RecordingLegacyHost(true);
        exclusion.register(legacy);
        final int[] opens = { 0 };

        exclusion.openGlobal(() -> {
            assertEquals(1, legacy.closeAndDestroyCount);
            opens[0]++;
        });

        assertEquals(1, opens[0]);
    }

    @Test
    public void hideClosesBothTemporaryHosts() {
        KorriOverlayHostExclusion exclusion = new KorriOverlayHostExclusion();
        RecordingLegacyHost legacy = new RecordingLegacyHost(true);
        exclusion.register(legacy);
        final int[] globalDismissals = { 0 };

        exclusion.hideBoth(legacy, () -> globalDismissals[0]++);

        assertEquals(1, legacy.closeAndDestroyCount);
        assertEquals(1, globalDismissals[0]);
    }

    @Test
    public void replacementGameIsTheOnlyLegacyHostAffected() {
        KorriOverlayHostExclusion exclusion = new KorriOverlayHostExclusion();
        RecordingLegacyHost oldGame = new RecordingLegacyHost(true);
        RecordingLegacyHost replacementGame = new RecordingLegacyHost(true);
        exclusion.register(oldGame);
        exclusion.register(replacementGame);

        exclusion.unregister(oldGame);
        exclusion.globalConnected();

        assertEquals(0, oldGame.closeAndDestroyCount);
        assertEquals(1, replacementGame.closeAndDestroyCount);
    }

    @Test
    public void replacedGameCannotHideEitherCurrentHost() {
        KorriOverlayHostExclusion exclusion = new KorriOverlayHostExclusion();
        RecordingLegacyHost oldGame = new RecordingLegacyHost(true);
        RecordingLegacyHost replacementGame = new RecordingLegacyHost(true);
        exclusion.register(oldGame);
        exclusion.register(replacementGame);
        final int[] globalDismissals = { 0 };

        exclusion.hideBoth(oldGame, () -> globalDismissals[0]++);

        assertEquals(0, oldGame.closeAndDestroyCount);
        assertEquals(0, replacementGame.closeAndDestroyCount);
        assertEquals(0, globalDismissals[0]);
    }

    private static final class RecordingLegacyHost
            implements KorriOverlayHostExclusion.LegacyHost {
        private final boolean visible;
        private int closeAndDestroyCount;

        RecordingLegacyHost(boolean visible) {
            this.visible = visible;
        }

        @Override
        public boolean isVisible() {
            return visible;
        }

        @Override
        public void closeAndDestroy() {
            closeAndDestroyCount++;
        }
    }
}
