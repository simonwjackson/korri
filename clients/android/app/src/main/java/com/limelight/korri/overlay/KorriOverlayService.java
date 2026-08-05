package com.limelight.korri.overlay;

import android.accessibilityservice.AccessibilityService;
import android.annotation.SuppressLint;
import android.app.ActivityManager;
import android.content.Context;
import android.graphics.Color;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.webkit.WebViewAssetLoader;

import com.limelight.BuildConfig;
import com.simonwjackson.korri.korrid.KorriBrainService;
import com.simonwjackson.korri.korrid.KorridServer;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/** Production session scope, input edge, and global gameplay-overlay window. */
public final class KorriOverlayService extends AccessibilityService {
    private static final long LIVENESS_CHECK_DELAY_MS = 500;
    private static final int MAX_LIVENESS_CHECKS = 8;

    private StateMachine state;
    private KorriLaunchContinuity continuity;
    private KorriActiveSessionMonitor sessionMonitor;
    private WindowController windowController;

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        state = new StateMachine(getPackageName());
        windowController = new WindowController(this::createOverlayWindow);
        Handler handler = new Handler(Looper.getMainLooper());
        continuity = new KorriLaunchContinuity(
                new KorriLaunchContinuity.ActivityManagerProcessInspector(
                        (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE)),
                callback -> {
                    handler.postDelayed(callback, LIVENESS_CHECK_DELAY_MS);
                    return () -> handler.removeCallbacks(callback);
                },
                KorriBrainService::clearActiveLaunchOnEnd,
                MAX_LIVENESS_CHECKS);
        sessionMonitor = new KorriActiveSessionMonitor(
                KorriBrainService::activeLaunch,
                launch -> syncSession(),
                callback -> {
                    handler.postDelayed(callback, LIVENESS_CHECK_DELAY_MS);
                    return () -> handler.removeCallbacks(callback);
                },
                MAX_LIVENESS_CHECKS);
        syncSession();
    }

    @Override
    protected boolean onKeyEvent(KeyEvent event) {
        syncSession();
        if (state == null) return false;

        if (event.getKeyCode() == KeyEvent.KEYCODE_BUTTON_MODE) {
            boolean wasShowing = state.isShowing();
            boolean consumed = state.onKey(
                    event.getKeyCode(), event.getAction(), event.isCanceled());
            if (wasShowing && event.getAction() == KeyEvent.ACTION_UP && !event.isCanceled()
                    && windowController != null) {
                windowController.sendInput(
                        "{\"type\":\"system\",\"source\":\"gamepad\"}");
            }
            reconcileWindow();
            return consumed;
        }

        OverlayInput.Decision decision = OverlayInput.route(
                event.getKeyCode(), event.getAction(), event.getRepeatCount(), state.isShowing());
        if (!decision.consumed()) return false;
        if (decision.inputJson() != null && windowController != null) {
            windowController.sendInput(decision.inputJson());
        }
        if (decision.dismiss()) state.updateOverlayVisibility(false);
        reconcileWindow();
        return true;
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (state == null
                || event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
                || event.getPackageName() == null) {
            return;
        }
        KorriActiveLaunch observedLaunch = syncSession();
        String packageName = event.getPackageName().toString();
        String className = event.getClassName() == null ? null : event.getClassName().toString();
        boolean ownedOverlayForeground = state.ownsVisibleOverlayForeground(packageName);
        String suspendedLaunchId = state.updateForeground(packageName, className);
        reconcileWindow();
        if (suspendedLaunchId != null) {
            KorriBrainService.suspendOverlay(suspendedLaunchId);
        }
        if (continuity != null && !ownedOverlayForeground) {
            continuity.updateForeground(packageName, className);
        }
        if (observedLaunch == null) {
            sessionMonitor.watchForPublication();
        } else {
            sessionMonitor.cancel();
        }
    }

    @Override
    public void onInterrupt() {
        if (state != null) state.interrupt();
        reconcileWindow();
    }

    @Override
    public void onDestroy() {
        if (sessionMonitor != null) sessionMonitor.destroy();
        if (state != null) state.destroy();
        if (continuity != null) continuity.destroy();
        if (windowController != null) windowController.destroy();
        sessionMonitor = null;
        state = null;
        continuity = null;
        windowController = null;
        super.onDestroy();
    }

    private KorriActiveLaunch syncSession() {
        KorriActiveLaunch launch = KorriBrainService.activeLaunch();
        if (state != null) {
            state.updateSession(launch, KorriBrainService.isOverlayArmed());
        }
        if (continuity != null) continuity.updateSession(launch);
        reconcileWindow();
        return launch;
    }

    private void dismissOverlay() {
        if (state != null) state.updateOverlayVisibility(false);
        reconcileWindow();
    }

    private void reconcileWindow() {
        if (state == null || windowController == null) return;
        windowController.setVisible(state.isShowing());
        // The state machine must know the actual window result before the
        // measured own-FrameLayout foreground event arrives.
        state.updateOverlayVisibility(windowController.isVisible());
        if (windowController.isVisible()) windowController.refreshAuthority();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private OverlayWindow createOverlayWindow() throws Exception {
        WindowManager windows = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.TRANSPARENT);
        WebView web = new WebView(this);
        web.setBackgroundColor(Color.TRANSPARENT);
        configureWebView(web);

        WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        KorriOverlayBridge bridge = new KorriOverlayBridge(
                KorriBrainService::overlayAuthority,
                new KorriOverlayBridge.Commands() {
                    @Override
                    public void dismiss() {
                        dismissOverlay();
                    }

                    @Override
                    public String authorizeInstruction(String instructionJson) {
                        return KorridServer.authorizePlatformInstruction(instructionJson);
                    }
                },
                messageJson -> web.evaluateJavascript(
                        "window.__korriOverlayMessage && window.__korriOverlayMessage("
                                + JSONObject.quote(messageJson) + ")",
                        null));
        if (!bridge.attachTo(web)) {
            web.destroy();
            throw new IllegalStateException("WebMessageListener is unavailable");
        }
        web.setWebViewClient(new LockedWebViewClient(assets));
        root.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));

        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                android.graphics.PixelFormat.TRANSLUCENT);
        windows.addView(root, params);
        web.loadUrl(KorriOverlayBridge.OVERLAY_URL);

        return new OverlayWindow() {
            private boolean destroyed;
            private String authorityIdentity = identity(KorriBrainService.overlayAuthority());

            @Override
            public void sendInput(String inputJson) {
                if (!destroyed) bridge.sendInput(inputJson);
            }

            @Override
            public void refreshAuthority() {
                if (destroyed) return;
                KorriOverlayBridge.Authority authority = KorriBrainService.overlayAuthority();
                String next = identity(authority);
                if (next == null || !next.equals(authorityIdentity)) {
                    authorityIdentity = next;
                    bridge.sendAuthority();
                }
            }

            @Override
            public void destroy() {
                if (destroyed) return;
                destroyed = true;
                try {
                    windows.removeViewImmediate(root);
                } catch (RuntimeException ignored) {
                }
                web.stopLoading();
                web.destroy();
                root.removeAllViews();
            }
        };
    }

    private static String identity(KorriOverlayBridge.Authority authority) {
        if (authority == null) return null;
        return authority.port() + ":" + authority.capability() + ":" + authority.launchId();
    }

    @SuppressWarnings("deprecation")
    private static void configureWebView(WebView web) {
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setSaveFormData(false);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
    }

    private final class LockedWebViewClient extends WebViewClient {
        private final WebViewAssetLoader assets;

        LockedWebViewClient(WebViewAssetLoader assets) {
            this.assets = assets;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return !KorriOverlayBridge.allowRequest(
                    request.getUrl(), request.getMethod(), true,
                    request.getRequestHeaders(), KorriBrainService.overlayAuthority());
        }

        @Override
        @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView view, String address) {
            return !KorriOverlayBridge.allowRequest(
                    Uri.parse(address), "GET", true, new HashMap<>(),
                    KorriBrainService.overlayAuthority());
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(
                WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            KorriOverlayBridge.Authority authority = KorriBrainService.overlayAuthority();
            if (!KorriOverlayBridge.allowRequest(
                    uri, request.getMethod(), request.isForMainFrame(),
                    request.getRequestHeaders(), authority)) {
                return blockedResponse();
            }
            if (KorriOverlayBridge.ASSET_ORIGIN.equals(
                    uri.getScheme() + "://" + uri.getHost())) {
                WebResourceResponse response = assets.shouldInterceptRequest(uri);
                return withCsp(response);
            }
            return null;
        }
    }

    private static WebResourceResponse withCsp(WebResourceResponse response) {
        if (response == null) return blockedResponse();
        Map<String, String> headers = response.getResponseHeaders() == null
                ? new HashMap<>()
                : new HashMap<>(response.getResponseHeaders());
        headers.put("Content-Security-Policy", KorriOverlayBridge.CONTENT_SECURITY_POLICY);
        headers.put("X-Content-Type-Options", "nosniff");
        headers.put("Referrer-Policy", "no-referrer");
        response.setResponseHeaders(headers);
        return response;
    }

    private static WebResourceResponse blockedResponse() {
        return new WebResourceResponse(
                "text/plain",
                "UTF-8",
                403,
                "Blocked",
                new HashMap<>(),
                new ByteArrayInputStream("blocked".getBytes(StandardCharsets.UTF_8)));
    }

    public interface OverlayWindow {
        void sendInput(String inputJson);
        void refreshAuthority();
        void destroy();
    }

    public interface WindowFactory {
        OverlayWindow create() throws Exception;
    }

    /** Atomic, idempotent add/remove ownership independent of Android callbacks. */
    public static final class WindowController {
        private final WindowFactory factory;
        private OverlayWindow window;
        private boolean destroyed;

        public WindowController(WindowFactory factory) {
            this.factory = factory;
        }

        public void setVisible(boolean visible) {
            if (destroyed) return;
            if (!visible) {
                if (window != null) {
                    window.destroy();
                    window = null;
                }
                return;
            }
            if (window != null) return;
            try {
                window = factory.create();
            } catch (Exception ignored) {
                window = null;
            }
        }

        public boolean isVisible() {
            return window != null;
        }

        public void sendInput(String inputJson) {
            if (window != null) window.sendInput(inputJson);
        }

        public void refreshAuthority() {
            if (window != null) window.refreshAuthority();
        }

        public void destroy() {
            if (destroyed) return;
            destroyed = true;
            setVisible(false);
            if (window != null) {
                window.destroy();
                window = null;
            }
        }
    }

    /** Pure key routing while the global window owns gameplay input. */
    public static final class OverlayInput {
        public static final class Decision {
            private final boolean consumed;
            private final String inputJson;
            private final boolean dismiss;

            Decision(boolean consumed, String inputJson, boolean dismiss) {
                this.consumed = consumed;
                this.inputJson = inputJson;
                this.dismiss = dismiss;
            }

            public boolean consumed() {
                return consumed;
            }

            public String inputJson() {
                return inputJson;
            }

            public boolean dismiss() {
                return dismiss;
            }
        }

        public static Decision route(
                int keyCode, int action, int repeatCount, boolean showing) {
            if (!showing) return new Decision(false, null, false);
            String type;
            String direction = null;
            boolean dismiss = false;
            switch (keyCode) {
                case KeyEvent.KEYCODE_DPAD_UP:
                    type = "direction";
                    direction = "up";
                    break;
                case KeyEvent.KEYCODE_DPAD_DOWN:
                    type = "direction";
                    direction = "down";
                    break;
                case KeyEvent.KEYCODE_DPAD_LEFT:
                    type = "direction";
                    direction = "left";
                    break;
                case KeyEvent.KEYCODE_DPAD_RIGHT:
                    type = "direction";
                    direction = "right";
                    break;
                case KeyEvent.KEYCODE_DPAD_CENTER:
                case KeyEvent.KEYCODE_BUTTON_A:
                    type = "confirm";
                    break;
                case KeyEvent.KEYCODE_BACK:
                case KeyEvent.KEYCODE_BUTTON_B:
                    type = "back";
                    dismiss = true;
                    break;
                case KeyEvent.KEYCODE_MENU:
                case KeyEvent.KEYCODE_BUTTON_START:
                    type = "menu";
                    break;
                case KeyEvent.KEYCODE_BUTTON_SELECT:
                    type = "options";
                    break;
                default:
                    return new Decision(false, null, false);
            }
            if (action != KeyEvent.ACTION_DOWN) {
                return new Decision(true, null, false);
            }
            try {
                JSONObject input = new JSONObject().put("type", type);
                if (direction != null) {
                    input.put("direction", direction);
                    if (repeatCount > 0) input.put("repeat", true);
                }
                input.put("source", "gamepad");
                return new Decision(true, input.toString(), dismiss);
            } catch (Exception error) {
                return new Decision(true, null, dismiss);
            }
        }
    }

    /** Pure public session/Guide state machine; Android callbacks are adapters. */
    public static final class StateMachine {
        private final String servicePackage;
        private KorriActiveLaunch launch;
        private boolean ownerArmed;
        private String foregroundPackage;
        private String foregroundClass;
        private boolean showing;
        private String matchedLaunchId;
        private String suspendedLaunchId;
        private boolean guideOwned;
        private int toggleCount;
        private boolean destroyed;

        public StateMachine(String servicePackage) {
            this.servicePackage = servicePackage;
        }

        public void updateSession(KorriActiveLaunch next, boolean armed) {
            boolean freshIdentity = next != null
                    && (launch == null || !launch.launchId().equals(next.launchId()));
            boolean endedOrReplaced = launch != null
                    && (next == null || !launch.launchId().equals(next.launchId()));
            launch = next;
            ownerArmed = next != null && armed;
            if (freshIdentity || next == null) {
                matchedLaunchId = null;
                suspendedLaunchId = null;
            }
            if (freshIdentity && isForegroundMatch()) matchedLaunchId = next.launchId();
            if (endedOrReplaced || next == null || !isForegroundMatch()) hide();
        }

        public void updateOverlayVisibility(boolean visible) {
            if (!visible || !destroyed) showing = visible;
        }

        public boolean ownsVisibleOverlayForeground(String packageName) {
            return showing && servicePackage.equals(packageName);
        }

        public String updateForeground(String packageName, String className) {
            if (ownsVisibleOverlayForeground(packageName)) return null;
            boolean wasMatchedForeground = isForegroundMatch()
                    && launch != null
                    && launch.launchId().equals(matchedLaunchId);
            foregroundPackage = packageName;
            foregroundClass = className;
            if (isForegroundMatch()) {
                if (!launch.launchId().equals(suspendedLaunchId)) {
                    matchedLaunchId = launch.launchId();
                }
                return null;
            }
            hide();
            if (wasMatchedForeground && !launch.launchId().equals(suspendedLaunchId)) {
                suspendedLaunchId = launch.launchId();
                ownerArmed = false;
                return suspendedLaunchId;
            }
            return null;
        }

        public boolean onKey(int keyCode, int action) {
            return onKey(keyCode, action, false);
        }

        public boolean onKey(int keyCode, int action, boolean canceled) {
            if (destroyed || keyCode != KeyEvent.KEYCODE_BUTTON_MODE) return false;
            boolean active = showing || isArmed();
            if (action == KeyEvent.ACTION_DOWN) {
                if (!guideOwned && !active) return false;
                guideOwned = true;
                return true;
            }
            if (action == KeyEvent.ACTION_UP) {
                boolean consume = guideOwned || active;
                if (guideOwned) {
                    guideOwned = false;
                    if (!canceled && active) {
                        updateOverlayVisibility(!showing);
                        toggleCount++;
                    }
                }
                return consume;
            }
            return guideOwned || active;
        }

        public boolean isShowing() {
            return showing;
        }

        public int toggleCount() {
            return toggleCount;
        }

        public boolean hasMatchedLaunch(String launchId) {
            return launchId != null && launchId.equals(matchedLaunchId);
        }

        public void interrupt() {
            updateOverlayVisibility(false);
            guideOwned = false;
        }

        public void destroy() {
            destroyed = true;
            launch = null;
            ownerArmed = false;
            matchedLaunchId = null;
            suspendedLaunchId = null;
            interrupt();
        }

        private boolean isArmed() {
            return ownerArmed
                    && launch != null
                    && launch.launchId().equals(matchedLaunchId)
                    && !launch.launchId().equals(suspendedLaunchId)
                    && isForegroundMatch();
        }

        private boolean isForegroundMatch() {
            return launch != null && launch.matchesForeground(
                    foregroundPackage, foregroundClass);
        }

        private void hide() {
            updateOverlayVisibility(false);
        }
    }
}
