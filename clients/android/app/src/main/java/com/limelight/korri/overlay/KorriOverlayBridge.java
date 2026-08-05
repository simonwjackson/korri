package com.limelight.korri.overlay;

import android.net.Uri;
import android.webkit.WebView;

import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONObject;

import java.util.Collections;
import java.util.Locale;
import java.util.Map;

/**
 * Purpose-built gameplay-overlay treaty mirror.
 *
 * Source of truth: contracts/bridge/korri-native-bridge.ts. AndroidX exposes
 * exactly one origin-allowlisted postMessage object; this class deliberately
 * has no JavascriptInterface surface.
 */
public final class KorriOverlayBridge {
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
        void dismiss();
        String authorizeInstruction(String instructionJson);
    }

    public interface Sender {
        void send(String messageJson);
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

    public KorriOverlayBridge(
            AuthorityProvider authorityProvider,
            Commands commands,
            Sender sender) {
        this.authorityProvider = authorityProvider;
        this.commands = commands;
        this.sender = sender;
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
        if (!isMainFrame || !ASSET_ORIGIN.equals(normalizeOrigin(sourceOrigin))) return;
        try {
            JSONObject message = new JSONObject(messageJson);
            String type = message.getString("type");
            switch (type) {
                case "ready":
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
        Authority authority = authorityProvider.current();
        if (authority == null) {
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
        String authorization = commands.authorizeInstruction(instruction.toString());
        JSONObject outcome = new JSONObject();
        if ("Authorized".equals(authorization)) {
            // U6/U7 install effect executors. U5 verifies and consumes now, then
            // reports honest unavailability rather than performing an effect.
            outcome.put("_tag", "Unavailable")
                    .put("message", "This gameplay effect is not available yet.");
        } else {
            outcome.put("_tag", "Rejected")
                    .put("message", "That gameplay action is no longer authorized.");
        }
        sender.send(new JSONObject()
                .put("type", "instruction-result")
                .put("requestId", requestId)
                .put("outcome", outcome)
                .toString());
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
