package com.limelight.korri.overlay;

import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class KorriOverlayServiceLifecycleBudgetTest {
    @Test
    public void externalDeathAndPublicationReconciliationUseDistinctBudgets() throws Exception {
        String source = new String(Files.readAllBytes(Path.of(
                "src/main/java/com/limelight/korri/overlay/KorriOverlayService.java")),
                StandardCharsets.UTF_8);
        String connected = section(source,
                "protected void onServiceConnected()",
                "/** Process-local registration");

        assertTrue(source.contains("private static final long LIVENESS_CHECK_DELAY_MS = 500;"));
        assertTrue(source.contains(
                "private static final int ACTIVE_SESSION_PUBLICATION_MAX_CHECKS = 8;"));
        assertTrue(source.contains(
                "private static final int EXTERNAL_PROCESS_CONTINUITY_MAX_CHECKS = 40;"));
        assertTrue(source.contains("save-on-pause path (up to five seconds)"));
        assertTrue(source.contains("Twenty seconds preserves a strong"));
        assertFalse(source.contains("private static final int MAX_LIVENESS_CHECKS"));

        String continuity = section(connected,
                "continuity = new KorriLaunchContinuity(",
                "sessionMonitor = new KorriActiveSessionMonitor(");
        String publication = section(connected,
                "sessionMonitor = new KorriActiveSessionMonitor(",
                "syncSession();");
        assertTrue(continuity.contains("EXTERNAL_PROCESS_CONTINUITY_MAX_CHECKS"));
        assertFalse(continuity.contains("ACTIVE_SESSION_PUBLICATION_MAX_CHECKS"));
        assertTrue(publication.contains("ACTIVE_SESSION_PUBLICATION_MAX_CHECKS"));
        assertFalse(publication.contains("EXTERNAL_PROCESS_CONTINUITY_MAX_CHECKS"));
    }

    private static String section(String source, String startNeedle, String endNeedle) {
        int start = source.indexOf(startNeedle);
        int end = source.indexOf(endNeedle, start + startNeedle.length());
        assertTrue("missing section start: " + startNeedle, start >= 0);
        assertTrue("missing section end: " + endNeedle, end > start);
        return source.substring(start, end);
    }
}
