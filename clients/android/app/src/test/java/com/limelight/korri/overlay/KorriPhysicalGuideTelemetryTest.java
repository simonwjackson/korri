package com.limelight.korri.overlay;

import android.view.KeyEvent;

import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

public class KorriPhysicalGuideTelemetryTest {
    @Test
    public void formatsOnlyTheTwoReservedPhysicalButtonCodes() {
        assertEquals(
                "event=physical-guide-key key=BUTTON_MODE keyCode=110 action=0 deviceId=7"
                        + " consumed=true sessionAccepted=true showing=false",
                KorriPhysicalGuideTelemetry.format(
                        KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.ACTION_DOWN, 7,
                        true, true, false));
        assertEquals(
                "event=physical-guide-key key=BACK keyCode=4 action=1 deviceId=9"
                        + " consumed=false sessionAccepted=false showing=true",
                KorriPhysicalGuideTelemetry.format(
                        KeyEvent.KEYCODE_BACK, KeyEvent.ACTION_UP, 9,
                        false, false, true));

        assertNull(KorriPhysicalGuideTelemetry.format(
                KeyEvent.KEYCODE_BUTTON_A, KeyEvent.ACTION_DOWN, 7,
                true, true, true));
        assertNull(KorriPhysicalGuideTelemetry.format(
                KeyEvent.KEYCODE_DPAD_DOWN, KeyEvent.ACTION_DOWN, 7,
                true, true, true));
    }

    @Test
    public void formatterHasNoSensitiveOrFreeFormInputs() throws Exception {
        String source = new String(Files.readAllBytes(Path.of(
                "src/main/java/com/limelight/korri/overlay/KorriPhysicalGuideTelemetry.java")),
                StandardCharsets.UTF_8);

        assertFalse(source.contains("launchId"));
        assertFalse(source.contains("capability"));
        assertFalse(source.contains("authority"));
        assertFalse(source.contains("token"));
        assertFalse(source.contains("getCharacters"));
        assertFalse(source.contains("getUnicodeChar"));
        assertFalse(source.contains("KeyEvent event"));
        assertTrue(source.contains("else if (keyCode == KeyEvent.KEYCODE_BACK)"));
        assertTrue(source.contains("} else {\n            return null;"));
    }

    @Test
    public void serviceLogsAfterRoutingAndAlsoDiagnosesUnavailableState() throws Exception {
        String source = new String(Files.readAllBytes(Path.of(
                "src/main/java/com/limelight/korri/overlay/KorriOverlayService.java")),
                StandardCharsets.UTF_8);
        String onKeyEvent = method(source, "protected boolean onKeyEvent(KeyEvent event)",
                "public void onAccessibilityEvent(AccessibilityEvent event)");

        assertTrue(onKeyEvent.contains(
                "logPhysicalGuideEvent(event, false, false, false);"));
        assertOrdered(onKeyEvent,
                "boolean consumed = state.onKey(",
                "reconcileWindow();",
                "event, consumed, state.isSessionAccepted(), state.isShowing());",
                "return consumed;");
        assertTrue(onKeyEvent.contains(
                "event, false, state.isSessionAccepted(), state.isShowing());"));
        assertOrdered(onKeyEvent,
                "if (decision.dismiss()) state.updateOverlayVisibility(false);",
                "reconcileWindow();",
                "event, true, state.isSessionAccepted(), state.isShowing());",
                "return true;");
    }

    private static String method(String source, String startNeedle, String endNeedle) {
        int start = source.indexOf(startNeedle);
        int end = source.indexOf(endNeedle, start + startNeedle.length());
        assertTrue("missing method start: " + startNeedle, start >= 0);
        assertTrue("missing method end: " + endNeedle, end > start);
        return source.substring(start, end);
    }

    private static void assertOrdered(String source, String... needles) {
        int previous = -1;
        for (String needle : needles) {
            int next = source.indexOf(needle, previous + 1);
            assertTrue("missing or out-of-order step: " + needle, next > previous);
            previous = next;
        }
    }
}
