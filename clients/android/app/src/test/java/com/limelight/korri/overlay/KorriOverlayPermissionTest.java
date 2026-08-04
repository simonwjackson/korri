package com.limelight.korri.overlay;

import org.junit.Test;

import static org.junit.Assert.assertEquals;

public class KorriOverlayPermissionTest {
    @Test
    public void distinguishesEnabledDisabledAndRestrictedOrUnavailable() {
        assertEquals(
                KorriOverlayPermission.State.ENABLED,
                KorriOverlayPermission.classify(true, true, true));
        assertEquals(
                KorriOverlayPermission.State.DISABLED,
                KorriOverlayPermission.classify(true, true, false));
        assertEquals(
                KorriOverlayPermission.State.RESTRICTED_OR_UNAVAILABLE,
                KorriOverlayPermission.classify(false, true, false));
        assertEquals(
                KorriOverlayPermission.State.RESTRICTED_OR_UNAVAILABLE,
                KorriOverlayPermission.classify(true, false, false));
    }

    @Test
    public void serializesPermissionAndSettingsOutcomesAsDistinctTags() {
        assertEquals("{\"_tag\":\"Enabled\"}",
                KorriOverlayPermission.stateJson(KorriOverlayPermission.State.ENABLED));
        assertEquals("{\"_tag\":\"Disabled\"}",
                KorriOverlayPermission.stateJson(KorriOverlayPermission.State.DISABLED));
        assertEquals("{\"_tag\":\"RestrictedOrUnavailable\"}",
                KorriOverlayPermission.stateJson(
                        KorriOverlayPermission.State.RESTRICTED_OR_UNAVAILABLE));
        assertEquals("{\"_tag\":\"Opened\"}",
                KorriOverlayPermission.openedJson());
    }
}
