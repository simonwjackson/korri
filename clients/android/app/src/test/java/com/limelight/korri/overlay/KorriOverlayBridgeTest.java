package com.limelight.korri.overlay;

import android.net.Uri;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

@RunWith(RobolectricTestRunner.class)
public class KorriOverlayBridgeTest {
    private static final String LAUNCH = "0123456789abcdef0123456789abcdef";

    private static KorriOverlayBridge.Authority authority() {
        return new KorriOverlayBridge.Authority(43117, "opaque-capability", LAUNCH);
    }

    @Test
    public void urlPolicyAllowsOnlyApkAssetsAndAuthenticatedCurrentKorridRpc() {
        Map<String, String> authorized = new HashMap<>();
        authorized.put("Authorization", "Bearer opaque-capability");

        assertTrue(KorriOverlayBridge.allowRequest(
                Uri.parse(KorriOverlayBridge.OVERLAY_URL), "GET", true,
                Collections.emptyMap(), authority()));
        assertTrue(KorriOverlayBridge.allowRequest(
                Uri.parse("https://appassets.androidplatform.net/assets/portal/main.js"), "GET", false,
                Collections.emptyMap(), authority()));
        assertTrue(KorriOverlayBridge.allowRequest(
                Uri.parse("http://127.0.0.1:43117/rpc"), "POST", false,
                authorized, authority()));
        Map<String, String> preflight = new HashMap<>();
        preflight.put("Origin", KorriOverlayBridge.ASSET_ORIGIN);
        preflight.put("Access-Control-Request-Method", "POST");
        preflight.put("Access-Control-Request-Headers", "content-type,authorization");
        assertTrue(KorriOverlayBridge.allowRequest(
                Uri.parse("http://127.0.0.1:43117/rpc"), "OPTIONS", false,
                preflight, authority()));
        preflight.put("Origin", "https://example.com");
        assertFalse(KorriOverlayBridge.allowRequest(
                Uri.parse("http://127.0.0.1:43117/rpc"), "OPTIONS", false,
                preflight, authority()));

        assertFalse(KorriOverlayBridge.allowRequest(
                Uri.parse("http://127.0.0.1:43118/rpc"), "POST", false,
                authorized, authority()));
        assertFalse(KorriOverlayBridge.allowRequest(
                Uri.parse("http://127.0.0.1:43117/rpc"), "POST", false,
                Collections.emptyMap(), authority()));
        assertFalse(KorriOverlayBridge.allowRequest(
                Uri.parse("http://127.0.0.1:43117/rpc"), "POST", true,
                authorized, authority()));
        assertFalse(KorriOverlayBridge.allowRequest(
                Uri.parse("https://example.com/script.js"), "GET", false,
                Collections.emptyMap(), authority()));
        assertFalse(KorriOverlayBridge.allowRequest(
                Uri.parse("file:///android_asset/portal/index.html"), "GET", true,
                Collections.emptyMap(), authority()));
        assertFalse(KorriOverlayBridge.allowRequest(
                Uri.parse("content://example/secret"), "GET", false,
                Collections.emptyMap(), authority()));
    }

    @Test
    public void cspAllowsSelfAssetsAndLoopbackRpcButNoExternalContent() {
        String csp = KorriOverlayBridge.CONTENT_SECURITY_POLICY;

        assertTrue(csp.contains("default-src 'none'"));
        assertTrue(csp.contains("script-src 'self'"));
        assertTrue(csp.contains("connect-src http://127.0.0.1:*"));
        assertTrue(csp.contains("frame-src 'none'"));
        assertTrue(csp.contains("object-src 'none'"));
        assertFalse(csp.contains("https:"));
        assertFalse(csp.contains("*;"));
    }

    @Test
    public void readyAndRefreshPublishOnlyCurrentAuthority() throws Exception {
        RecordingSender sender = new RecordingSender();
        RecordingCommands commands = new RecordingCommands();
        KorriOverlayBridge bridge = new KorriOverlayBridge(
                KorriOverlayBridgeTest::authority, commands, sender);

        bridge.onMessage("{\"type\":\"ready\"}", KorriOverlayBridge.ASSET_ORIGIN, true);
        bridge.onMessage("{\"type\":\"refresh-authority\"}",
                KorriOverlayBridge.ASSET_ORIGIN, true);

        assertEquals(1, commands.readyCount);
        assertEquals(2, sender.messages.size());
        for (String encoded : sender.messages) {
            JSONObject message = new JSONObject(encoded);
            assertEquals("config", message.getString("type"));
            JSONObject payload = message.getJSONObject("payload");
            assertEquals(3, payload.length());
            assertEquals(43117, payload.getInt("korridPort"));
            assertEquals("opaque-capability", payload.getString("korridCapability"));
            assertEquals(LAUNCH, payload.getString("launchId"));
        }
    }

    @Test
    public void refreshPublishesReplacementBrainAuthority() throws Exception {
        KorriOverlayBridge.Authority[] current = { authority() };
        RecordingSender sender = new RecordingSender();
        KorriOverlayBridge bridge = new KorriOverlayBridge(
                () -> current[0], new RecordingCommands(), sender);
        bridge.onMessage("{\"type\":\"ready\"}",
                KorriOverlayBridge.ASSET_ORIGIN, true);
        current[0] = new KorriOverlayBridge.Authority(
                43118, "replacement-capability", LAUNCH);
        bridge.onMessage("{\"type\":\"refresh-authority\"}",
                KorriOverlayBridge.ASSET_ORIGIN, true);

        JSONObject replacement = new JSONObject(sender.messages.get(1))
                .getJSONObject("payload");
        assertEquals(43118, replacement.getInt("korridPort"));
        assertEquals("replacement-capability", replacement.getString("korridCapability"));
        assertEquals(LAUNCH, replacement.getString("launchId"));
    }

    @Test
    public void dismissAndProtectedInstructionAreTheOnlyEffectMessages() throws Exception {
        RecordingSender sender = new RecordingSender();
        RecordingCommands commands = new RecordingCommands();
        KorriOverlayBridge bridge = new KorriOverlayBridge(
                KorriOverlayBridgeTest::authority, commands, sender);
        String instruction = "{"
                + "\"launchId\":\"" + LAUNCH + "\","
                + "\"actionId\":\"fill\","
                + "\"nonce\":\"nonce\","
                + "\"value\":{\"kind\":\"toggle\",\"value\":true},"
                + "\"effect\":{\"kind\":\"android-moonlight\","
                + "\"payload\":\"set-fill-mode\"},"
                + "\"integrity\":\"opaque\"}";

        bridge.onMessage("{\"type\":\"dismiss\"}",
                KorriOverlayBridge.ASSET_ORIGIN, true);
        bridge.onMessage("{\"type\":\"execute-protected-instruction\","
                        + "\"requestId\":\"request-1\",\"instruction\":"
                        + instruction + "}",
                KorriOverlayBridge.ASSET_ORIGIN, true);

        assertEquals(1, commands.dismissCount);
        assertEquals(Collections.singletonList(instruction), commands.instructions);
        JSONObject response = new JSONObject(sender.messages.get(0));
        assertEquals("instruction-result", response.getString("type"));
        assertEquals("request-1", response.getString("requestId"));
        assertEquals("Unavailable", response.getJSONObject("outcome").getString("_tag"));
    }

    @Test
    public void rejectsWrongOriginSubframesUnknownAndMalformedMessages() {
        RecordingSender sender = new RecordingSender();
        RecordingCommands commands = new RecordingCommands();
        KorriOverlayBridge bridge = new KorriOverlayBridge(
                KorriOverlayBridgeTest::authority, commands, sender);

        bridge.onMessage("{\"type\":\"dismiss\"}", "https://example.com", true);
        bridge.onMessage("{\"type\":\"dismiss\"}", KorriOverlayBridge.ASSET_ORIGIN, false);
        bridge.onMessage("{\"type\":\"launch\",\"url\":\"https://example.com\"}",
                KorriOverlayBridge.ASSET_ORIGIN, true);
        bridge.onMessage("not-json", KorriOverlayBridge.ASSET_ORIGIN, true);

        assertEquals(0, commands.dismissCount);
        assertTrue(commands.instructions.isEmpty());
        assertTrue(sender.messages.isEmpty());
    }

    @Test
    public void productionHostIsTransparentFocusableAndHardensWebViewSettings() throws Exception {
        String source = new String(Files.readAllBytes(
                Path.of("src/main/java/com/limelight/korri/overlay/KorriOverlayService.java")),
                StandardCharsets.UTF_8);

        assertTrue(source.contains("TYPE_ACCESSIBILITY_OVERLAY"));
        assertTrue(source.contains("Color.TRANSPARENT"));
        assertTrue(source.contains("setAllowFileAccess(false)"));
        assertTrue(source.contains("setAllowContentAccess(false)"));
        assertTrue(source.contains("setAllowFileAccessFromFileURLs(false)"));
        assertTrue(source.contains("setAllowUniversalAccessFromFileURLs(false)"));
        assertTrue(source.contains("MIXED_CONTENT_NEVER_ALLOW"));
        assertTrue(source.contains("setJavaScriptCanOpenWindowsAutomatically(false)"));
        assertTrue(source.contains("setSupportMultipleWindows(false)"));
        assertTrue(source.contains("setWebContentsDebuggingEnabled(BuildConfig.DEBUG)"));
        assertFalse(source.contains("FLAG_NOT_FOCUSABLE"));
        assertFalse(source.contains("addJavascriptInterface"));
    }

    @Test
    public void androidStartupKeepsTheConfiguredShellOriginAlongsideBundledOverlayOrigin()
            throws Exception {
        String shell = new String(Files.readAllBytes(
                Path.of("src/main/java/com/limelight/KorriShellActivity.java")),
                StandardCharsets.UTF_8);
        String bridge = new String(Files.readAllBytes(
                Path.of("src/main/java/com/limelight/korri/overlay/KorriOverlayBridge.java")),
                StandardCharsets.UTF_8);

        assertTrue(shell.contains(
                "KorriBrainService.ensureRunning(\n                this, portalOrigin(portalUrl)"));
        assertTrue(bridge.contains(
                "ASSET_ORIGIN = \"https://appassets.androidplatform.net\""));
        assertFalse(shell.contains("allowOrigin(\"*\")"));
    }

    @Test
    public void publicBridgeSurfaceContainsNoShellPowersOrJavascriptInterface() {
        List<String> methods = new ArrayList<>();
        for (Method method : KorriOverlayBridge.class.getDeclaredMethods()) {
            methods.add(method.getName());
            assertFalse(method.isAnnotationPresent(android.webkit.JavascriptInterface.class));
        }
        String joined = methods.toString().toLowerCase();
        for (String forbidden : new String[] {
                "launch", "stream", "pair", "host", "http", "url", "intent"
        }) {
            assertFalse(joined.contains(forbidden));
        }
    }

    private static final class RecordingSender implements KorriOverlayBridge.Sender {
        final List<String> messages = new ArrayList<>();

        @Override
        public void send(String messageJson) {
            messages.add(messageJson);
        }
    }

    private static final class RecordingCommands implements KorriOverlayBridge.Commands {
        int readyCount;
        int dismissCount;
        final List<String> instructions = new ArrayList<>();

        @Override
        public void ready() {
            readyCount++;
        }

        @Override
        public void dismiss() {
            dismissCount++;
        }

        @Override
        public String authorizeInstruction(String instructionJson) {
            instructions.add(instructionJson);
            return "Authorized";
        }
    }
}
