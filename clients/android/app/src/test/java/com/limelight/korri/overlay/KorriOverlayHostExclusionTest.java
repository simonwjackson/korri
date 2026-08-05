package com.limelight.korri.overlay;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

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
        KorriOverlayHostExclusion.Owner owner = exclusion.register(legacy);
        final int[] opens = { 0 };

        exclusion.openGlobal(owner, () -> {
            assertEquals(1, legacy.closeAndDestroyCount);
            opens[0]++;
        });

        assertEquals(1, opens[0]);
    }

    @Test
    public void hideClosesBothTemporaryHosts() {
        KorriOverlayHostExclusion exclusion = new KorriOverlayHostExclusion();
        RecordingLegacyHost legacy = new RecordingLegacyHost(true);
        KorriOverlayHostExclusion.Owner owner = exclusion.register(legacy);
        final int[] globalDismissals = { 0 };

        exclusion.hideBoth(owner, () -> globalDismissals[0]++);

        assertEquals(1, legacy.closeAndDestroyCount);
        assertEquals(1, globalDismissals[0]);
    }

    @Test
    public void registerSynchronouslyRetiresVisiblePredecessorBeforeReplacementIsCurrent() {
        KorriOverlayHostExclusion exclusion = new KorriOverlayHostExclusion();
        RecordingLegacyHost oldGame = new RecordingLegacyHost(true);
        KorriOverlayHostExclusion.Owner oldOwner = exclusion.register(oldGame);
        RecordingLegacyHost replacementGame = new RecordingLegacyHost(true);

        KorriOverlayHostExclusion.Owner replacementOwner = exclusion.register(replacementGame);

        assertEquals(1, oldGame.closeAndDestroyCount);
        assertFalse(exclusion.isCurrent(oldOwner));
        assertTrue(exclusion.isCurrent(replacementOwner));
    }

    @Test
    public void predecessorUnregisterCannotClearReplacement() {
        KorriOverlayHostExclusion exclusion = new KorriOverlayHostExclusion();
        RecordingLegacyHost oldGame = new RecordingLegacyHost(false);
        KorriOverlayHostExclusion.Owner oldOwner = exclusion.register(oldGame);
        RecordingLegacyHost replacementGame = new RecordingLegacyHost(true);
        KorriOverlayHostExclusion.Owner replacementOwner = exclusion.register(replacementGame);

        exclusion.unregister(oldOwner);
        exclusion.globalConnected();

        assertTrue(exclusion.isCurrent(replacementOwner));
        assertEquals(1, replacementGame.closeAndDestroyCount);
    }

    @Test
    public void staleSameLaunchOwnerCannotOpenOrDestroyReplacement() {
        KorriOverlayHostExclusion exclusion = new KorriOverlayHostExclusion();
        KorriOverlayHostExclusion.Owner oldOwner =
                exclusion.register(new RecordingLegacyHost(false));
        RecordingLegacyHost replacementGame = new RecordingLegacyHost(true);
        exclusion.register(replacementGame);
        final int[] opens = { 0 };

        exclusion.openGlobal(oldOwner, () -> opens[0]++);
        exclusion.hideBoth(oldOwner, () -> opens[0]++);

        assertEquals(0, replacementGame.closeAndDestroyCount);
        assertEquals(0, opens[0]);
    }

    @Test
    public void replacementDuringPredecessorRetirementPreventsDisplacedOwnerOpening() {
        KorriOverlayHostExclusion exclusion = new KorriOverlayHostExclusion();
        RecordingLegacyHost newest = new RecordingLegacyHost(true);
        ReplacingLegacyHost predecessor = new ReplacingLegacyHost(exclusion, newest);
        KorriOverlayHostExclusion.Owner predecessorOwner = exclusion.register(predecessor);
        final int[] opens = { 0 };

        exclusion.openGlobal(predecessorOwner, () -> opens[0]++);

        assertEquals(1, predecessor.closeAndDestroyCount);
        assertEquals(0, newest.closeAndDestroyCount);
        assertEquals(0, opens[0]);
    }

    private static class RecordingLegacyHost
            implements KorriOverlayHostExclusion.LegacyHost {
        private final boolean visible;
        int closeAndDestroyCount;

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

    private static final class ReplacingLegacyHost extends RecordingLegacyHost {
        private final KorriOverlayHostExclusion exclusion;
        private final RecordingLegacyHost replacement;

        ReplacingLegacyHost(
                KorriOverlayHostExclusion exclusion, RecordingLegacyHost replacement) {
            super(true);
            this.exclusion = exclusion;
            this.replacement = replacement;
        }

        @Override
        public boolean isVisible() {
            return closeAndDestroyCount == 0;
        }

        @Override
        public void closeAndDestroy() {
            super.closeAndDestroy();
            exclusion.register(replacement);
        }
    }
}
