package com.limelight;

import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

@RunWith(AndroidJUnit4.class)
public class KorriNativeBridgeContractTest {
    private static final String BRIDGE_VERSION_ARGUMENT = "bridgeVersion";
    private static final long BRIDGE_READY_TIMEOUT_MS = 15_000;
    private static final long JAVASCRIPT_TIMEOUT_MS = 2_000;
    private static final long POLL_INTERVAL_MS = 100;

    @Test
    public void bridgeVersionMatchesTheCanonicalTreaty() throws Exception {
        int expectedBridgeVersion = expectedBridgeVersion();

        try (ActivityScenario<KorriShellActivity> scenario =
                     ActivityScenario.launch(KorriShellActivity.class)) {
            AtomicReference<WebView> webView = new AtomicReference<>();
            scenario.onActivity(activity -> {
                View content = activity.findViewById(android.R.id.content);
                webView.set(findWebView(content));
            });

            assertNotNull("KorriShellActivity should publish its WebView in the view hierarchy",
                    webView.get());

            waitForKorriNative(webView.get());

            assertEquals(String.valueOf(expectedBridgeVersion),
                    evaluateJavascript(webView.get(), "window.KorriNative.bridgeVersion()"));
        }
    }

    private static int expectedBridgeVersion() {
        String value = InstrumentationRegistry.getArguments()
                .getString(BRIDGE_VERSION_ARGUMENT);
        assertNotNull("Missing instrumentation argument '" + BRIDGE_VERSION_ARGUMENT
                        + "'. Supply the canonical BRIDGE_VERSION from "
                        + "clients/android/test/bridge-contract-version.ts.",
                value);
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException error) {
            fail("Instrumentation argument '" + BRIDGE_VERSION_ARGUMENT
                    + "' must be an integer, got: " + value);
            throw error;
        }
    }

    private static void waitForKorriNative(WebView webView) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + BRIDGE_READY_TIMEOUT_MS;
        String lastResult = null;
        while (SystemClock.elapsedRealtime() < deadline) {
            lastResult = evaluateJavascript(webView,
                    "typeof window.KorriNative === 'object' "
                            + "&& typeof window.KorriNative.bridgeVersion === 'function'");
            if ("true".equals(lastResult)) {
                return;
            }
            Thread.sleep(POLL_INTERVAL_MS);
        }
        fail("window.KorriNative.bridgeVersion was not exposed within "
                + BRIDGE_READY_TIMEOUT_MS + "ms; last readiness result was " + lastResult);
    }

    private static String evaluateJavascript(WebView webView, String script) throws Exception {
        CountDownLatch callback = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();

        InstrumentationRegistry.getInstrumentation().runOnMainSync(
                () -> webView.evaluateJavascript(script, value -> {
                    result.set(value);
                    callback.countDown();
                }));

        assertTrue("Timed out waiting for JavaScript result: " + script,
                callback.await(JAVASCRIPT_TIMEOUT_MS, TimeUnit.MILLISECONDS));
        return result.get();
    }

    private static WebView findWebView(View view) {
        if (view instanceof WebView) {
            return (WebView) view;
        }
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int index = 0; index < group.getChildCount(); index++) {
                WebView child = findWebView(group.getChildAt(index));
                if (child != null) {
                    return child;
                }
            }
        }
        return null;
    }
}
