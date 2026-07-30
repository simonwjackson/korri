package com.limelight;

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
    private static final File ROOT = new File("/storage/emulated/0/korri-retro");

    private static JSONObject validSpec() throws Exception {
        return new JSONObject()
                .put("launcherId", "retroarch")
                .put("component", new JSONObject()
                        .put("packageName", "com.retroarch.aarch64")
                        .put("className",
                                "com.retroarch.browser.retroactivity.RetroActivityFuture"))
                .put("extras", new JSONObject()
                        .put("ROM", "/storage/emulated/0/korri-retro/roms/wl4.gba")
                        .put("LIBRETRO",
                                "/data/data/com.retroarch.aarch64/cores/mgba_libretro_android.so")
                        .put("CONFIGFILE",
                                "/storage/emulated/0/korri-retro/retroarch.cfg"))
                .put("directories", new JSONArray()
                        .put("/storage/emulated/0/korri-retro/system")
                        .put("/storage/emulated/0/korri-retro/saves")
                        .put("/storage/emulated/0/korri-retro/states")
                        .put("/storage/emulated/0/korri-retro/screenshots"))
                .put("files", new JSONArray().put(new JSONObject()
                        .put("path", "/storage/emulated/0/korri-retro/retroarch.cfg")
                        .put("content", "video_driver = \"gl\"")))
                .put("integrity", "verified by Rust before parsing");
    }

    @Test
    public void acceptsTheGeneratedLauncherTemplate() throws Exception {
        KorriLocalLaunchSpec.Parsed parsed =
                KorriLocalLaunchSpec.parse(validSpec().toString(), ROOT);
        assertEquals("/storage/emulated/0/korri-retro/roms/wl4.gba",
                parsed.extras.get("ROM"));
        assertEquals(4, parsed.directories.size());
        assertEquals(1, parsed.files.size());
        assertFalse(KorriLocalLaunchSpec.supportsStorageProvisioning(29));
        assertTrue(KorriLocalLaunchSpec.supportsStorageProvisioning(30));
        assertTrue(KorriLocalLaunchSpec.requiresStorageGrant(parsed, 30, false));
        assertFalse(KorriLocalLaunchSpec.requiresStorageGrant(parsed, 30, true));
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
