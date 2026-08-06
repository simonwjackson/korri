package com.limelight;

import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class KorriShellActivityLifecycleContractTest {
    @Test
    public void finishedShellRevokesAndDestroysItsOwnedPortalOnMainThread() throws Exception {
        String source = source();
        String onDestroy = method(source, "protected void onDestroy()", "protected void onResume()");

        assertTrue(onDestroy.contains("Looper.myLooper() != Looper.getMainLooper()"));
        assertOrdered(onDestroy,
                "final WebView ownedWebView = webView;",
                "webView = null;",
                "((ViewGroup) parent).removeView(ownedWebView);",
                "ownedWebView.removeJavascriptInterface(\"KorriNative\");",
                "ownedWebView.stopLoading();",
                "ownedWebView.destroy();",
                "super.onDestroy();");
        assertFalse(onDestroy.contains("KorriBrainService.stop"));
    }

    @Test
    public void localPublicationEvidenceFollowsAndroidStartAndRustPublication() throws Exception {
        String source = source();
        String launchLocal = method(source, "public String launchLocal(String specJson)",
                "private void requestAllFilesAccess()");

        assertOrdered(launchLocal,
                "startActivityOnUiThread(intent, \"local launcher start timed out\")",
                "KorriBrainService.publishLocalActiveLaunch(spec, specJson)",
                "Log.i(KorriLocalLaunchLifecycle.TAG",
                "KorriLocalLaunchLifecycle.published(");
        assertTrue(launchLocal.contains("active.launchId()"));
        assertTrue(launchLocal.contains("active.gameId()"));
        assertTrue(launchLocal.contains("spec.component.getPackageName()"));
        assertTrue(launchLocal.contains("spec.launcherId"));
        assertFalse(launchLocal.contains("Log.i(KorriLocalLaunchLifecycle.TAG, specJson"));

        String eventSource = new String(Files.readAllBytes(
                Path.of("src/main/java/com/limelight/KorriLocalLaunchLifecycle.java")),
                StandardCharsets.UTF_8);
        assertTrue(eventSource.contains("launchId="));
        assertTrue(eventSource.contains(" event=published"));
        assertTrue(eventSource.contains(" gameId="));
        assertTrue(eventSource.contains(" package="));
        assertTrue(eventSource.contains(" launcher="));
        assertFalse(eventSource.contains("specJson"));
        assertFalse(eventSource.contains("capability"));
        assertFalse(eventSource.contains("authorization"));
        assertFalse(eventSource.contains("controlToken"));
        assertFalse(eventSource.contains("controlPort"));
    }

    @Test
    public void serviceBindingIsReleasedByBindingOwnershipRatherThanCallbackTiming() throws Exception {
        String source = source();
        String onCreate = method(source, "protected void onCreate(Bundle savedInstanceState)",
                "private boolean notificationsAllowed()");
        String onDestroy = method(source, "protected void onDestroy()", "protected void onResume()");

        assertTrue(source.contains("private boolean computerManagerBound;"));
        assertTrue(onCreate.contains("computerManagerBound = bindService("));
        assertTrue(onDestroy.contains("if (computerManagerBound)"));
        assertOrdered(onDestroy,
                "computerManagerBound = false;",
                "unbindService(serviceConnection);",
                "managerBinder = null;",
                "super.onDestroy();");
        assertFalse(onDestroy.contains("if (managerBinder != null)"));
    }

    private static String source() throws Exception {
        return new String(Files.readAllBytes(
                Path.of("src/main/java/com/limelight/KorriShellActivity.java")),
                StandardCharsets.UTF_8);
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
            int next = source.indexOf(needle);
            assertTrue("missing lifecycle step: " + needle, next >= 0);
            assertTrue("out-of-order lifecycle step: " + needle, next > previous);
            previous = next;
        }
    }
}
