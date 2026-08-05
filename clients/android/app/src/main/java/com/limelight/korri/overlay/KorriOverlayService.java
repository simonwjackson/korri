package com.limelight.korri.overlay;

import android.accessibilityservice.AccessibilityService;
import android.annotation.SuppressLint;
import android.app.ActivityManager;
import android.content.Context;
import android.graphics.Color;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.webkit.WebViewAssetLoader;

import com.limelight.BuildConfig;
import com.limelight.korri.moonlight.KorriMoonlightActionCoordinator;
import com.simonwjackson.korri.korrid.KorriBrainService;
import com.simonwjackson.korri.korrid.KorridServer;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/** Production session scope, input edge, and global gameplay-overlay window. */
public final class KorriOverlayService extends AccessibilityService {
    private static final KorriOverlayHostExclusion PROCESS_HOSTS =
            new KorriOverlayHostExclusion();
    private static final ProcessRequests PROCESS_REQUESTS =
            new ProcessRequests(PROCESS_HOSTS);
    private static final long LIVENESS_CHECK_DELAY_MS = 500;
    private static final int MAX_LIVENESS_CHECKS = 8;
    private static final long OVERLAY_READY_TIMEOUT_MS = 10_000;

    private StateMachine state;
    private KorriLaunchContinuity continuity;
    private KorriActiveSessionMonitor sessionMonitor;
    private WindowController windowController;
    private RequestHost processRequestHost;
    private final OverlayInput overlayInput = new OverlayInput();

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        // Accessibility callbacks and Game registration both run on the UI
        // thread, so the exact current Activity host is closed synchronously.
        PROCESS_HOSTS.globalConnected();
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
        processRequestHost = new RequestHost() {
            @Override
            public boolean accepts(
                    KorriOverlayHostExclusion.Owner owner, String launchId) {
                return acceptsVisibilityRequest(owner, launchId);
            }

            @Override
            public boolean requestShow(
                    KorriOverlayHostExclusion.Owner owner, String launchId) {
                return requestVisibility(owner, launchId, true);
            }

            @Override
            public boolean requestDismiss(
                    KorriOverlayHostExclusion.Owner owner, String launchId) {
                return requestVisibility(owner, launchId, false);
            }
        };
        PROCESS_REQUESTS.connect(processRequestHost, new MainDispatcher() {
            @Override
            public boolean isMainThread() {
                return Looper.myLooper() == Looper.getMainLooper();
            }

            @Override
            public void post(Runnable request) {
                handler.post(request);
            }
        });
    }

    /** Process-local registration for the exact current temporary Game host. */
    public static KorriOverlayHostExclusion.Owner registerLegacyHost(
            KorriOverlayHostExclusion.LegacyHost host) {
        return PROCESS_HOSTS.register(host);
    }

    public static void unregisterLegacyHost(KorriOverlayHostExclusion.Owner owner) {
        PROCESS_HOSTS.unregister(owner);
    }

    /** Process-local request path for Korri-owned gameplay triggers. */
    public static RequestResult requestShow(
            KorriOverlayHostExclusion.Owner owner, String launchId) {
        return PROCESS_REQUESTS.requestShow(owner, launchId);
    }

    /** Closes both temporary hosts, even when the global service is absent. */
    public static void hideBoth(
            KorriOverlayHostExclusion.Owner owner, String launchId) {
        PROCESS_HOSTS.hideBoth(owner, () -> {
            if (launchId != null) PROCESS_REQUESTS.requestDismiss(owner, launchId);
        });
    }

    private boolean acceptsVisibilityRequest(
            KorriOverlayHostExclusion.Owner owner, String launchId) {
        if (!PROCESS_HOSTS.isCurrent(owner)) return false;
        syncSession();
        return state != null && state.acceptsRequest(launchId);
    }

    private boolean requestVisibility(
            KorriOverlayHostExclusion.Owner owner, String launchId, boolean visible) {
        if (!PROCESS_HOSTS.isCurrent(owner)) return false;
        syncSession();
        if (state == null) return false;
        boolean accepted = visible
                ? state.requestShow(launchId)
                : state.requestDismiss(launchId);
        if (accepted) reconcileWindow(owner);
        return accepted;
    }

    @Override
    protected boolean onKeyEvent(KeyEvent event) {
        syncSession();
        if (state == null) return false;

        if (event.getKeyCode() == KeyEvent.KEYCODE_BUTTON_MODE) {
            boolean wasShowing = state.isShowing();
            boolean consumed = state.onKey(
                    event.getDeviceId(), event.getKeyCode(),
                    event.getAction(), event.isCanceled());
            if (consumed && wasShowing && event.getAction() == KeyEvent.ACTION_UP
                    && !event.isCanceled() && windowController != null) {
                windowController.sendInput(
                        "{\"type\":\"system\",\"source\":\"gamepad\"}");
            }
            reconcileWindow();
            return consumed;
        }

        OverlayInput.Decision decision = overlayInput.route(
                event.getDeviceId(), event.getKeyCode(), event.getSource(),
                event.getAction(), event.getRepeatCount(),
                state.isShowing(), event.isCanceled());
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
        boolean ownedOverlayForeground =
                state.ownsVisibleOverlayForeground(packageName, className);
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
        if (processRequestHost != null) PROCESS_REQUESTS.disconnect(processRequestHost);
        processRequestHost = null;
        if (sessionMonitor != null) sessionMonitor.destroy();
        if (state != null) state.destroy();
        if (continuity != null) continuity.destroy();
        if (windowController != null) windowController.destroy();
        sessionMonitor = null;
        state = null;
        continuity = null;
        windowController = null;
        super.onDestroy();
        // Accessibility input callbacks cannot follow service destruction.
        overlayInput.destroy();
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
        reconcileWindow(null);
    }

    private void reconcileWindow(KorriOverlayHostExclusion.Owner requestOwner) {
        if (state == null || windowController == null) return;
        if (state.isShowing() && !windowController.isVisible()) {
            Runnable open = () -> windowController.setVisible(true);
            if (requestOwner == null) {
                PROCESS_HOSTS.openGlobal(open);
            } else {
                PROCESS_HOSTS.openGlobal(requestOwner, open);
            }
        } else {
            windowController.setVisible(state.isShowing());
        }
        // The state machine must know the actual window result before the
        // measured own-FrameLayout foreground event arrives.
        state.updateOverlayVisibility(windowController.isVisible());
        if (windowController.isVisible()) windowController.refreshAuthority();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private OverlayWindow createOverlayWindow() throws Exception {
        OverlayResources resources = new OverlayResources();
        try {
            WindowManager windows = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
            FrameLayout root = new FrameLayout(this);
            root.setBackgroundColor(Color.TRANSPARENT);
            resources.add(root::removeAllViews);

            WebView web = new WebView(this);
            web.setBackgroundColor(Color.TRANSPARENT);
            configureWebView(web);
            resources.add(() -> {
                web.stopLoading();
                web.destroy();
            });

            Handler handler = new Handler(Looper.getMainLooper());
            boolean[] fatalDuringCreate = { false };
            Runnable fatal = () -> {
                fatalDuringCreate[0] = true;
                dismissOverlay();
            };
            BootstrapGuard bootstrap = new BootstrapGuard(
                    callback -> {
                        handler.postDelayed(callback, OVERLAY_READY_TIMEOUT_MS);
                        return () -> handler.removeCallbacks(callback);
                    },
                    fatal);
            resources.add(bootstrap::destroy);

            WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
                    .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                    .build();
            KorriOverlayBridge bridge = new KorriOverlayBridge(
                    KorriBrainService::overlayAuthority,
                    new KorriOverlayBridge.Commands() {
                        @Override
                        public void ready() {
                            bootstrap.ready();
                        }

                        @Override
                        public void dismiss() {
                            dismissOverlay();
                        }

                        @Override
                        public boolean preDismiss() {
                            return windowController != null && windowController.preDismiss();
                        }

                        @Override
                        public void restoreAfterFailure() {
                            if (windowController != null) windowController.restoreAfterFailure();
                        }

                        @Override
                        public boolean prepareAuthority(String launchId) {
                            return KorriOverlayAuthorityBootstrap.prepare(
                                    launchId,
                                    KorriBrainService.activeLaunch(),
                                    id -> KorriMoonlightActionCoordinator.process().republish(id));
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
                throw new IllegalStateException("WebMessageListener is unavailable");
            }
            OverlayMotionInput motionInput = new OverlayMotionInput();
            View.OnGenericMotionListener motionListener = (view, event) -> {
                if (!OverlayMotionInput.owns(event.getSource())) return false;
                if (OverlayMotionInput.mutates(event.getAction())) {
                    for (String direction : motionInput.directions(
                            event.getDeviceId(),
                            event.getAxisValue(MotionEvent.AXIS_HAT_X),
                            event.getAxisValue(MotionEvent.AXIS_HAT_Y),
                            event.getAxisValue(MotionEvent.AXIS_X),
                            event.getAxisValue(MotionEvent.AXIS_Y))) {
                        bridge.sendInput(directionInput(direction));
                    }
                }
                return true;
            };
            root.setOnGenericMotionListener(motionListener);
            web.setOnGenericMotionListener(motionListener);
            resources.add(() -> {
                root.setOnGenericMotionListener(null);
                web.setOnGenericMotionListener(null);
                motionInput.reset();
            });
            web.setWebViewClient(new LockedWebViewClient(assets, bootstrap));
            root.addView(web, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT));

            WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                    WindowManager.LayoutParams.MATCH_PARENT,
                    WindowManager.LayoutParams.MATCH_PARENT,
                    WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                    android.graphics.PixelFormat.TRANSLUCENT);
            params.setTitle("Korri gameplay overlay");
            windows.addView(root, params);
            resources.add(() -> {
                try {
                    windows.removeViewImmediate(root);
                } catch (RuntimeException ignored) {
                }
            });
            web.loadUrl(KorriOverlayBridge.OVERLAY_URL);
            bootstrap.start();
            if (fatalDuringCreate[0]) {
                throw new IllegalStateException("overlay bootstrap failed during creation");
            }

            return new OverlayWindow() {
                private String authorityIdentity = identity(KorriBrainService.overlayAuthority());

                @Override
                public void sendInput(String inputJson) {
                    if (!resources.isDestroyed()) bridge.sendInput(inputJson);
                }

                @Override
                public void refreshAuthority() {
                    if (resources.isDestroyed()) return;
                    KorriOverlayBridge.Authority authority = KorriBrainService.overlayAuthority();
                    String next = identity(authority);
                    if (next == null || !next.equals(authorityIdentity)) {
                        authorityIdentity = next;
                        bridge.sendAuthority();
                    }
                }

                private boolean preDismissed;

                @Override
                public boolean preDismiss() {
                    if (resources.isDestroyed()) return false;
                    if (preDismissed) return true;
                    root.setVisibility(View.INVISIBLE);
                    root.clearFocus();
                    params.flags |= WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                            | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE;
                    try {
                        windows.updateViewLayout(root, params);
                        preDismissed = true;
                        return true;
                    } catch (RuntimeException failure) {
                        params.flags &= ~(WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                                | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE);
                        root.setVisibility(View.VISIBLE);
                        web.requestFocus();
                        return false;
                    }
                }

                @Override
                public void restoreAfterFailure() {
                    if (resources.isDestroyed() || !preDismissed) return;
                    preDismissed = false;
                    params.flags &= ~(WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                            | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE);
                    windows.updateViewLayout(root, params);
                    root.setVisibility(View.VISIBLE);
                    web.requestFocus();
                }

                @Override
                public void destroy() {
                    resources.destroy();
                }
            };
        } catch (Exception | Error failure) {
            resources.destroy();
            throw failure;
        }
    }

    private static String identity(KorriOverlayBridge.Authority authority) {
        if (authority == null) return null;
        return authority.port() + ":" + authority.capability() + ":" + authority.launchId();
    }

    private static String directionInput(String direction) {
        try {
            return new JSONObject()
                    .put("type", "direction")
                    .put("direction", direction)
                    .put("source", "gamepad")
                    .toString();
        } catch (Exception impossible) {
            throw new IllegalStateException(impossible);
        }
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
        private final BootstrapGuard lifecycle;

        LockedWebViewClient(WebViewAssetLoader assets, BootstrapGuard lifecycle) {
            this.assets = assets;
            this.lifecycle = lifecycle;
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
        public void onReceivedError(
                WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) lifecycle.mainFrameFailed();
        }

        @Override
        public void onReceivedHttpError(
                WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
            if (request.isForMainFrame()) lifecycle.mainFrameFailed();
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            lifecycle.rendererLost();
            return true;
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

    interface TimeoutScheduler {
        KorriLaunchContinuity.Cancellable schedule(Runnable callback);
    }

    /** Bootstrap timeout plus one-shot fatal ownership for the WebView lifetime. */
    static final class BootstrapGuard {
        private final TimeoutScheduler scheduler;
        private final Runnable fatal;
        private KorriLaunchContinuity.Cancellable timeout;
        private boolean ready;
        private boolean fatalReported;
        private boolean destroyed;

        BootstrapGuard(TimeoutScheduler scheduler, Runnable fatal) {
            this.scheduler = scheduler;
            this.fatal = fatal;
        }

        void start() {
            if (!ready && !fatalReported && !destroyed && timeout == null) {
                timeout = scheduler.schedule(this::fail);
            }
        }

        void ready() {
            if (destroyed || fatalReported) return;
            ready = true;
            cancelTimeout();
        }

        void mainFrameFailed() {
            fail();
        }

        void rendererLost() {
            fail();
        }

        void fail() {
            if (destroyed || fatalReported) return;
            fatalReported = true;
            cancelTimeout();
            fatal.run();
        }

        void destroy() {
            if (destroyed) return;
            destroyed = true;
            cancelTimeout();
        }

        private void cancelTimeout() {
            if (timeout != null) timeout.cancel();
            timeout = null;
        }
    }

    /** Reverse-order ownership for partially and fully constructed windows. */
    static final class OverlayResources {
        private final List<Runnable> cleanup = new ArrayList<>();
        private boolean destroyed;

        void add(Runnable action) {
            if (destroyed) {
                action.run();
                return;
            }
            cleanup.add(action);
        }

        boolean isDestroyed() {
            return destroyed;
        }

        void destroy() {
            if (destroyed) return;
            destroyed = true;
            for (int index = cleanup.size() - 1; index >= 0; index--) {
                try {
                    cleanup.get(index).run();
                } catch (RuntimeException ignored) {
                }
            }
            cleanup.clear();
        }
    }

    public interface OverlayWindow {
        void sendInput(String inputJson);
        void refreshAuthority();
        boolean preDismiss();
        void restoreAfterFailure();
        void destroy();
    }

    public interface WindowFactory {
        OverlayWindow create() throws Exception;
    }

    /** Atomic, idempotent add/remove ownership independent of Android callbacks. */
    public static final class WindowController {
        private final WindowFactory factory;
        private OverlayWindow window;
        private boolean preDismissed;
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
                    preDismissed = false;
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
            if (window != null && !preDismissed) window.refreshAuthority();
        }

        public boolean preDismiss() {
            if (window == null || destroyed) return false;
            if (preDismissed) return true;
            preDismissed = window.preDismiss();
            return preDismissed;
        }

        public void restoreAfterFailure() {
            if (window == null || !preDismissed || destroyed) return;
            window.restoreAfterFailure();
            preDismissed = false;
        }

        public boolean isPreDismissed() {
            return preDismissed;
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

    /** Old-overlay-compatible hat/stick edge translation for the focused window. */
    public static final class OverlayMotionInput {
        private final Map<Integer, int[]> edges = new HashMap<>();

        public static boolean owns(int source) {
            return (source & InputDevice.SOURCE_CLASS_JOYSTICK) != 0;
        }

        public static boolean mutates(int action) {
            return action == MotionEvent.ACTION_MOVE;
        }

        public List<String> directions(
                int deviceId, float hatX, float hatY, float stickX, float stickY) {
            float x = hatX;
            float y = hatY;
            if (Math.abs(x) < 0.5f && Math.abs(y) < 0.5f) {
                x = stickX;
                y = stickY;
            }
            int navX = x > 0.5f ? 1 : (x < -0.5f ? -1 : 0);
            int navY = y > 0.5f ? 1 : (y < -0.5f ? -1 : 0);
            int[] prior = edges.computeIfAbsent(deviceId, ignored -> new int[] { 0, 0 });
            List<String> directions = new ArrayList<>(2);
            if (navX != prior[0] && navX != 0) {
                directions.add(navX > 0 ? "right" : "left");
            }
            if (navY != prior[1] && navY != 0) {
                directions.add(navY > 0 ? "down" : "up");
            }
            prior[0] = navX;
            prior[1] = navY;
            return directions;
        }

        public void reset() {
            edges.clear();
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

        private static final class OwnedKey {
            private final int deviceId;
            private final int keyCode;

            OwnedKey(int deviceId, int keyCode) {
                this.deviceId = deviceId;
                this.keyCode = keyCode;
            }

            @Override
            public boolean equals(Object other) {
                if (!(other instanceof OwnedKey)) return false;
                OwnedKey key = (OwnedKey) other;
                return deviceId == key.deviceId && keyCode == key.keyCode;
            }

            @Override
            public int hashCode() {
                return Objects.hash(deviceId, keyCode);
            }
        }

        private final Set<OwnedKey> owned = new HashSet<>();
        private boolean destroyed;

        public Decision route(
                int deviceId,
                int keyCode,
                int source,
                int action,
                int repeatCount,
                boolean showing,
                boolean canceled) {
            if (destroyed) return new Decision(false, null, false);

            OwnedKey key = new OwnedKey(deviceId, keyCode);
            boolean isOwned = owned.contains(key);
            if (canceled || action == KeyEvent.ACTION_UP) {
                if (isOwned) owned.remove(key);
                return new Decision(isOwned, null, false);
            }
            if (action != KeyEvent.ACTION_DOWN) {
                return new Decision(isOwned, null, false);
            }
            if (!isOwned) {
                if (!showing || repeatCount != 0 || !isGameplaySource(source)
                        || isAndroidReservedKey(keyCode)) {
                    return new Decision(false, null, false);
                }
                owned.add(key);
            }

            String type = null;
            String direction = null;
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
                    break;
                case KeyEvent.KEYCODE_MENU:
                case KeyEvent.KEYCODE_BUTTON_START:
                    type = "menu";
                    break;
                case KeyEvent.KEYCODE_BUTTON_SELECT:
                    type = "options";
                    break;
                default:
                    break;
            }
            if (type == null || (repeatCount > 0 && direction == null)) {
                return new Decision(true, null, false);
            }

            boolean dismiss = "back".equals(type) && repeatCount == 0;
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

        private static boolean isGameplaySource(int source) {
            return (source & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD
                    || (source & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK;
        }

        private static boolean isAndroidReservedKey(int keyCode) {
            switch (keyCode) {
                case KeyEvent.KEYCODE_BUTTON_MODE:
                case KeyEvent.KEYCODE_HOME:
                case KeyEvent.KEYCODE_POWER:
                case KeyEvent.KEYCODE_VOLUME_UP:
                case KeyEvent.KEYCODE_VOLUME_DOWN:
                case KeyEvent.KEYCODE_VOLUME_MUTE:
                case KeyEvent.KEYCODE_MUTE:
                case KeyEvent.KEYCODE_APP_SWITCH:
                case KeyEvent.KEYCODE_SYSRQ:
                case KeyEvent.KEYCODE_SLEEP:
                case KeyEvent.KEYCODE_WAKEUP:
                case KeyEvent.KEYCODE_BRIGHTNESS_UP:
                case KeyEvent.KEYCODE_BRIGHTNESS_DOWN:
                case KeyEvent.KEYCODE_SYSTEM_NAVIGATION_UP:
                case KeyEvent.KEYCODE_SYSTEM_NAVIGATION_DOWN:
                case KeyEvent.KEYCODE_SYSTEM_NAVIGATION_LEFT:
                case KeyEvent.KEYCODE_SYSTEM_NAVIGATION_RIGHT:
                case KeyEvent.KEYCODE_SETTINGS:
                case KeyEvent.KEYCODE_ALL_APPS:
                case KeyEvent.KEYCODE_ASSIST:
                case KeyEvent.KEYCODE_VOICE_ASSIST:
                    return true;
                default:
                    return false;
            }
        }

        public void destroy() {
            destroyed = true;
            owned.clear();
        }
    }

    public enum RequestResult {
        DELIVERED,
        REJECTED,
        UNAVAILABLE
    }

    interface RequestHost {
        boolean accepts(KorriOverlayHostExclusion.Owner owner, String launchId);
        boolean requestShow(KorriOverlayHostExclusion.Owner owner, String launchId);
        boolean requestDismiss(KorriOverlayHostExclusion.Owner owner, String launchId);
    }

    interface MainDispatcher {
        boolean isMainThread();
        void post(Runnable request);
    }

    /** Owns the one current process-local service target; no Android IPC is exposed. */
    static final class ProcessRequests {
        private final KorriOverlayHostExclusion owners;
        private RequestHost current;
        private MainDispatcher dispatcher;

        ProcessRequests(KorriOverlayHostExclusion owners) {
            this.owners = Objects.requireNonNull(owners);
        }

        public synchronized void connect(RequestHost host, MainDispatcher mainDispatcher) {
            current = Objects.requireNonNull(host);
            dispatcher = Objects.requireNonNull(mainDispatcher);
        }

        public synchronized void disconnect(RequestHost host) {
            if (current != host) return;
            current = null;
            dispatcher = null;
        }

        public RequestResult requestShow(
                KorriOverlayHostExclusion.Owner owner, String launchId) {
            return request(owner, launchId, true);
        }

        public RequestResult requestDismiss(
                KorriOverlayHostExclusion.Owner owner, String launchId) {
            return request(owner, launchId, false);
        }

        private RequestResult request(
                KorriOverlayHostExclusion.Owner owner, String launchId, boolean visible) {
            final RequestHost target;
            final MainDispatcher main;
            synchronized (this) {
                target = current;
                main = dispatcher;
            }
            if (target == null || main == null) return RequestResult.UNAVAILABLE;
            // Reject before queueing if any part of the exact current Game,
            // launch, foreground, or service scope has already changed.
            if (!owners.isCurrent(owner) || !target.accepts(owner, launchId)) {
                return RequestResult.REJECTED;
            }
            if (main.isMainThread()) return deliver(target, owner, launchId, visible);
            main.post(() -> deliver(target, owner, launchId, visible));
            return RequestResult.DELIVERED;
        }

        private synchronized RequestResult deliver(
                RequestHost target,
                KorriOverlayHostExclusion.Owner owner,
                String launchId,
                boolean visible) {
            // Revalidate all generations and session scope after main-thread
            // marshalling. A queued predecessor can never reach a replacement.
            if (current != target
                    || !owners.isCurrent(owner)
                    || !target.accepts(owner, launchId)) {
                return RequestResult.REJECTED;
            }
            boolean accepted = visible
                    ? target.requestShow(owner, launchId)
                    : target.requestDismiss(owner, launchId);
            return accepted ? RequestResult.DELIVERED : RequestResult.REJECTED;
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
        private Integer guideOwnerDeviceId;
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

        public boolean acceptsRequest(String launchId) {
            return isExactRequestScope(launchId);
        }

        public boolean requestShow(String launchId) {
            if (!acceptsRequest(launchId)) return false;
            updateOverlayVisibility(true);
            return true;
        }

        public boolean requestDismiss(String launchId) {
            if (!acceptsRequest(launchId)) return false;
            updateOverlayVisibility(false);
            return true;
        }

        public boolean ownsVisibleOverlayForeground(String packageName, String className) {
            if (!showing || !servicePackage.equals(packageName) || className == null) {
                return false;
            }
            // Measured TYPE_ACCESSIBILITY_OVERLAY roots report the platform root,
            // never one of Korri's Activity classes. Unknown classes fail closed.
            return FrameLayout.class.getName().equals(className);
        }

        public String updateForeground(String packageName, String className) {
            if (ownsVisibleOverlayForeground(packageName, className)) return null;
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
            return onKey(-1, keyCode, action, false);
        }

        public boolean onKey(int keyCode, int action, boolean canceled) {
            return onKey(-1, keyCode, action, canceled);
        }

        public boolean onKey(int deviceId, int keyCode, int action, boolean canceled) {
            if (destroyed || keyCode != KeyEvent.KEYCODE_BUTTON_MODE) return false;
            boolean ownedByDevice = guideOwnerDeviceId != null
                    && guideOwnerDeviceId == deviceId;
            if (canceled) {
                if (!ownedByDevice) return false;
                guideOwnerDeviceId = null;
                return true;
            }
            boolean active = showing || isArmed();
            if (action == KeyEvent.ACTION_DOWN) {
                if (guideOwnerDeviceId != null) return ownedByDevice;
                if (!active) return false;
                guideOwnerDeviceId = deviceId;
                return true;
            }
            if (action == KeyEvent.ACTION_UP) {
                if (!ownedByDevice) return false;
                guideOwnerDeviceId = null;
                if (active) {
                    updateOverlayVisibility(!showing);
                    toggleCount++;
                }
                return true;
            }
            return ownedByDevice;
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
            guideOwnerDeviceId = null;
        }

        public void destroy() {
            destroyed = true;
            launch = null;
            ownerArmed = false;
            matchedLaunchId = null;
            suspendedLaunchId = null;
            interrupt();
        }

        private boolean isExactRequestScope(String launchId) {
            return !destroyed
                    && launchId != null
                    && launch != null
                    && launchId.equals(launch.launchId())
                    && ownerArmed
                    && launchId.equals(matchedLaunchId)
                    && !launchId.equals(suspendedLaunchId)
                    && (isForegroundMatch()
                        || ownsVisibleOverlayForeground(foregroundPackage, foregroundClass));
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
