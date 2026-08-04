package com.limelight.korri.overlay;

import android.content.ComponentName;
import android.content.Intent;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.junit.Assert.assertEquals;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 33)
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
    public void enabledServiceWinsBeforeRestrictionAndSettingsChecks() {
        assertEquals(
                KorriOverlayPermission.State.ENABLED,
                KorriOverlayPermission.classify(
                        33, true, false, true, KorriOverlayPermission.Restriction.DENIED));
        assertEquals(
                KorriOverlayPermission.State.ENABLED,
                KorriOverlayPermission.classify(
                        33, true, true, true, KorriOverlayPermission.Restriction.UNAVAILABLE));
    }

    @Test
    public void api33RequiresAllowedRestrictedSettingsAppOpOnlyWhileDisabled() {
        assertEquals(
                KorriOverlayPermission.State.DISABLED,
                KorriOverlayPermission.classify(
                        32, true, true, false, KorriOverlayPermission.Restriction.UNAVAILABLE));
        assertEquals(
                KorriOverlayPermission.State.DISABLED,
                KorriOverlayPermission.classify(
                        33, true, true, false, KorriOverlayPermission.Restriction.ALLOWED));
        assertEquals(
                KorriOverlayPermission.State.RESTRICTED_OR_UNAVAILABLE,
                KorriOverlayPermission.classify(
                        33, true, true, false, KorriOverlayPermission.Restriction.DENIED));
        assertEquals(
                KorriOverlayPermission.State.RESTRICTED_OR_UNAVAILABLE,
                KorriOverlayPermission.classify(
                        33, true, true, false, KorriOverlayPermission.Restriction.UNAVAILABLE));
    }

    @Test
    public void settingsUsesDetailWhenItLaunches() {
        ConfigurableSettingsLauncher launcher = new ConfigurableSettingsLauncher(true, true);

        assertEquals(
                KorriOverlayPermission.openedJson(),
                KorriOverlayPermission.openSettings(
                        new ComponentName("com.example", "com.example.Overlay"), launcher));
        assertEquals(
                Arrays.asList("android.settings.ACCESSIBILITY_DETAILS_SETTINGS"),
                launcher.attemptedActions);
    }

    @Test
    public void settingsFallsBackToGeneralAfterDetailResolutionOrExecutionFailure() {
        ConfigurableSettingsLauncher unresolved = new ConfigurableSettingsLauncher(false, true);
        assertEquals(
                KorriOverlayPermission.openedJson(),
                KorriOverlayPermission.openSettings(
                        new ComponentName("com.example", "com.example.Overlay"), unresolved));
        assertEquals(
                Arrays.asList(android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS),
                unresolved.attemptedActions);

        ConfigurableSettingsLauncher detailFails = new ConfigurableSettingsLauncher(true, true);
        detailFails.failDetail = true;
        assertEquals(
                KorriOverlayPermission.openedJson(),
                KorriOverlayPermission.openSettings(
                        new ComponentName("com.example", "com.example.Overlay"), detailFails));
        assertEquals(
                Arrays.asList(
                        "android.settings.ACCESSIBILITY_DETAILS_SETTINGS",
                        android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS),
                detailFails.attemptedActions);
    }

    @Test
    public void settingsReportsUnavailableWhenNeitherLaunchSucceeds() {
        ConfigurableSettingsLauncher launcher = new ConfigurableSettingsLauncher(true, false);
        launcher.failDetail = true;

        assertEquals(
                "{\"_tag\":\"Unavailable\",\"message\":\"Android accessibility settings could not be opened\"}",
                KorriOverlayPermission.openSettings(
                        new ComponentName("com.example", "com.example.Overlay"), launcher));
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

    private static final class ConfigurableSettingsLauncher
            implements KorriOverlayPermission.SettingsLauncher {
        private final boolean detailResolvable;
        private final boolean generalResolvable;
        private final List<String> attemptedActions = new ArrayList<>();
        private boolean failDetail;

        ConfigurableSettingsLauncher(boolean detailResolvable, boolean generalResolvable) {
            this.detailResolvable = detailResolvable;
            this.generalResolvable = generalResolvable;
        }

        @Override
        public boolean canResolve(Intent intent) {
            return "android.settings.ACCESSIBILITY_DETAILS_SETTINGS".equals(intent.getAction())
                    ? detailResolvable
                    : generalResolvable;
        }

        @Override
        public void start(Intent intent) throws Exception {
            attemptedActions.add(intent.getAction());
            if (failDetail
                    && "android.settings.ACCESSIBILITY_DETAILS_SETTINGS".equals(
                            intent.getAction())) {
                throw new IllegalStateException("detail blocked");
            }
        }
    }
}
