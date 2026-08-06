package com.limelight;

import android.content.Intent;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

import java.io.File;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

@RunWith(RobolectricTestRunner.class)
public class KorriLocalLaunchSpecTest {
    private static final File ROOT = new File("/storage/emulated/0/korri");

    private static JSONObject validSpec() throws Exception {
        return new JSONObject()
                .put("launcherId", "retroarch")
                .put("component", new JSONObject()
                        .put("packageName", "com.korri.retroarch")
                        .put("className",
                                "com.retroarch.browser.retroactivity.RetroActivityFuture"))
                .put("authorizedContentRoot", "/storage/emulated/0/korri/roms")
                .put("extras", new JSONObject()
                        .put("ROM", "/storage/emulated/0/korri/roms/wl4.gba")
                        .put("LIBRETRO",
                                "/data/data/com.korri.retroarch/cores/mgba_libretro_android.so")
                        .put("CONFIGFILE",
                                "/storage/emulated/0/korri/retroarch.cfg"))
                .put("directories", new JSONArray()
                        .put("/storage/emulated/0/korri/system")
                        .put("/storage/emulated/0/korri/saves")
                        .put("/storage/emulated/0/korri/states")
                        .put("/storage/emulated/0/korri/screenshots"))
                .put("files", new JSONArray().put(new JSONObject()
                        .put("path", "/storage/emulated/0/korri/retroarch.cfg")
                        .put("content", "video_driver = \"gl\"")))
                .put("integrity", "verified by Rust before parsing");
    }

    private static JSONObject androidAppSpec() throws Exception {
        return new JSONObject()
                .put("launcherId", "android-app")
                .put("component", new JSONObject()
                        .put("packageName", "org.example.game")
                        .put("className", ""))
                .put("extras", new JSONObject())
                .put("directories", new JSONArray())
                .put("files", new JSONArray())
                .put("integrity", "verified by Rust before parsing");
    }

    @Test
    public void acceptsTheGeneratedLauncherTemplate() throws Exception {
        KorriLocalLaunchSpec.Parsed parsed =
                KorriLocalLaunchSpec.parse(validSpec().toString(), ROOT);
        assertEquals("retroarch", parsed.launcherId);
        assertEquals("/storage/emulated/0/korri/roms/wl4.gba",
                parsed.extras.get("ROM"));
        assertEquals(4, parsed.directories.size());
        assertEquals(1, parsed.files.size());
        assertEquals(0, parsed.intent().getFlags() & Intent.FLAG_ACTIVITY_NEW_TASK);
        assertFalse(KorriLocalLaunchSpec.supportsStorageProvisioning(29));
        assertTrue(KorriLocalLaunchSpec.supportsStorageProvisioning(30));
        assertTrue(KorriLocalLaunchSpec.requiresStorageGrant(parsed, 30, false));
        assertFalse(KorriLocalLaunchSpec.requiresStorageGrant(parsed, 30, true));
    }

    @Test
    public void acceptsAndroidAppLaunchesWithoutProvisioning() throws Exception {
        KorriLocalLaunchSpec.Parsed parsed =
                KorriLocalLaunchSpec.parse(androidAppSpec().toString(), ROOT);
        assertTrue(parsed.isAndroidApp);
        assertEquals("org.example.game", parsed.component.getPackageName());
        // For android-app launches the class is intentionally unused: the
        // shell resolves the current launcher intent from PackageManager.
        assertEquals("", parsed.component.getClassName());
        assertTrue(parsed.extras.isEmpty());
        assertTrue(parsed.directories.isEmpty());
        assertTrue(parsed.files.isEmpty());
        assertEquals(parsed.component, parsed.intent().getComponent());
    }

    @Test
    public void appliesLauncherSpecificTaskPolicies() throws Exception {
        KorriLocalLaunchSpec.Parsed androidApp =
                KorriLocalLaunchSpec.parse(androidAppSpec().toString(), ROOT);
        Intent androidIntent = new Intent();
        KorriLocalLaunchSpec.applyTaskPolicy(androidApp, androidIntent);
        assertEquals(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED,
                androidIntent.getFlags()
                        & (Intent.FLAG_ACTIVITY_NEW_TASK
                        | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED));

        KorriLocalLaunchSpec.Parsed retroarch =
                KorriLocalLaunchSpec.parse(validSpec().toString(), ROOT);
        Intent retroarchIntent = retroarch.intent();
        KorriLocalLaunchSpec.applyTaskPolicy(retroarch, retroarchIntent);
        assertEquals(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT,
                retroarchIntent.getFlags()
                        & (Intent.FLAG_ACTIVITY_NEW_TASK
                        | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                        | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED));
    }

    @Test
    public void rejectsAndroidAppLaunchesWithExtrasOrProvisioning() throws Exception {
        JSONObject withExtras = androidAppSpec();
        withExtras.getJSONObject("extras").put("ROM", "wl4.gba");
        assertInvalid(withExtras, "InvalidSpec");

        JSONObject withDirectories = androidAppSpec();
        withDirectories.getJSONArray("directories")
                .put("/storage/emulated/0/korri/saves");
        assertInvalid(withDirectories, "InvalidSpec");

        JSONObject withFiles = androidAppSpec();
        withFiles.getJSONArray("files").put(new JSONObject()
                .put("path", "/storage/emulated/0/korri/config.ini")
                .put("content", "setting=true"));
        assertInvalid(withFiles, "InvalidSpec");
    }

    @Test
    public void rejectsUnknownLaunchersAndComponents() throws Exception {
        JSONObject unknown = validSpec().put("launcherId", "other");
        assertInvalid(unknown, "UnsupportedLauncher");

        JSONObject component = validSpec();
        component.getJSONObject("component").put("packageName", "evil.package");
        assertInvalid(component, "InvalidSpec");
    }

    @Test
    public void acceptsOpaqueExtraKeysAndRejectsNonStringValues() throws Exception {
        JSONObject additional = validSpec();
        additional.getJSONObject("extras").put("FUTURE_OPTION", "opaque-value");
        KorriLocalLaunchSpec.Parsed parsed =
                KorriLocalLaunchSpec.parse(additional.toString(), ROOT);
        assertEquals("opaque-value", parsed.extras.get("FUTURE_OPTION"));

        JSONObject wrongType = validSpec();
        wrongType.getJSONObject("extras").put("ROM", 7);
        assertInvalid(wrongType, "InvalidSpec");
    }

    @Test
    public void acceptsRetroarchRomBeneathSignedContentRootOutsideKorriStorage() throws Exception {
        JSONObject spec = validSpec()
                .put("authorizedContentRoot", "/storage/emulated/0/Games/GBA");
        spec.getJSONObject("extras")
                .put("ROM", "/storage/emulated/0/Games/GBA/wl4.gba");

        KorriLocalLaunchSpec.Parsed parsed =
                KorriLocalLaunchSpec.parse(spec.toString(), ROOT,
                        path -> path.startsWith("/storage/emulated/0"));

        assertEquals("/storage/emulated/0/Games/GBA/wl4.gba",
                parsed.extras.get("ROM"));
    }

    @Test
    public void rejectsRetroarchWithoutAuthorizedContentRoot() throws Exception {
        JSONObject spec = validSpec();
        spec.remove("authorizedContentRoot");

        assertInvalid(spec, "InvalidSpec");
    }

    @Test
    public void rejectsRetroarchRomOutsideSignedContentRoot() throws Exception {
        JSONObject spec = validSpec()
                .put("authorizedContentRoot", "/storage/emulated/0/Games/GBA");
        spec.getJSONObject("extras")
                .put("ROM", "/storage/emulated/0/Games/Other/wl4.gba");

        assertInvalid(spec, "InvalidSpec");
    }

    @Test
    public void rejectsRetroarchContentRootOutsideKnownStorageVolumes() throws Exception {
        JSONObject spec = validSpec()
                .put("authorizedContentRoot", "/storage/emulated/99/Games/GBA");
        spec.getJSONObject("extras")
                .put("ROM", "/storage/emulated/99/Games/GBA/wl4.gba");

        try {
            KorriLocalLaunchSpec.parse(spec.toString(), ROOT,
                    path -> path.startsWith("/storage/emulated/0"));
            fail("expected invalid spec");
        } catch (KorriLocalLaunchSpec.Invalid error) {
            assertEquals("InvalidSpec", error.reason);
        }
    }

    @Test
    public void rejectsPathsOutsideTheLauncherTemplate() throws Exception {
        JSONObject rom = validSpec();
        rom.getJSONObject("extras").put("ROM", "/storage/emulated/0/other.gba");
        assertInvalid(rom, "InvalidSpec");

        JSONObject core = validSpec();
        core.getJSONObject("extras").put("LIBRETRO", "/data/local/tmp/core.so");
        assertInvalid(core, "InvalidSpec");

        JSONObject directory = validSpec();
        directory.getJSONArray("directories").put("/storage/emulated/0/other");
        assertInvalid(directory, "InvalidSpec");

        JSONObject file = validSpec();
        file.getJSONArray("files").getJSONObject(0)
                .put("path", "/storage/emulated/0/other.cfg");
        assertInvalid(file, "InvalidSpec");
    }

    private static void assertInvalid(JSONObject spec, String reason) throws Exception {
        try {
            KorriLocalLaunchSpec.parse(spec.toString(), ROOT);
            fail("expected invalid spec");
        } catch (KorriLocalLaunchSpec.Invalid error) {
            assertEquals(reason, error.reason);
        }
    }
}
