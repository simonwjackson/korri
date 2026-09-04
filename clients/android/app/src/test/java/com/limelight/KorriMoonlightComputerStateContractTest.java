package com.limelight;

import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.Assert.assertTrue;

/** Pins the production cache/database owner used by the interleaving tests. */
public class KorriMoonlightComputerStateContractTest {
    @Test
    public void provisioningAndPollerShareOneLockAndGeneration() throws Exception {
        String source = new String(Files.readAllBytes(Path.of(
                "src/main/java/com/limelight/computers/ComputerManagerService.java")),
                StandardCharsets.UTF_8);
        String commit = method(source,
                "public MoonlightHostCommit commitMoonlightHost(",
                "private PollingTuple findPollingTuple(");
        String poll = method(source,
                "private int fetchAndCommitAppList(",
                "public void stop()");

        assertOrdered(commit,
                "synchronized (tuple.networkLock)",
                "tuple.appListGeneration != expectedGeneration",
                "getLocalDatabaseReference()",
                "writeAppListCache(uuid, rawAppList)",
                "dbManager.updateComputer(tuple.computer)",
                "tuple.appListGeneration++",
                "releaseLocalDatabaseReference()");
        assertOrdered(poll,
                "writeAppListCache(computer.uuid, appList)",
                "computer.rawAppList = appList",
                "if (tuple != null) tuple.appListGeneration++");
        assertTrue(source.matches(
                "(?s).*synchronized \\(tuple\\.networkLock\\) \\{\\s+"
                        + "emptyAppListResponses = fetchAndCommitAppList\\(.*"));
    }

    private static String method(String source, String startNeedle, String endNeedle) {
        int start = source.indexOf(startNeedle);
        int end = source.indexOf(endNeedle, start + startNeedle.length());
        assertTrue(start >= 0);
        assertTrue(end > start);
        return source.substring(start, end);
    }

    private static void assertOrdered(String source, String... needles) {
        int previous = -1;
        for (String needle : needles) {
            int next = source.indexOf(needle);
            assertTrue("missing: " + needle, next >= 0);
            assertTrue("out of order: " + needle, next > previous);
            previous = next;
        }
    }
}
