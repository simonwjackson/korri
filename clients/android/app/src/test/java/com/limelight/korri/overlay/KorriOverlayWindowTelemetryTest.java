package com.limelight.korri.overlay;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

@RunWith(RobolectricTestRunner.class)
public class KorriOverlayWindowTelemetryTest {
    @Test
    public void successAndFailureTelemetryUseOnlyFixedFieldsAndSanitizedClass() {
        assertEquals(
                "event=overlay-window-create result=success",
                KorriOverlayWindowTelemetry.success());

        String failure = KorriOverlayWindowTelemetry.failure(
                new SensitiveWindowException("capability=do-not-log launchId=do-not-log"));
        assertEquals(
                "event=overlay-window-create result=failure error=SensitiveWindowException",
                failure);
        assertFalse(failure.contains("capability"));
        assertFalse(failure.contains("launchId"));
        assertFalse(failure.contains("do-not-log"));

        assertEquals(
                "event=overlay-window-create result=failure error=Unknown",
                KorriOverlayWindowTelemetry.failure(new Exception() {}));
        assertEquals(
                "event=overlay-window-create result=failure error=Unknown",
                KorriOverlayWindowTelemetry.failure(null));
    }

    @Test
    public void failedCreationRemainsFailClosed() {
        KorriOverlayService.WindowController windows =
                new KorriOverlayService.WindowController(() -> {
                    throw new SensitiveWindowException("must remain private");
                });

        windows.setVisible(true);

        assertFalse(windows.isVisible());
    }

    @Test
    public void controllerLogsOnlyFormatterResultsWithoutExceptionDetails() throws Exception {
        String source = new String(Files.readAllBytes(Path.of(
                "src/main/java/com/limelight/korri/overlay/KorriOverlayService.java")),
                StandardCharsets.UTF_8);
        String controller = section(source,
                "public static final class WindowController",
                "public static final class OverlayMotionInput");

        assertTrue(controller.contains(
                "Log.i(\"KorriOverlay\", KorriOverlayWindowTelemetry.success());"));
        assertTrue(controller.contains(
                "Log.i(\"KorriOverlay\", KorriOverlayWindowTelemetry.failure(failure));"));
        assertOrdered(controller,
                "} catch (Exception failure) {",
                "window = null;",
                "KorriOverlayWindowTelemetry.failure(failure)");
        assertFalse(controller.contains("getMessage"));
        assertFalse(controller.contains("getStackTrace"));
        assertFalse(controller.contains("Log.e"));
        assertFalse(controller.contains("Log.w"));
        assertFalse(controller.contains("launchId"));
        assertFalse(controller.contains("capability"));
        assertFalse(controller.contains("authority"));
        assertFalse(controller.contains("token"));
    }

    private static String section(String source, String startNeedle, String endNeedle) {
        int start = source.indexOf(startNeedle);
        int end = source.indexOf(endNeedle, start + startNeedle.length());
        assertTrue("missing section start", start >= 0);
        assertTrue("missing section end", end > start);
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

    private static final class SensitiveWindowException extends Exception {
        SensitiveWindowException(String detail) {
            super(detail);
        }
    }
}
