package com.limelight.korri.overlay;

import android.content.ComponentName;

import com.simonwjackson.korri.korrid.KorriBrainService;

import org.json.JSONObject;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

import java.util.Arrays;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

@RunWith(RobolectricTestRunner.class)
public class KorriActiveLaunchTest {
    private static final String LAUNCH_A = "0123456789abcdef0123456789abcdef";
    private static final String LAUNCH_B = "fedcba9876543210fedcba9876543210";

    @After
    public void clearProcessState() {
        KorriBrainService.resetActiveLaunchForTest();
    }

    @Test
    public void preservesSignedContextAndExactContributorOrder() throws Exception {
        KorriActiveLaunch launch = KorriActiveLaunch.fromJson(new JSONObject()
                .put("launchId", LAUNCH_A)
                .put("gameId", "wl4")
                .put("title", "Wario Land 4")
                .put("contributors", new org.json.JSONArray()
                        .put(new JSONObject().put("kind", "launcher")
                                .put("id", "@korri:retroarch/retroarch"))
                        .put(new JSONObject().put("kind", "runtime")
                                .put("id", "@korri:mgba/mgba")))
                .put("executor", JSONObject.NULL)
                .put("foreground", new JSONObject()
                        .put("kind", "component")
                        .put("packageName", "com.korri.retroarch")
                        .put("className", "com.retroarch.browser.retroactivity.RetroActivityFuture"))
                .toString());

        assertEquals(LAUNCH_A, launch.launchId());
        assertEquals("wl4", launch.gameId());
        assertEquals("Wario Land 4", launch.title());
        assertEquals(Arrays.asList(
                "launcher:@korri:retroarch/retroarch",
                "runtime:@korri:mgba/mgba"), launch.contributorKeys());
        assertFalse(launch.executorAvailable());
        assertTrue(launch.matchesForeground(
                "com.korri.retroarch",
                "com.retroarch.browser.retroactivity.RetroActivityFuture"));
    }

    @Test
    public void componentMatchRejectsSamePackageNonGameActivity() throws Exception {
        KorriActiveLaunch launch = KorriActiveLaunch.artemis(
                LAUNCH_A,
                null,
                null,
                "com.simonwjackson.korri",
                new ComponentName("com.simonwjackson.korri", "com.limelight.Game"),
                "@korri:moonlight/moonlight",
                "android-moonlight",
                false);

        assertTrue(launch.matchesForeground("com.simonwjackson.korri", "com.limelight.Game"));
        assertFalse(launch.matchesForeground(
                "com.simonwjackson.korri", "com.limelight.KorriShellActivity"));
    }

    @Test
    public void packageMatchAllowsExternalLauncherActivityChanges() throws Exception {
        KorriActiveLaunch launch = KorriActiveLaunch.packageLaunch(
                LAUNCH_A, "tmnt", "TMNT", "org.example.game", "@korri:android-app/android-app");

        assertTrue(launch.matchesForeground("org.example.game", "org.example.game.Splash"));
        assertTrue(launch.matchesForeground("org.example.game", "org.example.game.Game"));
        assertFalse(launch.matchesForeground("org.example.other", "org.example.other.Game"));
    }

    @Test
    public void recordsOnlyAfterSuccessfulStart() throws Exception {
        Object owner = new Object();
        KorriActiveLaunch launch = KorriActiveLaunch.packageLaunch(
                LAUNCH_A, "tmnt", "TMNT", "org.example.game", "@korri:android-app/android-app");

        KorriActiveLaunch.startThenRecord(() -> {}, () ->
                KorriBrainService.publishActiveLaunchForTest(owner, launch));
        assertSame(launch, KorriBrainService.activeLaunch());

        KorriBrainService.resetActiveLaunchForTest();
        try {
            KorriActiveLaunch.startThenRecord(
                    () -> { throw new IllegalStateException("start failed"); },
                    () -> KorriBrainService.publishActiveLaunchForTest(owner, launch));
        } catch (IllegalStateException expected) {
            assertEquals("start failed", expected.getMessage());
        }
        assertNull(KorriBrainService.activeLaunch());
    }

    @Test
    public void compareAndClearProtectsReplacementAndActivityRecreation() throws Exception {
        Object activityA = new Object();
        Object recreatedA = new Object();
        Object activityB = new Object();
        KorriActiveLaunch launchA = KorriActiveLaunch.packageLaunch(
                LAUNCH_A, "a", "A", "org.example.a", "@korri:android-app/android-app");
        KorriActiveLaunch launchB = KorriActiveLaunch.packageLaunch(
                LAUNCH_B, "b", "B", "org.example.b", "@korri:android-app/android-app");

        KorriBrainService.publishActiveLaunchForTest(activityA, launchA);
        assertTrue(KorriBrainService.claimActiveLaunch(LAUNCH_A, recreatedA));
        assertFalse(KorriBrainService.clearActiveLaunchForTest(activityA, LAUNCH_A));
        assertSame(launchA, KorriBrainService.activeLaunch());

        KorriBrainService.publishActiveLaunchForTest(activityB, launchB);
        assertFalse(KorriBrainService.clearActiveLaunchForTest(recreatedA, LAUNCH_A));
        assertSame(launchB, KorriBrainService.activeLaunch());
        assertTrue(KorriBrainService.clearActiveLaunchForTest(activityB, LAUNCH_B));
        assertNull(KorriBrainService.activeLaunch());
    }
}
