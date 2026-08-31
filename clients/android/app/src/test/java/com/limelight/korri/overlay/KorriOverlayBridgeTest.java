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
import java.util.ArrayDeque;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
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
                + "\"executorId\":\"android-moonlight\","
                + "\"generation\":\"executor-generation\","
                + "\"actionId\":\"fill\","
                + "\"dismissOnSuccess\":true,"
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
        assertEquals(java.util.Arrays.asList("pre-dismiss", "authorize", "restore"),
                commands.executionOrder);
        assertEquals(Collections.singletonList(instruction), commands.instructions);
        JSONObject response = new JSONObject(sender.messages.get(0));
        assertEquals("instruction-result", response.getString("type"));
        assertEquals("request-1", response.getString("requestId"));
        assertEquals("Unavailable", response.getJSONObject("outcome").getString("_tag"));
    }

    @Test
    public void pendingRuntimeInstructionDoesNotBlockWebViewAndDeliversLaterOnUi() throws Exception {
        RecordingSender sender = new RecordingSender();
        RecordingCommands commands = new RecordingCommands();
        ArrayDeque<Runnable> worker = new ArrayDeque<>();
        ArrayDeque<Runnable> ui = new ArrayDeque<>();
        CountDownLatch processing = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        KorriOverlayBridge bridge = new KorriOverlayBridge(
                KorriOverlayBridgeTest::authority,
                commands,
                sender,
                worker::add,
                ui::add,
                (request, authorization) -> {
                    processing.countDown();
                    try {
                        if (!release.await(1, TimeUnit.SECONDS)) {
                            return com.limelight.korri.moonlight.KorriMoonlightActionExecutor.Outcome.FAILED;
                        }
                    } catch (InterruptedException error) {
                        Thread.currentThread().interrupt();
                        return com.limelight.korri.moonlight.KorriMoonlightActionExecutor.Outcome.FAILED;
                    }
                    return com.limelight.korri.moonlight.KorriMoonlightActionExecutor.Outcome.EXECUTED;
                });
        String instruction = "{"
                + "\"launchId\":\"" + LAUNCH + "\","
                + "\"executorId\":\"android-moonlight\","
                + "\"generation\":\"executor-generation\","
                + "\"actionId\":\"runtime-fps\","
                + "\"dismissOnSuccess\":true,"
                + "\"nonce\":\"nonce\","
                + "\"value\":{\"kind\":\"range\",\"value\":30},"
                + "\"effect\":{\"kind\":\"android-moonlight\","
                + "\"payload\":\"set-stream-fps\"},"
                + "\"integrity\":\"opaque\"}";

        bridge.onMessage("{\"type\":\"execute-protected-instruction\","
                        + "\"requestId\":\"runtime-request\",\"instruction\":"
                        + instruction + "}",
                KorriOverlayBridge.ASSET_ORIGIN, true);
        assertEquals(1, worker.size());
        assertTrue(sender.messages.isEmpty());

        Thread background = new Thread(worker.remove());
        background.start();
        assertTrue(processing.await(1, TimeUnit.SECONDS));
        assertTrue("pending host ACK must not block WebView delivery", sender.messages.isEmpty());
        assertTrue(ui.isEmpty());
        release.countDown();
        background.join(1000);
        assertEquals(1, ui.size());
        assertTrue(sender.messages.isEmpty());

        ui.remove().run();
        assertEquals(1, sender.messages.size());
        JSONObject result = new JSONObject(sender.messages.get(0));
        assertEquals("Executed", result.getJSONObject("outcome").getString("_tag"));
        assertEquals(java.util.Arrays.asList("pre-dismiss", "authorize"),
                commands.executionOrder);
    }

    @Test
    public void busyInstructionCannotPreDismissOrRestoreActiveInstruction() throws Exception {
        RecordingSender sender = new RecordingSender();
        RecordingCommands commands = new RecordingCommands();
        ArrayDeque<Runnable> worker = new ArrayDeque<>();
        KorriOverlayBridge bridge = new KorriOverlayBridge(
                KorriOverlayBridgeTest::authority, commands, sender,
                worker::add, Runnable::run,
                (request, authorization) -> com.limelight.korri.moonlight.KorriMoonlightActionExecutor.Outcome.EXECUTED);
        String instruction = protectedInstruction("set-stream-fps", 30);

        bridge.onMessage(protectedMessage("first", instruction),
                KorriOverlayBridge.ASSET_ORIGIN, true);
        bridge.onMessage(protectedMessage("busy", instruction),
                KorriOverlayBridge.ASSET_ORIGIN, true);

        assertEquals(Collections.singletonList("pre-dismiss"), commands.executionOrder);
        assertEquals(1, worker.size());
        assertEquals(1, sender.messages.size());
        JSONObject busy = new JSONObject(sender.messages.get(0));
        assertEquals("busy", busy.getString("requestId"));
        assertEquals("Unavailable", busy.getJSONObject("outcome").getString("_tag"));
        assertFalse(commands.executionOrder.contains("restore"));

        worker.remove().run();
        assertEquals(2, sender.messages.size());
        assertEquals(java.util.Arrays.asList("pre-dismiss", "authorize"),
                commands.executionOrder);
    }

    @Test
    public void closeAfterAuthorizationBeforeDispatchPreventsOldWindowEffect() throws Exception {
        RecordingSender sender = new RecordingSender();
        RecordingCommands commands = new RecordingCommands();
        ArrayDeque<Runnable> worker = new ArrayDeque<>();
        CountDownLatch processorEntered = new CountDownLatch(1);
        CountDownLatch releaseProcessor = new CountDownLatch(1);
        java.util.concurrent.atomic.AtomicInteger effects =
                new java.util.concurrent.atomic.AtomicInteger();
        KorriOverlayBridge bridge = new KorriOverlayBridge(
                KorriOverlayBridgeTest::authority, commands, sender,
                worker::add, Runnable::run,
                (request, authorization) -> {
                    processorEntered.countDown();
                    try {
                        releaseProcessor.await();
                    } catch (InterruptedException error) {
                        Thread.currentThread().interrupt();
                        return com.limelight.korri.moonlight.KorriMoonlightActionExecutor.Outcome.FAILED;
                    }
                    return authorization.commit(() -> {
                        effects.incrementAndGet();
                        return com.limelight.korri.moonlight.KorriMoonlightActionExecutor.Outcome.EXECUTED;
                    }, com.limelight.korri.moonlight.KorriMoonlightActionExecutor.Outcome.STALE);
                });
        bridge.onMessage(protectedMessage("old", protectedInstruction("set-stream-fps", 30)),
                KorriOverlayBridge.ASSET_ORIGIN, true);

        Thread background = new Thread(worker.remove());
        background.start();
        assertTrue(processorEntered.await(1, TimeUnit.SECONDS));
        assertTrue(commands.executionOrder.contains("authorize"));
        bridge.close();
        releaseProcessor.countDown();
        background.join(1000);

        assertEquals(0, effects.get());
        assertTrue(sender.messages.isEmpty());
    }

    @Test
    public void closeWaitsForEnteredDispatchButNotHostAcknowledgement() throws Exception {
        RecordingSender sender = new RecordingSender();
        RecordingCommands commands = new RecordingCommands();
        ArrayDeque<Runnable> worker = new ArrayDeque<>();
        CountDownLatch dispatchEntered = new CountDownLatch(1);
        CountDownLatch releaseDispatch = new CountDownLatch(1);
        CountDownLatch awaitingAck = new CountDownLatch(1);
        CountDownLatch releaseAck = new CountDownLatch(1);
        CountDownLatch closeReturned = new CountDownLatch(1);
        KorriOverlayBridge bridge = new KorriOverlayBridge(
                KorriOverlayBridgeTest::authority, commands, sender,
                worker::add, Runnable::run,
                (request, authorization) -> {
                    boolean accepted = authorization.commit(() -> {
                        dispatchEntered.countDown();
                        try {
                            releaseDispatch.await();
                        } catch (InterruptedException error) {
                            Thread.currentThread().interrupt();
                            return false;
                        }
                        return true;
                    }, false);
                    if (!accepted) {
                        return com.limelight.korri.moonlight.KorriMoonlightActionExecutor.Outcome.STALE;
                    }
                    awaitingAck.countDown();
                    try {
                        releaseAck.await();
                    } catch (InterruptedException error) {
                        Thread.currentThread().interrupt();
                        return com.limelight.korri.moonlight.KorriMoonlightActionExecutor.Outcome.FAILED;
                    }
                    return com.limelight.korri.moonlight.KorriMoonlightActionExecutor.Outcome.EXECUTED;
                });
        bridge.onMessage(protectedMessage("old", protectedInstruction("set-stream-fps", 30)),
                KorriOverlayBridge.ASSET_ORIGIN, true);

        Thread background = new Thread(worker.remove());
        background.start();
        assertTrue(dispatchEntered.await(1, TimeUnit.SECONDS));
        Thread closing = new Thread(() -> {
            bridge.close();
            closeReturned.countDown();
        });
        closing.start();
        assertFalse(closeReturned.await(50, TimeUnit.MILLISECONDS));
        releaseDispatch.countDown();
        assertTrue(awaitingAck.await(1, TimeUnit.SECONDS));
        assertTrue("close must not wait for host ACK", closeReturned.await(1, TimeUnit.SECONDS));
        releaseAck.countDown();
        background.join(1000);
        closing.join(1000);
        assertTrue(sender.messages.isEmpty());
    }

    @Test
    public void closedOldWindowCannotRestoreOrReplyIntoReplacementLifetime() throws Exception {
        RecordingSender oldSender = new RecordingSender();
        RecordingSender newSender = new RecordingSender();
        RecordingCommands commands = new RecordingCommands();
        ArrayDeque<Runnable> oldWorker = new ArrayDeque<>();
        ArrayDeque<Runnable> newWorker = new ArrayDeque<>();
        String instruction = protectedInstruction("set-stream-fps", 30);
        KorriOverlayBridge oldBridge = new KorriOverlayBridge(
                KorriOverlayBridgeTest::authority, commands, oldSender,
                oldWorker::add, Runnable::run,
                (request, authorization) -> com.limelight.korri.moonlight.KorriMoonlightActionExecutor.Outcome.FAILED);
        oldBridge.onMessage(protectedMessage("old", instruction),
                KorriOverlayBridge.ASSET_ORIGIN, true);
        oldBridge.close();

        KorriOverlayBridge replacement = new KorriOverlayBridge(
                KorriOverlayBridgeTest::authority, commands, newSender,
                newWorker::add, Runnable::run,
                (request, authorization) -> com.limelight.korri.moonlight.KorriMoonlightActionExecutor.Outcome.FAILED);
        replacement.onMessage(protectedMessage("new", instruction),
                KorriOverlayBridge.ASSET_ORIGIN, true);
        oldWorker.remove().run();
        assertTrue(oldSender.messages.isEmpty());
        assertFalse(commands.executionOrder.contains("restore"));

        newWorker.remove().run();
        assertEquals(1, newSender.messages.size());
        assertEquals(java.util.Arrays.asList(
                "pre-dismiss", "pre-dismiss", "authorize", "restore"),
                commands.executionOrder);
    }

    private static String protectedInstruction(String effect, int value) {
        return "{"
                + "\"launchId\":\"" + LAUNCH + "\","
                + "\"executorId\":\"android-moonlight\","
                + "\"generation\":\"executor-generation\","
                + "\"actionId\":\"runtime\","
                + "\"dismissOnSuccess\":true,"
                + "\"nonce\":\"nonce\","
                + "\"value\":{\"kind\":\"range\",\"value\":" + value + "},"
                + "\"effect\":{\"kind\":\"android-moonlight\","
                + "\"payload\":\"" + effect + "\"},"
                + "\"integrity\":\"opaque\"}";
    }

    private static String protectedMessage(String requestId, String instruction) {
        return "{\"type\":\"execute-protected-instruction\","
                + "\"requestId\":\"" + requestId + "\",\"instruction\":"
                + instruction + "}";
    }

    @Test
    public void authorizationResultIsStrictTypedEffectAndValue() {
        String authorized = "{\"_tag\":\"Authorized\",\"payload\":{"
                + "\"launchId\":\"" + LAUNCH + "\","
                + "\"executorId\":\"android-moonlight\","
                + "\"generation\":\"executor-generation\","
                + "\"effect\":\"set-fill-mode\","
                + "\"value\":{\"kind\":\"toggle\",\"value\":true}}}";
        assertTrue(KorriOverlayBridge.authorizedRequest(authorized) != null);
        assertTrue(KorriOverlayBridge.authorizedRequest(
                authorized.replace("set-fill-mode", "java-method")) == null);
        assertTrue(KorriOverlayBridge.authorizedRequest(
                authorized.replace("}}}", "},\"extra\":true}}")) == null);
        assertTrue(KorriOverlayBridge.authorizedRequest(
                "{\"_tag\":\"Stale\"}") == null);
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
        assertTrue(source.contains("new ThreadPoolExecutor("));
        assertTrue(source.contains("new ArrayBlockingQueue<>(1)"));
        assertTrue(source.contains("resources.add(bridge::close)"));
        assertTrue(source.contains("resources.add(instructionExecutor::shutdownNow)"));
        assertTrue(source.contains("action -> handler.post(action)"));
        assertTrue(source.contains("messageJson -> handler.post(() -> web.evaluateJavascript("));
        assertTrue(source.contains(
                "WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,"));
        assertTrue(source.contains("params.flags |= WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE"));
        assertTrue(source.contains("root.setVisibility(View.INVISIBLE)"));
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
                "KorriBrainService.ensureRunning(\n                this, portalPolicy.portalOrigin()"));
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
        final List<String> executionOrder = new ArrayList<>();

        @Override
        public void ready() {
            readyCount++;
        }

        @Override
        public void dismiss() {
            dismissCount++;
        }

        @Override
        public boolean preDismiss() {
            executionOrder.add("pre-dismiss");
            return true;
        }

        @Override
        public void restoreAfterFailure() {
            executionOrder.add("restore");
        }

        @Override
        public boolean prepareAuthority(String launchId) {
            return true;
        }

        @Override
        public String authorizeInstruction(String instructionJson) {
            executionOrder.add("authorize");
            instructions.add(instructionJson);
            try {
                JSONObject instruction = new JSONObject(instructionJson);
                return new JSONObject()
                        .put("_tag", "Authorized")
                        .put("payload", new JSONObject()
                                .put("launchId", instruction.getString("launchId"))
                                .put("executorId", instruction.getString("executorId"))
                                .put("generation", instruction.getString("generation"))
                                .put("effect", instruction.getJSONObject("effect")
                                        .getString("payload"))
                                .put("value", instruction.opt("value")))
                        .toString();
            } catch (Exception error) {
                return "{\"_tag\":\"InvalidSpec\"}";
            }
        }
    }
}
