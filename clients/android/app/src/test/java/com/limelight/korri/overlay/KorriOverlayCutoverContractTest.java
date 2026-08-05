package com.limelight.korri.overlay;

import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** One intentional switch for the later, separately proven U8 removal change. */
public class KorriOverlayCutoverContractTest {
    private static final boolean CUTOVER_COMPLETE = false;
    private static final Path OLD_HOST = Path.of(
            "src/main/java/com/limelight/KorriGameOverlay.java");
    private static final Path OLD_PAGE = Path.of(
            "src/main/assets/korri-shell/overlay.html");

    @Test
    public void gameplayTriggersConvergeOnTheExactGlobalRequestSeam() throws Exception {
        String game = read("src/main/java/com/limelight/Game.java");
        String controller = read(
                "src/main/java/com/limelight/binding/input/ControllerHandler.java");

        assertEquals(1, occurrences(game, "KorriOverlayService.requestShow(korriLaunchId)"));
        assertEquals(1, occurrences(game, "KorriOverlayService.hideBoth(korriOverlay, korriLaunchId)"));
        assertTrue(game.contains("if (korriLaunchId == null) return;"));
        assertTrue(game.contains("RequestResult.UNAVAILABLE"));
        assertTrue(game.contains("KorriOverlayService.registerLegacyHost(korriOverlay)"));
        assertTrue(game.contains("KorriOverlayService.unregisterLegacyHost(korriOverlay)"));
        assertTrue(game.contains("performanceOverlayLite.setOnClickListener(v -> showGameMenu())"));
        assertTrue(game.contains("showGameMenu();"));
        assertTrue(game.contains("public void onBackPressed()"));
        assertTrue(controller.contains("gestures.showGameMenu();"));
    }

    @Test
    public void cutoverRemovalIsAnExplicitLaterFlip() throws Exception {
        String game = read("src/main/java/com/limelight/Game.java");
        if (CUTOVER_COMPLETE) {
            assertFalse(Files.exists(OLD_HOST));
            assertFalse(Files.exists(OLD_PAGE));
            assertFalse(game.contains("KorriGameOverlay"));
            assertFalse(game.contains("Temporary pre-cutover fallback"));
        } else {
            assertTrue(Files.exists(OLD_HOST));
            assertTrue(Files.exists(OLD_PAGE));
            assertTrue(game.contains("Temporary pre-cutover fallback"));
            assertTrue(game.contains("result == KorriOverlayService.RequestResult.UNAVAILABLE"));
        }
    }

    @Test
    public void preStreamLifecycleContractRemainsPresentAcrossCutover() throws Exception {
        String game = read("src/main/java/com/limelight/Game.java");
        String preStreamTest = read("src/test/java/com/limelight/KorriSessionOverlayTest.java");

        assertTrue(Files.exists(Path.of(
                "src/main/java/com/limelight/KorriSessionOverlay.java")));
        assertTrue(game.contains("private KorriSessionOverlay korriSessionOverlay;"));
        assertTrue(preStreamTest.contains("stage-starting"));
        assertTrue(preStreamTest.contains("stage-complete"));
        assertTrue(preStreamTest.contains("connected"));
        assertTrue(preStreamTest.contains("failed"));
        assertTrue(preStreamTest.contains("terminated"));
    }

    private static String read(String path) throws Exception {
        return new String(Files.readAllBytes(Path.of(path)), StandardCharsets.UTF_8);
    }

    private static int occurrences(String source, String needle) {
        int count = 0;
        int offset = 0;
        while ((offset = source.indexOf(needle, offset)) >= 0) {
            count++;
            offset += needle.length();
        }
        return count;
    }
}
