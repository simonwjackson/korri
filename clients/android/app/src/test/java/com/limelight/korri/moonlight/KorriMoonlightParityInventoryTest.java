package com.limelight.korri.moonlight;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** Machine-checks that no control disappears between the old host and U6. */
@RunWith(RobolectricTestRunner.class)
public class KorriMoonlightParityInventoryTest {
    private static final String[][] INVENTORY = {
            {"Resume", "KorriOverlayNative.resume()", "overlay:resume"},
            {"Screen fit", "KorriOverlayNative.isFillMode()", "@korri:moonlight/fill"},
            {"Toggle keyboard", "KorriOverlayNative.toggleKeyboard()", "@korri:moonlight/keyboard"},
            {"Full keyboard", "KorriOverlayNative.toggleFullKeyboard()", "@korri:moonlight/full-keyboard"},
            {"Pan &amp; zoom", "KorriOverlayNative.isZoomMode()", "@korri:moonlight/pan-zoom"},
            {"Mouse mode", "KorriOverlayNative.getMouseModes()", "@korri:moonlight/mouse-mode"},
            {"Toggle local mouse cursor(physical mouse needed)", "put(\"index\", -1)", "@korri:moonlight/local-cursor"},
            {"Rotate screen", "KorriOverlayNative.rotateScreen()", "@korri:moonlight/rotate-screen"},
            {"Toggle HUD", "KorriOverlayNative.toggleHud()", "@korri:moonlight/hud"},
            {"Floating menu button", "KorriOverlayNative.toggleFloatingButton()", "@korri:moonlight/floating-menu"},
            {"Keyboard as controller", "KorriOverlayNative.toggleKeyboardController()", "@korri:moonlight/keyboard-controller"},
            {"Touch sensitivity", "KorriOverlayNative.switchTouchSensitivity()", "@korri:moonlight/touch-sensitivity"},
            {"SGSR sharpness", "seekbar_sgsr_sharpness", "@korri:moonlight/sgsr-sharpness"},
            {"SGSR edge threshold", "seekbar_sgsr_edge_threshold", "@korri:moonlight/sgsr-edge-threshold"},
            {"Flip A/B and X/Y", "checkbox_flip_face_buttons", "@korri:moonlight/face-button-flip"},
            {"Rumble", "checkbox_enable_rumble", "@korri:moonlight/rumble"},
            {"Picture-in-picture", "checkbox_enable_pip", "@korri:moonlight/picture-in-picture"},
            {"Disconnect", "KorriOverlayNative.disconnect()", "@korri:moonlight/disconnect"},
            {"Quit game on host", "KorriOverlayNative.quitSession()", "@korri:moonlight/quit-host"},
    };

    @Test
    public void everyOldControlHasCanonicalDeclarationAndParityRow() throws Exception {
        String oldHtml = read("src/main/assets/korri-shell/overlay.html");
        String oldJava = read("src/main/java/com/limelight/KorriGameOverlay.java")
                + read("src/main/res/values/strings.xml");
        String plugin = read("../../../plugins/moonlight/plugin.ts");
        String parity = read("../../../docs/research/unified-android-game-overlay.md");

        for (String[] row : INVENTORY) {
            assertTrue("old control label missing: " + row[0],
                    oldHtml.contains(row[0]) || oldJava.contains(row[0]));
            assertTrue("old control path missing: " + row[1],
                    oldHtml.contains(row[1]) || oldJava.contains(row[1]));
            if (!"overlay:resume".equals(row[2])) {
                assertTrue("canonical plugin control missing: " + row[2], plugin.contains(row[2]));
            }
            assertTrue("parity row missing: " + row[2], parity.contains(row[2]));
        }
    }

    @Test
    public void exactOldOptionsGuidanceAndRangesStayPinned() throws Exception {
        String resources = read("src/main/res/values/strings.xml");
        String plugin = read("../../../plugins/moonlight/plugin.ts");
        String parity = read("../../../docs/research/unified-android-game-overlay.md");
        for (String value : new String[] {
                "Multi touch", "Absolute touch",
                "Track pad(Natural/Double tap to drag)",
                "Track pad(Gaming/Long press to drag)", "Disabled",
                "Absolute touch (left/right click swapped)",
                "Toggle local mouse cursor(physical mouse needed)"
        }) {
            assertTrue("resource option missing: " + value, resources.contains(value));
            assertTrue("plugin option missing: " + value, plugin.contains(value));
            assertTrue("parity option missing: " + value, parity.contains(value));
        }
        assertTrue(plugin.contains("min: 0, max: 50, step: 1"));
        assertTrue(plugin.contains("min: 1, max: 32, step: 1"));
        assertTrue(parity.contains("range `0..50`, step `1`"));
        assertTrue(parity.contains("range `1..32`, step `1`"));
        assertTrue(parity.contains("game keeps running"));
        assertTrue(parity.contains("Really want to quit?"));
    }

    @Test
    public void controllerChordCannotBypassKorriLifecycleAuthority() throws Exception {
        String controller = read("src/main/java/com/limelight/binding/input/ControllerHandler.java");
        assertFalse(controller.contains("Start+Back+LB+RB is the quit combo"));
        assertFalse(controller.contains("pendingExit"));
        assertFalse(controller.contains("activityContext.finish()"));
    }

    @Test
    public void disconnectLeavesHostRunningWhileConfirmedQuitUsesHostQuitPath() throws Exception {
        String game = read("src/main/java/com/limelight/Game.java");
        assertTrue(game.contains("public void disconnect() {\n        finish();\n    }"));
        assertTrue(game.contains("quitOnStop = true;\n            dialog.dismiss();\n            finish();"));
        assertTrue(game.contains("if (httpConn != null && quitOnStop)"));
        assertTrue(game.contains("httpConn.quitApp();"));
    }

    @Test
    public void runtimeSettingsMutexIsRetiredBeforePlatformCleanup() throws Exception {
        String controlStream = read("src/main/jni/moonlight-core/moonlight-common-c/src/ControlStream.c");
        String destroy = between(controlStream,
                "static void destroyRuntimeSettingsSupport(void)",
                "void connectionRuntimeSettingsStreamEnded(void)");
        int unpublish = destroy.indexOf(
                "atomic_store_explicit(&runtimeSettingsPublished, false, memory_order_release);");
        int drain = destroy.indexOf(
                "while (atomic_load_explicit(&runtimeSettingsReaders, memory_order_acquire) != 0)");
        int delete = destroy.indexOf("PltDeleteMutex(&runtimeSettingsMutex);");

        assertTrue(controlStream.contains("static atomic_uint runtimeSettingsReaders"));
        assertTrue(unpublish >= 0);
        assertTrue(drain > unpublish);
        assertTrue(delete > drain);
        assertTrue(controlStream.contains(
                "result = SsRuntimeSettingsDispatchRequest(&runtimeSettingsDispatch,"));
        assertTrue(controlStream.contains(
                "releaseRuntimeSettingsSupport();\n    return result;"));
        assertTrue(controlStream.contains(
                "SsRuntimeSettingsDispatchGetSnapshot(&runtimeSettingsDispatch, snapshot);\n"
                        + "    releaseRuntimeSettingsSupport();"));
        assertTrue(controlStream.contains(
                "destroyRuntimeSettingsSupport();\n    PltDeleteMutex(&enetMutex);"));
    }

    private static String between(String source, String start, String end) {
        int startIndex = source.indexOf(start);
        int endIndex = source.indexOf(end, startIndex + start.length());
        assertTrue(startIndex >= 0);
        assertTrue(endIndex > startIndex);
        return source.substring(startIndex, endIndex);
    }

    private static String read(String path) throws Exception {
        return new String(Files.readAllBytes(Path.of(path)), StandardCharsets.UTF_8);
    }
}
