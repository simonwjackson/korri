package com.limelight.preferences;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.preference.PreferenceManager;
import androidx.test.core.app.ApplicationProvider;

import com.limelight.profiles.ProfilesManager;
import com.limelight.profiles.SettingsProfile;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Config(sdk = 33)
@RunWith(RobolectricTestRunner.class)
public class PreferenceConfigurationMigrationTest {
    private SharedPreferences basePrefs;
    private ProfilesManager profilesManager;

    @Before
    public void setUp() {
        Context context = ApplicationProvider.getApplicationContext();
        basePrefs = PreferenceManager.getDefaultSharedPreferences(context);
        basePrefs.edit().clear().commit();

        profilesManager = ProfilesManager.getInstance();
        for (SettingsProfile profile : profilesManager.getProfiles()) {
            profilesManager.delete(profile.getUuid());
        }
        profilesManager.setActive(null);
    }

    @Test
    public void migratesLegacyOpacityWhenKeyboardOpacityIsAbsent() {
        basePrefs.edit().putInt("seekbar_osc_opacity", 25).commit();

        PreferenceConfiguration.migrateLegacyKeyboardOpacity(basePrefs);

        assertEquals(25, basePrefs.getInt("seekbar_keyboard_axi_opacity", -1));
        assertFalse(basePrefs.contains("seekbar_osc_opacity"));
    }

    @Test
    public void keepsExistingKeyboardOpacityAndRemovesLegacyKey() {
        basePrefs.edit()
                .putInt("seekbar_keyboard_axi_opacity", 70)
                .putInt("seekbar_osc_opacity", 25)
                .commit();

        PreferenceConfiguration.migrateLegacyKeyboardOpacity(basePrefs);

        assertEquals(70, basePrefs.getInt("seekbar_keyboard_axi_opacity", -1));
        assertFalse(basePrefs.contains("seekbar_osc_opacity"));
    }

    @Test
    public void activeProfileLegacyOpacityOverridesBaseWithoutLeaking() {
        basePrefs.edit().putInt("seekbar_keyboard_axi_opacity", 70).commit();

        Map<String, Object> options = new HashMap<>();
        options.put("seekbar_osc_opacity", 25);
        SettingsProfile profile = new SettingsProfile(
                UUID.randomUUID(), "Legacy", System.currentTimeMillis(), System.currentTimeMillis(), options);
        profilesManager.add(profile);
        profilesManager.setActive(profile.getUuid());

        SharedPreferences overlay = profilesManager.getOverlayingSharedPreferences(
                ApplicationProvider.getApplicationContext());

        assertEquals(25, PreferenceConfiguration.resolveKeyboardOpacity(overlay));
        assertEquals(70, basePrefs.getInt("seekbar_keyboard_axi_opacity", -1));
        assertFalse(basePrefs.contains("seekbar_osc_opacity"));
    }

    @Test
    public void migratesRemovedStereoRenderModesToTwoD() {
        for (String removed : new String[]{"1", "2"}) {
            basePrefs.edit().putString("render_mode_list", removed).commit();

            PreferenceConfiguration.migrateRemovedStereoRenderModes(basePrefs);

            assertEquals("0", basePrefs.getString("render_mode_list", null));
        }
    }

    @Test
    public void preservesSgsrRenderModeAcrossMigration() {
        basePrefs.edit().putString("render_mode_list", "3").commit();

        PreferenceConfiguration.migrateRemovedStereoRenderModes(basePrefs);

        assertEquals("3", basePrefs.getString("render_mode_list", null));
        assertEquals(3, PreferenceConfiguration.resolveRenderMode(basePrefs));
    }

    @Test
    public void resolvesRemovedStereoRenderModeToTwoDInProfileOverlay() {
        Map<String, Object> options = new HashMap<>();
        options.put("render_mode_list", "2");
        SettingsProfile profile = new SettingsProfile(
                UUID.randomUUID(), "Stereo", System.currentTimeMillis(), System.currentTimeMillis(), options);
        profilesManager.add(profile);
        profilesManager.setActive(profile.getUuid());

        SharedPreferences overlay = profilesManager.getOverlayingSharedPreferences(
                ApplicationProvider.getApplicationContext());

        assertEquals(0, PreferenceConfiguration.resolveRenderMode(overlay));
    }
}
