package com.limelight.korri.overlay;

import android.net.Uri;
import android.webkit.WebView;

import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import com.limelight.korri.moonlight.KorriMoonlightActionCoordinator;
import com.limelight.korri.moonlight.KorriMoonlightActionExecutor;

import org.json.JSONObject;

import java.util.Collections;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.locks.ReentrantReadWriteLock;
import java.util.function.Supplier;

/**
 * Purpose-built gameplay-overlay treaty mirror.
 *
 * Source of truth: contracts/bridge/korri-native-bridge.ts. AndroidX exposes
 * exactly one origin-allowlisted postMessage object; this class deliberately
 * has no JavascriptInterface surface.
 */
public final class KorriOverlayBridge implements AutoCloseable {
    public static final String ASSET_ORIGIN = "https://appassets.androidplatform.net";
    public static final String OVERLAY_URL = ASSET_ORIGIN
            + "/assets/portal/index.html?screen=gameplay-overlay";
    public static final String MESSAGE_OBJECT = "KorriOverlay";
    public static final String CONTENT_SECURITY_POLICY =
            "default-src 'none'; "
            + "script-src 'self'; style-src 'self'; font-src 'self'; "
            + "img-src 'self' data:; "
            + "connect-src http://127.0.0.1:* 'self'; "
            + "base-uri 'none'; frame-src 'none'; object-src 'none'; "
            + "form-action 'none'";

    public interface AuthorityProvider {
        Authority current();
    }

    public interface Commands {
        void ready();
        void dismiss();
        boolean preDismiss();
        void restoreAfterFailure();
        boolean prepareAuthority(String launchId);
        String authorizeInstruction(String instructionJson);
    }

    public interface Sender {
        void send(String messageJson);
    }

    public interface UiDispatcher {
        void dispatch(Runnable action);
    }

    interface InstructionProcessor {
        KorriMoonlightActionExecutor.Outcome execute(
                KorriMoonlightActionExecutor.Request request,
                KorriMoonlightActionExecutor.Authorization authorization);
    }

    public static final class Authority {
        private final int port;
        private final String capability;
        private final String launchId;

        public Authority(int port, String capability, String launchId) {
            if (port <= 0 || capability == null || capability.isEmpty()
                    || launchId == null || launchId.isEmpty()) {
                throw new IllegalArgumentException("incomplete overlay authority");
            }
            this.port = port;
            this.capability = capability;
            this.launchId = launchId;
        }

        public int port() {
            return port;
        }

        public String capability() {
            return capability;
        }

        public String launchId() {
            return launchId;
        }
    }

    private final AuthorityProvider authorityProvider;
    private final Commands commands;
    private final Sender sender;
    private final Executor instructionExecutor;
    private final UiDispatcher uiDispatcher;
    private final InstructionProcessor instructionProcessor;
    private final Object instructionLock = new Object();
    private final ReentrantReadWriteLock dispatchGate = new ReentrantReadWriteLock(true);
    private long lifetime = 1;
    private long nextInstructionToken;
    private long activeInstructionToken;
    private boolean closed;

    public KorriOverlayBridge(
            AuthorityProvider authorityProvider,
            Commands commands,
            Sender sender) {
        this(authorityProvider, commands, sender, Runnable::run, Runnable::run,
                (request, authorization) -> KorriMoonlightActionCoordinator.process()
                        .execute(request, authorization));
    }

    public KorriOverlayBridge(
            AuthorityProvider authorityProvider,
            Commands commands,
            Sender sender,
            Executor instructionExecutor,
            UiDispatcher uiDispatcher) {
        this(authorityProvider, commands, sender, instructionExecutor, uiDispatcher,
                (request, authorization) -> KorriMoonlightActionCoordinator.process()
                        .execute(request, authorization));
    }

    KorriOverlayBridge(
            AuthorityProvider authorityProvider,
            Commands commands,
            Sender sender,
            Executor instructionExecutor,
            UiDispatcher uiDispatcher,
            InstructionProcessor instructionProcessor) {
        this.authorityProvider = authorityProvider;
        this.commands = commands;
        this.sender = sender;
        this.instructionExecutor = instructionExecutor;
        this.uiDispatcher = uiDispatcher;
        this.instructionProcessor = instructionProcessor;
    }

    public boolean attachTo(WebView webView) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            return false;
        }
        WebViewCompat.addWebMessageListener(
                webView,
                MESSAGE_OBJECT,
                Collections.singleton(ASSET_ORIGIN),
                (view, message, sourceOrigin, isMainFrame, replyProxy) -> {
                    if (message.getType() != WebMessageCompat.TYPE_STRING
                            || message.getData() == null) {
                        return;
                    }
                    onMessage(
                            message.getData(),
                            sourceOrigin == null ? "" : sourceOrigin.toString(),
                            isMainFrame);
                });
        return true;
    }

    public void onMessage(String messageJson, String sourceOrigin, boolean isMainFrame) {
        synchronized (instructionLock) { if (closed) return; }
        if (!isMainFrame || !ASSET_ORIGIN.equals(normalizeOrigin(sourceOrigin))) return;
        try {
            JSONObject message = new JSONObject(messageJson);
            String type = message.getString("type");
            switch (type) {
                case "ready":
                    if (message.length() == 1) {
                        commands.ready();
                        sendAuthority();
                    }
                    return;
                case "refresh-authority":
                    if (message.length() == 1) sendAuthority();
                    return;
                case "dismiss":
                    if (message.length() == 1) commands.dismiss();
                    return;
                case "execute-protected-instruction":
                    if (message.length() != 3) return;
                    execute(
                            message.getString("requestId"),
                            message.getJSONObject("instruction"));
                    return;
                default:
                    return;
            }
        } catch (Exception ignored) {
            // Malformed/unapproved messages have no effect and receive no oracle.
        }
    }

    public void sendInput(String inputJson) {
        synchronized (instructionLock) { if (closed) return; }
        try {
            JSONObject input = new JSONObject(inputJson);
            sender.send(new JSONObject()
                    .put("type", "input")
                    .put("payload", input)
                    .toString());
        } catch (Exception ignored) {
            // Native input is generated locally; malformed data is dropped closed.
        }
    }

    public void sendAuthority() {
        synchronized (instructionLock) { if (closed) return; }
        Authority authority = authorityProvider.current();
        if (authority == null || !commands.prepareAuthority(authority.launchId())) {
            commands.dismiss();
            return;
        }
        try {
            JSONObject payload = new JSONObject()
                    .put("korridPort", authority.port())
                    .put("korridCapability", authority.capability())
                    .put("launchId", authority.launchId());
            sender.send(new JSONObject()
                    .put("type", "config")
                    .put("payload", payload)
                    .toString());
        } catch (Exception ignored) {
            commands.dismiss();
        }
    }

    private void execute(String requestId, JSONObject instruction) throws Exception {
        boolean preDismiss = instruction.getBoolean("dismissOnSuccess");
        final long expectedLifetime;
        final long instructionToken;
        synchronized (instructionLock) {
            if (closed) return;
            expectedLifetime = lifetime;
            if (activeInstructionToken != 0) {
                sendBusyResultLocked(expectedLifetime, requestId);
                return;
            }
            instructionToken = ++nextInstructionToken;
            activeInstructionToken = instructionToken;
        }

        if (preDismiss && !preDismissIfCurrent(expectedLifetime, instructionToken)) {
            sendInstructionResult(expectedLifetime, instructionToken, requestId, false,
                    new JSONObject().put("_tag", "Unavailable")
                            .put("message", "The overlay could not safely yield focus."));
            return;
        }
        String encodedInstruction = instruction.toString();
        try {
            instructionExecutor.execute(() -> executeProtectedInstruction(
                    expectedLifetime, instructionToken, requestId,
                    encodedInstruction, preDismiss));
        } catch (RejectedExecutionException error) {
            sendInstructionResult(expectedLifetime, instructionToken, requestId,
                    preDismiss, unavailableOutcome());
        }
    }

    private boolean preDismissIfCurrent(long expectedLifetime, long instructionToken) {
        synchronized (instructionLock) {
            return ownsInstructionLocked(expectedLifetime, instructionToken)
                    && commands.preDismiss();
        }
    }

    private void executeProtectedInstruction(
            long expectedLifetime,
            long instructionToken,
            String requestId,
            String encodedInstruction,
            boolean preDismiss) {
        JSONObject outcome;
        try {
            final String authorization;
            synchronized (instructionLock) {
                if (!ownsInstructionLocked(expectedLifetime, instructionToken)) return;
                authorization = commands.authorizeInstruction(encodedInstruction);
            }
            KorriMoonlightActionExecutor.Request request = authorizedRequest(authorization);
            if (request == null) {
                outcome = new JSONObject().put("_tag", "Rejected")
                        .put("message", "That gameplay action is no longer authorized.");
            } else {
                KorriMoonlightActionExecutor.Outcome result =
                        instructionProcessor.execute(request,
                                bridgeAuthorization(expectedLifetime, instructionToken));
                outcome = new JSONObject();
                switch (result) {
                    case EXECUTED:
                        outcome.put("_tag", "Executed");
                        break;
                    case UNAVAILABLE:
                    case FAILED:
                        outcome = unavailableOutcome();
                        break;
                    case STALE:
                    case INVALID_VALUE:
                    default:
                        outcome.put("_tag", "Rejected")
                                .put("message", "That gameplay action is no longer authorized.");
                        break;
                }
            }
        } catch (Exception error) {
            outcome = unavailableOutcome();
        }
        sendInstructionResult(expectedLifetime, instructionToken, requestId,
                preDismiss, outcome);
    }

    private KorriMoonlightActionExecutor.Authorization bridgeAuthorization(
            long expectedLifetime, long instructionToken) {
        return new KorriMoonlightActionExecutor.Authorization() {
            @Override
            public boolean isCurrent() {
                synchronized (instructionLock) {
                    return ownsInstructionLocked(expectedLifetime, instructionToken);
                }
            }

            @Override
            public <T> T commit(Supplier<T> action, T staleResult) {
                dispatchGate.readLock().lock();
                try {
                    synchronized (instructionLock) {
                        if (!ownsInstructionLocked(expectedLifetime, instructionToken)) {
                            return staleResult;
                        }
                    }
                    return action.get();
                } finally {
                    dispatchGate.readLock().unlock();
                }
            }
        };
    }

    private static JSONObject unavailableOutcome() {
        try {
            return new JSONObject().put("_tag", "Unavailable")
                    .put("message", "The current stream cannot apply that action.");
        } catch (Exception impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private void sendBusyResultLocked(long expectedLifetime, String requestId) {
        JSONObject outcome = unavailableOutcome();
        uiDispatcher.dispatch(() -> {
            synchronized (instructionLock) {
                if (closed || lifetime != expectedLifetime) return;
                sendResultLocked(requestId, outcome);
            }
        });
    }

    private void sendInstructionResult(
            long expectedLifetime,
            long instructionToken,
            String requestId,
            boolean restoreAfterFailure,
            JSONObject outcome) {
        uiDispatcher.dispatch(() -> {
            synchronized (instructionLock) {
                if (!ownsInstructionLocked(expectedLifetime, instructionToken)) return;
                boolean restore = restoreAfterFailure;
                try {
                    restore = restore && !"Executed".equals(outcome.getString("_tag"));
                } catch (Exception ignored) {
                    restore = true;
                }
                if (restore) commands.restoreAfterFailure();
                sendResultLocked(requestId, outcome);
                activeInstructionToken = 0;
            }
        });
    }

    private void sendResultLocked(String requestId, JSONObject outcome) {
        try {
            sender.send(new JSONObject()
                    .put("type", "instruction-result")
                    .put("requestId", requestId)
                    .put("outcome", outcome)
                    .toString());
        } catch (Exception ignored) {
            // Focus is already correct when required. Drop a broken reply.
        }
    }

    private boolean ownsInstructionLocked(long expectedLifetime, long instructionToken) {
        return !closed && lifetime == expectedLifetime
                && activeInstructionToken == instructionToken;
    }

    @Override
    public void close() {
        dispatchGate.writeLock().lock();
        try {
            synchronized (instructionLock) {
                if (closed) return;
                closed = true;
                lifetime++;
                activeInstructionToken = 0;
            }
        } finally {
            dispatchGate.writeLock().unlock();
        }
    }

    static KorriMoonlightActionExecutor.Request authorizedRequest(String authorizationJson) {
        try {
            JSONObject authorization = new JSONObject(authorizationJson);
            if (authorization.length() != 2 || !"Authorized".equals(
                    authorization.getString("_tag"))) return null;
            JSONObject payload = authorization.getJSONObject("payload");
            if (payload.length() < 4 || payload.length() > 5) return null;
            String launchId = payload.getString("launchId");
            String executorId = payload.getString("executorId");
            String generation = payload.getString("generation");
            KorriMoonlightActionExecutor.Effect effect =
                    KorriMoonlightActionExecutor.Effect.fromWire(payload.getString("effect"));
            if (launchId.isEmpty() || !"android-moonlight".equals(executorId)
                    || generation.isEmpty() || effect == null) return null;
            if (!payload.has("value")) {
                return KorriMoonlightActionExecutor.Request.command(
                        launchId, generation, effect);
            }
            JSONObject value = payload.getJSONObject("value");
            if (value.length() != 2) return null;
            Object rawValue = value.get("value");
            switch (value.getString("kind")) {
                case "toggle":
                    if (!(rawValue instanceof Boolean)) return null;
                    return KorriMoonlightActionExecutor.Request.toggle(
                            launchId, generation, effect, (Boolean) rawValue);
                case "choice":
                    if (!(rawValue instanceof String)) return null;
                    return KorriMoonlightActionExecutor.Request.choice(
                            launchId, generation, effect, (String) rawValue);
                case "range":
                    if (!(rawValue instanceof Number)) return null;
                    double range = ((Number) rawValue).doubleValue();
                    if (!Double.isFinite(range) || range != Math.rint(range)
                            || range < Integer.MIN_VALUE || range > Integer.MAX_VALUE) return null;
                    return KorriMoonlightActionExecutor.Request.range(
                            launchId, generation, effect, (int) range);
                default:
                    return null;
            }
        } catch (Exception ignored) {
            return null;
        }
    }

    public static boolean allowRequest(
            Uri uri,
            String method,
            boolean mainFrame,
            Map<String, String> headers,
            Authority authority) {
        if (uri == null) return false;
        boolean asset = "GET".equals(method)
                && "https".equals(uri.getScheme())
                && "appassets.androidplatform.net".equals(uri.getHost())
                && uri.getPort() == -1
                && uri.getPath() != null
                && uri.getPath().startsWith("/assets/portal/");
        if (asset) return true;
        if (mainFrame || authority == null) return false;
        boolean korrid = "http".equals(uri.getScheme())
                && "127.0.0.1".equals(uri.getHost())
                && uri.getPort() == authority.port()
                && "/rpc".equals(uri.getPath());
        if (!korrid) return false;
        if ("POST".equals(method)) {
            return ("Bearer " + authority.capability())
                    .equals(header(headers, "authorization"));
        }
        if (!"OPTIONS".equals(method)) return false;
        String requestedHeaders = header(headers, "access-control-request-headers");
        return ASSET_ORIGIN.equals(header(headers, "origin"))
                && "POST".equals(header(headers, "access-control-request-method"))
                && requestedHeaders != null
                && requestedHeaders.toLowerCase(Locale.ROOT).contains("authorization")
                && requestedHeaders.toLowerCase(Locale.ROOT).contains("content-type");
    }

    private static String header(Map<String, String> headers, String name) {
        for (Map.Entry<String, String> entry : headers.entrySet()) {
            if (name.equals(entry.getKey().toLowerCase(Locale.ROOT))) {
                return entry.getValue();
            }
        }
        return null;
    }

    private static String normalizeOrigin(String sourceOrigin) {
        Uri uri = Uri.parse(sourceOrigin);
        if (uri.getScheme() == null || uri.getHost() == null) return "";
        return uri.getScheme() + "://" + uri.getHost()
                + (uri.getPort() == -1 ? "" : ":" + uri.getPort());
    }
}
