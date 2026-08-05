package com.limelight.korri.overlay;

import android.content.ComponentName;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.assertEquals;

@RunWith(RobolectricTestRunner.class)
public class KorriOverlayAuthorityBootstrapTest {
    private static final String LAUNCH = "0123456789abcdef0123456789abcdef";

    @Test
    public void moonlightRequiresLiveExecutorRepublication() {
        KorriActiveLaunch launch = KorriActiveLaunch.artemis(
                LAUNCH, "skate3", "Skate 3", "com.simonwjackson.korri",
                new ComponentName("com.simonwjackson.korri", "com.limelight.Game"),
                "@korri:moonlight/moonlight", "android-moonlight", true);
        AtomicInteger publications = new AtomicInteger();

        assertTrue(KorriOverlayAuthorityBootstrap.prepare(
                LAUNCH, launch, id -> publications.incrementAndGet() == 1));
        assertFalse(KorriOverlayAuthorityBootstrap.prepare(
                LAUNCH, launch, id -> false));
        assertEquals(1, publications.get());
    }

    @Test
    public void retroarchAndGenericLocalLaunchesNeedNoRepublication() throws Exception {
        KorriActiveLaunch retroarch = KorriActiveLaunch.fromJson(new JSONObject()
                .put("launchId", LAUNCH)
                .put("gameId", "wl4")
                .put("title", "Wario Land 4")
                .put("contributors", new JSONArray().put(new JSONObject()
                        .put("kind", "launcher")
                        .put("id", "@korri:retroarch/retroarch")))
                .put("executor", new JSONObject()
                        .put("id", "retroarch-control")
                        .put("available", true))
                .put("foreground", new JSONObject()
                        .put("kind", "component")
                        .put("packageName", "com.korri.retroarch")
                        .put("className", "com.retroarch.browser.retroactivity.RetroActivityFuture"))
                .toString());
        KorriActiveLaunch generic = KorriActiveLaunch.packageLaunch(
                LAUNCH, "tmnt", "TMNT", "org.example.game",
                "@korri:android-app/android-app");
        AtomicInteger publications = new AtomicInteger();

        assertTrue(KorriOverlayAuthorityBootstrap.prepare(
                LAUNCH, retroarch, id -> { publications.incrementAndGet(); return false; }));
        assertTrue(KorriOverlayAuthorityBootstrap.prepare(
                LAUNCH, generic, id -> { publications.incrementAndGet(); return false; }));
        assertEquals(0, publications.get());
        assertFalse(KorriOverlayAuthorityBootstrap.prepare(
                "fedcba9876543210fedcba9876543210", retroarch, id -> true));
    }
}
