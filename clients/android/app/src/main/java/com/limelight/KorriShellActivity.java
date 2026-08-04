package com.limelight;

import android.annotation.SuppressLint;
import android.content.ComponentName;
import android.content.Intent;
import android.content.ServiceConnection;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;
import android.view.KeyEvent;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.appcompat.app.AppCompatActivity;
import androidx.webkit.WebViewAssetLoader;

import com.limelight.computers.ComputerManagerListener;
import com.limelight.computers.ComputerManagerService;
import com.limelight.nvstream.http.ComputerDetails;
import com.limelight.nvstream.http.NvApp;
import com.limelight.nvstream.http.NvHTTP;
import com.limelight.nvstream.http.PairingManager;
import com.limelight.utils.CacheHelper;
import com.limelight.utils.ServerHelper;
import com.simonwjackson.korri.korrid.KorriBrainService;
import com.simonwjackson.korri.korrid.KorridServer;

import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.File;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

/**
 * SPIKE: Korri web-shell launcher embedded in the Artemis APK.
 *
 * Proves the one-APK architecture: a WebView owns the launcher surface and a
 * narrow typed bridge (not art:// deep links) drives the orchestrated Korri
 * flow — korrid catalog -> signed Moonlight preparation -> native Game
 * activity against the plugin-owned Sunshine app selection. No trampoline hop,
 * no second launcher icon: streaming is an implementation detail of one app.
 */
public class KorriShellActivity extends AppCompatActivity {
    private static final String NOTIFICATION_PREFS = "korri-notifications";
    private static final String PREF_NOTIFICATION_PERMISSION_ASKED = "notification-permission-asked";

    private WebView webView;
    private int korridPort = -1;
    private String korridCapability = "";
    private ComputerManagerService.ComputerManagerBinder managerBinder;
    private final CountDownLatch binderReady = new CountDownLatch(1);

    private final ServiceConnection serviceConnection = new ServiceConnection() {
        public void onServiceConnected(ComponentName className, IBinder binder) {
            final ComputerManagerService.ComputerManagerBinder localBinder =
                    (ComputerManagerService.ComputerManagerBinder) binder;
            new Thread(() -> {
                localBinder.waitForReady();
                managerBinder = localBinder;
                binderReady.countDown();
            }).start();
        }

        public void onServiceDisconnected(ComponentName className) {
            managerBinder = null;
        }
    };

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Embedded korrid: only this exact portal origin may present the
        // per-server capability to the localhost brain.
        final String portalUrl = portalUrl();
        korridPort = KorriBrainService.ensureRunning(
                this, portalOrigin(portalUrl), localStorageRoot());
        korridCapability = KorridServer.capability();

        bindService(new Intent(this, ComputerManagerService.class),
                serviceConnection, BIND_AUTO_CREATE);

        webView = new WebView(this);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.setBackgroundColor(0xFF101018);
        // file:// cannot serve the portal: WebView blocks ES modules and
        // stylesheets there (CORS, origin null). The asset loader maps
        // https://appassets.androidplatform.net/assets/** onto the APK's
        // assets with a real https origin.
        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(
                    WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                view.evaluateJavascript("document.title", title ->
                        Log.i("KorriPortal", "title=" + title));
            }
        });
        if (BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        webView.addJavascriptInterface(new KorriNativeBridge(), "KorriNative");
        webView.loadUrl(portalUrl);
        setContentView(webView);
    }

    /**
     * The portal ships as bundled assets (built by `nix run .#portal-bundle`).
     * Debug builds may override with -PkorriPortalUrl=http://<ip>:5173 for
     * a live Vite dev-server loop on the device.
     */
    /** True when the user can actually see Korri's background notice. */
    private boolean notificationsAllowed() {
        return androidx.core.app.NotificationManagerCompat.from(this).areNotificationsEnabled();
    }

    private boolean notificationPermissionAsked() {
        return notificationPreferences().getBoolean(PREF_NOTIFICATION_PERMISSION_ASKED, false);
    }

    private void markNotificationPermissionAsked() {
        notificationPreferences()
                .edit()
                .putBoolean(PREF_NOTIFICATION_PERMISSION_ASKED, true)
                .apply();
    }

    private SharedPreferences notificationPreferences() {
        return getSharedPreferences(NOTIFICATION_PREFS, MODE_PRIVATE);
    }

    private String portalUrl() {
        String devUrl = BuildConfig.PORTAL_DEV_URL;
        if (BuildConfig.DEBUG && devUrl != null && !devUrl.isEmpty()) {
            return devUrl;
        }
        return "https://appassets.androidplatform.net/assets/portal/index.html";
    }

    private static String portalOrigin(String url) {
        Uri uri = Uri.parse(url);
        if (uri.getScheme() == null || uri.getEncodedAuthority() == null) {
            throw new IllegalArgumentException("portal URL has no origin: " + url);
        }
        return uri.getScheme() + "://" + uri.getEncodedAuthority();
    }

    /** Android supplies storage location; korrid owns everything beneath it. */
    private static String localStorageRoot() {
        return new File(Environment.getExternalStorageDirectory(), "korri")
                .getAbsolutePath();
    }

    /**
     * Semantic input seam — the WebView never sees a key code.
     *
     * Hardware truth (key codes, controller quirks) stays here: navigation-
     * relevant keys are translated into the semantic vocabulary defined in
     * contracts/bridge/korri-native-bridge.ts (BridgeInputEvent) and pushed
     * to the portal via window.__korriInput. Everything else falls through
     * to normal dispatch.
     */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        String semanticJson = toSemanticInputJson(event.getKeyCode());
        if (semanticJson == null) {
            return super.dispatchKeyEvent(event);
        }
        if (event.getAction() == KeyEvent.ACTION_DOWN && webView != null) {
            webView.evaluateJavascript(
                    "window.__korriInput && window.__korriInput('"
                            + semanticJson + "')", null);
        }
        return true;
    }

    private static String toSemanticInputJson(int keyCode) {
        switch (keyCode) {
            case KeyEvent.KEYCODE_DPAD_UP:
                return "{\"type\":\"direction\",\"direction\":\"up\",\"source\":\"gamepad\"}";
            case KeyEvent.KEYCODE_DPAD_DOWN:
                return "{\"type\":\"direction\",\"direction\":\"down\",\"source\":\"gamepad\"}";
            case KeyEvent.KEYCODE_DPAD_LEFT:
                return "{\"type\":\"direction\",\"direction\":\"left\",\"source\":\"gamepad\"}";
            case KeyEvent.KEYCODE_DPAD_RIGHT:
                return "{\"type\":\"direction\",\"direction\":\"right\",\"source\":\"gamepad\"}";
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_BUTTON_A:
                return "{\"type\":\"confirm\",\"source\":\"gamepad\"}";
            case KeyEvent.KEYCODE_BUTTON_B:
            case KeyEvent.KEYCODE_BACK:
                return "{\"type\":\"back\",\"source\":\"gamepad\"}";
            case KeyEvent.KEYCODE_BUTTON_START:
            case KeyEvent.KEYCODE_MENU:
                return "{\"type\":\"menu\",\"source\":\"gamepad\"}";
            case KeyEvent.KEYCODE_BUTTON_SELECT:
                return "{\"type\":\"options\",\"source\":\"gamepad\"}";
            default:
                return null;
        }
    }

    @Override
    protected void onDestroy() {
        // korrid deliberately outlives this screen: launching a game destroys
        // the activity, and the brain must keep serving while the game runs.
        // KorriBrainService owns the shutdown now.
        super.onDestroy();
        if (managerBinder != null) {
            unbindService(serviceConnection);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Returning from a stream: let the web surface refresh its state.
        if (webView != null) {
            webView.evaluateJavascript(
                    "window.dispatchEvent(new Event('korri-shell-resumed'))", null);
        }
    }

    private interface ActivityStart {
        void run() throws Exception;
    }

    /**
     * Narrow spike contract between the Korri web surface and the Android
     * runtime. Deals in Korri-shaped concepts (hosts, apps, launch requests),
     * never in raw intent extras or pairing material.
     */
    private class KorriNativeBridge {

        // --- Treaty surface: contracts/bridge/korri-native-bridge.ts ---
        // These methods mirror KorriNativeBridgeSurface. When the two sides
        // disagree, the contracts file wins.

        @JavascriptInterface
        public int bridgeVersion() {
            // Mirrors BRIDGE_VERSION in contracts/bridge/korri-native-bridge.ts.
            return 12;
        }

        @JavascriptInterface
        public String systemInfo() {
            try {
                String appVersion = getPackageManager()
                        .getPackageInfo(getPackageName(), 0).versionName;
                JSONObject payload = new JSONObject();
                payload.put("device", Build.MODEL);
                payload.put("manufacturer", Build.MANUFACTURER);
                payload.put("androidRelease", Build.VERSION.RELEASE);
                payload.put("sdk", Build.VERSION.SDK_INT);
                payload.put("appVersion", appVersion == null ? "Unknown" : appVersion);
                JSONObject result = new JSONObject();
                result.put("_tag", "SystemInfo");
                result.put("payload", payload);
                return result.toString();
            } catch (Exception error) {
                return "{\"_tag\":\"Unavailable\",\"message\":"
                        + JSONObject.quote(error.toString()) + "}";
            }
        }

        /**
         * Whether the user can see Korri running in the background. Reports
         * what is visible, not whether the brain is up: Android lets the
         * notice be hidden while the service keeps running.
         */
        @JavascriptInterface
        public String backgroundNotice() {
            return notificationsAllowed()
                    ? "{\"_tag\":\"Visible\"}"
                    : "{\"_tag\":\"Hidden\"}";
        }

        /**
         * Ask Android for permission to show the notice. Android stops
         * prompting once the user has declined twice, so a refusal to prompt
         * is reported plainly rather than as a denial.
         */
        @JavascriptInterface
        public String requestBackgroundNotice() {
            if (Build.VERSION.SDK_INT < 33) {
                // Older Android grants this at install time.
                return "{\"_tag\":\"Granted\"}";
            }
            if (notificationsAllowed()) {
                return "{\"_tag\":\"Granted\"}";
            }
            boolean rationale = shouldShowRequestPermissionRationale(
                    android.Manifest.permission.POST_NOTIFICATIONS);
            if (KorriNotificationPermissionPrompt.decision(
                    notificationPermissionAsked(), rationale)
                    == KorriNotificationPermissionPrompt.Decision.UNPROMPTED) {
                return "{\"_tag\":\"Unprompted\"}";
            }
            try {
                startActivityOnUiThread(
                        () -> requestPermissions(
                                new String[] {android.Manifest.permission.POST_NOTIFICATIONS}, 91),
                        "notification permission request timed out");
                markNotificationPermissionAsked();
            } catch (Exception error) {
                return "{\"_tag\":\"Unprompted\"}";
            }
            // The dialog is asynchronous; the portal re-reads backgroundNotice()
            // on korri-shell-resumed, exactly as it does for file access.
            return "{\"_tag\":\"Prompted\"}";
        }

        /**
         * Take the user to the system screen. Hiding the notice is the user's
         * to do -- an app may not hide its own -- so turning it off always
         * ends up here.
         */
        @JavascriptInterface
        public String openNotificationSettings() {
            try {
                Intent intent = new Intent(
                        android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                intent.putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, getPackageName());
                startActivityOnUiThread(intent, "notification settings start timed out");
                return "{\"_tag\":\"Opened\"}";
            } catch (Exception error) {
                return "{\"_tag\":\"Unavailable\",\"message\":"
                        + JSONObject.quote(String.valueOf(error.getMessage())) + "}";
            }
        }

        /**
         * Open the native pairing surface. Pairing exchanges a PIN and stores
         * certificates, which stays out of the portal; this only gets the user
         * there.
         */
        @JavascriptInterface
        public String openPairing() {
            try {
                startActivityOnUiThread(
                        new Intent(KorriShellActivity.this, PcView.class),
                        "pairing screen start timed out");
                return "{\"_tag\":\"Opened\"}";
            } catch (Exception error) {
                return "{\"_tag\":\"Unavailable\",\"message\":"
                        + JSONObject.quote(String.valueOf(error.getMessage())) + "}";
            }
        }

        /**
         * Whether Korri may use the user-visible storage its settings, plugins
         * and local-game files live in. Below Android 11 the concept does not
         * exist, so nothing needs granting.
         */
        @JavascriptInterface
        public String storageAccess() {
            try {
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
                    return "{\"_tag\":\"NotRequired\"}";
                }
                return Environment.isExternalStorageManager()
                        ? "{\"_tag\":\"Granted\"}"
                        : "{\"_tag\":\"Denied\"}";
            } catch (Throwable error) {
                return "{\"_tag\":\"QueryFailed\",\"message\":"
                        + JSONObject.quote(String.valueOf(error.getMessage())) + "}";
            }
        }

        /**
         * Take the user to the system screen where file access is granted. The
         * shell cannot grant it; returning `Opened` means only that the screen
         * was shown.
         */
        @JavascriptInterface
        public String openStorageAccessSettings() {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
                return "{\"_tag\":\"Unavailable\",\"message\":"
                        + JSONObject.quote("This version of Android grants file access at install time")
                        + "}";
            }
            try {
                requestAllFilesAccess();
                return "{\"_tag\":\"Opened\"}";
            } catch (Exception error) {
                return "{\"_tag\":\"Unavailable\",\"message\":"
                        + JSONObject.quote(String.valueOf(error.getMessage())) + "}";
            }
        }

        /** Port of the embedded korrid server, or -1 when it is not running. */
        @JavascriptInterface
        public int korridPort() {
            return korridPort;
        }

        /** Per-server bearer capability for the localhost korrid RPC. */
        @JavascriptInterface
        public String korridCapability() {
            return korridCapability;
        }

        /** JSON-encoded LaunchLocalResult. */
        @JavascriptInterface
        public String launchLocal(String specJson) {
            if (!KorridServer.verifyLaunchSpec(specJson)) {
                return launchFailed("InvalidSpec",
                        "local launch instruction failed integrity verification");
            }
            final KorriLocalLaunchSpec.Parsed spec;
            try {
                spec = KorriLocalLaunchSpec.parse(specJson, new File(localStorageRoot()));
            } catch (KorriLocalLaunchSpec.Invalid error) {
                return launchFailed(error.reason, error.getMessage());
            }

            // Validate package availability before any external-storage write.
            final Intent intent;
            if (spec.isAndroidApp) {
                Intent launch = getPackageManager()
                        .getLaunchIntentForPackage(spec.component.getPackageName());
                if (launch == null) {
                    return launchFailed("NotInstalled", "local launcher is not installed");
                }
                intent = launch;
            } else {
                intent = spec.intent();
                try {
                    getPackageManager().getActivityInfo(intent.getComponent(), 0);
                } catch (PackageManager.NameNotFoundException error) {
                    return launchFailed("NotInstalled", "local launcher is not installed");
                }
            }
            KorriLocalLaunchSpec.applyTaskPolicy(spec, intent);

            boolean hasProvisioning = !spec.directories.isEmpty() || !spec.files.isEmpty();
            if (hasProvisioning
                    && !KorriLocalLaunchSpec.supportsStorageProvisioning(Build.VERSION.SDK_INT)) {
                return launchFailed(
                        "ProvisionFailed",
                        "Local game storage provisioning requires Android 11 or newer");
            }
            boolean hasAllFilesAccess = Build.VERSION.SDK_INT < Build.VERSION_CODES.R
                    || Environment.isExternalStorageManager();
            if (KorriLocalLaunchSpec.requiresStorageGrant(
                    spec,
                    Build.VERSION.SDK_INT,
                    hasAllFilesAccess)) {
                try {
                    requestAllFilesAccess();
                } catch (Exception error) {
                    return launchFailed(
                            "ProvisionFailed",
                            "Unable to open Android all files access settings");
                }
                return launchFailed(
                        "ProvisionFailed",
                        "Grant Korri all files access, then return and retry");
            }
            try {
                for (String directory : spec.directories) {
                    provisionDirectory(directory);
                }
                for (KorriLocalLaunchSpec.FileSpec file : spec.files) {
                    provisionFile(file.path, file.content);
                }
            } catch (Exception error) {
                return launchFailed("ProvisionFailed",
                        error.getMessage() != null
                                ? error.getMessage()
                                : "local file provisioning failed");
            }

            CountDownLatch started = new CountDownLatch(1);
            AtomicReference<Exception> startError = new AtomicReference<>();
            runOnUiThread(() -> {
                try {
                    startActivity(intent);
                } catch (Exception error) {
                    startError.set(error);
                } finally {
                    started.countDown();
                }
            });
            try {
                if (!started.await(5, TimeUnit.SECONDS)) {
                    return launchFailed("StartFailed", "local launcher start timed out");
                }
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                return launchFailed("StartFailed", "local launcher start interrupted");
            }
            Exception error = startError.get();
            if (error != null) {
                return launchFailed("StartFailed",
                        error.getMessage() != null ? error.getMessage() : "start failed");
            }
            return "{\"_tag\":\"Launched\"}";
        }

        private void requestAllFilesAccess() throws Exception {
            startActivityOnUiThread(() -> {
                try {
                    startActivity(new Intent(
                            Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                            Uri.parse("package:" + getPackageName())));
                } catch (Exception appSettingsError) {
                    startActivity(new Intent(
                            Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION));
                }
            }, "all files access settings timed out");
        }

        private void startActivityOnUiThread(Intent intent, String timeoutMessage)
                throws Exception {
            startActivityOnUiThread(() -> startActivity(intent), timeoutMessage);
        }

        private void startActivityOnUiThread(ActivityStart start, String timeoutMessage)
                throws Exception {
            if (Looper.myLooper() == Looper.getMainLooper()) {
                start.run();
                return;
            }

            CountDownLatch opened = new CountDownLatch(1);
            AtomicReference<Exception> startError = new AtomicReference<>();
            runOnUiThread(() -> {
                try {
                    start.run();
                } catch (Exception error) {
                    startError.set(error);
                } finally {
                    opened.countDown();
                }
            });
            try {
                if (!opened.await(5, TimeUnit.SECONDS)) {
                    throw new IllegalStateException(timeoutMessage);
                }
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                throw error;
            }
            if (startError.get() != null) {
                throw startError.get();
            }
        }

        private void provisionDirectory(String targetPath) throws Exception {
            File directory = new File(targetPath);
            if (!directory.isDirectory() && !directory.mkdirs()) {
                throw new IllegalStateException("cannot create provisioned directory");
            }
        }

        /** Write a validated korrid-provided file at the Android storage edge. */
        private void provisionFile(String targetPath, String content) throws Exception {
            File korriRoot = new File(localStorageRoot()).getCanonicalFile();
            File target = new File(targetPath).getCanonicalFile();
            String rootPrefix = korriRoot.getPath() + File.separator;
            if (!target.getPath().startsWith(rootPrefix)) {
                throw new IllegalArgumentException("provision path is outside Korri storage");
            }
            File parent = target.getParentFile();
            if (parent == null || (!parent.isDirectory() && !parent.mkdirs())) {
                throw new IllegalStateException("cannot create provisioned file directory");
            }
            KorriAtomicFile.write(target, content.getBytes(StandardCharsets.UTF_8));
        }

        private String launchFailed(String reason, String message) {
            try {
                JSONObject failed = new JSONObject();
                failed.put("_tag", "LaunchFailed");
                failed.put("reason", reason);
                failed.put("message", message);
                return failed.toString();
            } catch (Exception e) {
                return "{\"_tag\":\"LaunchFailed\",\"reason\":\"" + reason
                        + "\",\"message\":\"\"}";
            }
        }

        /** JSON-encoded QueryStreamHostsResult. */
        @JavascriptInterface
        public String queryStreamHosts() {
            try {
                JSONArray items = new JSONArray();
                com.limelight.computers.ComputerDatabaseManager db =
                        new com.limelight.computers.ComputerDatabaseManager(KorriShellActivity.this);
                try {
                    List<ComputerDetails> computers = db.getAllComputers();
                    for (ComputerDetails details : computers) {
                        JSONObject host = new JSONObject();
                        host.put("uuid", details.uuid);
                        host.put("name", details.name);
                        // DB rows never carry live pairState (stays UNKNOWN);
                        // a stored server certificate exists only after a
                        // successful pairing, so it is the durable signal.
                        host.put("paired", details.serverCert != null);
                        items.put(host);
                    }
                } finally {
                    db.close();
                }
                JSONObject ok = new JSONObject();
                ok.put("_tag", "StreamHosts");
                ok.put("items", items);
                return ok.toString();
            } catch (Exception e) {
                return queryFailed(e);
            }
        }

        /** JSON-encoded QueryStreamAppsResult. */
        @JavascriptInterface
        public String queryStreamApps(String hostUuid) {
            try {
                JSONArray items = new JSONArray();
                // Empty cache is a normal state before the host was ever browsed.
                for (NvApp app : cachedAppList(hostUuid)) {
                    JSONObject entry = new JSONObject();
                    entry.put("id", app.getAppId());
                    entry.put("name", app.getAppName());
                    items.put(entry);
                }
                JSONObject ok = new JSONObject();
                ok.put("_tag", "StreamApps");
                ok.put("items", items);
                return ok.toString();
            } catch (Exception e) {
                return queryFailed(e);
            }
        }

        /**
         * JSON-encoded StartStreamResult. The only callable startup surface
         * accepts korrid's signed, one-use Moonlight launch instruction.
         */
        @JavascriptInterface
        public String startStream(String specJson) {
            try {
                String authorization = KorridServer.authorizeMoonlightLaunchSpec(specJson);
                if (!"Authorized".equals(authorization)) {
                    return streamFailed("StartFailed",
                            "Moonlight launch instruction rejected: " + authorization);
                }
                KorriMoonlightLaunchSpec spec = KorriMoonlightLaunchSpec.parse(specJson);
                ComputerManagerService.ComputerManagerBinder binder = awaitBinder(10);
                if (binder == null) {
                    return streamFailed("StartFailed", "computer manager not ready");
                }

                ComputerDetails computer = awaitOnlineComputer(binder, spec.hostUuid, 12);
                if (computer == null) {
                    return streamFailed("HostUnreachable", "host is not reachable");
                }
                if (computer.pairState != PairingManager.PairState.PAIRED) {
                    return streamFailed("NotPaired",
                            "host is not paired — pair once in Artemis setup");
                }

                NvApp app = KorriMoonlightAppResolver
                        .artemis(KorriShellActivity.this, binder, computer)
                        .refreshExpected(spec);

                final Intent intent = ServerHelper.createStartIntent(
                        KorriShellActivity.this, app, computer, binder);
                // Korri-initiated: the stream Activity narrates its lifecycle
                // through the web overlay instead of the native spinner.
                intent.putExtra(Game.EXTRA_KORRI_SESSION, true);
                runOnUiThread(() -> startActivity(intent));
                return "{\"_tag\":\"StreamStarted\"}";
            } catch (KorriMoonlightLaunchSpec.Invalid error) {
                return streamFailed("StartFailed", error.getMessage());
            } catch (KorriMoonlightAppResolver.Failure error) {
                return streamFailed(error.reason, error.getMessage());
            } catch (Exception e) {
                return streamFailed("StartFailed",
                        e.getMessage() != null ? e.getMessage() : "start failed");
            }
        }

        private String queryFailed(Exception e) {
            try {
                JSONObject failed = new JSONObject();
                failed.put("_tag", "QueryFailed");
                failed.put("message",
                        e.getMessage() != null ? e.getMessage() : "query failed");
                return failed.toString();
            } catch (Exception inner) {
                return "{\"_tag\":\"QueryFailed\",\"message\":\"query failed\"}";
            }
        }

        private String streamFailed(String reason, String message) {
            try {
                JSONObject failed = new JSONObject();
                failed.put("_tag", "StreamFailed");
                failed.put("reason", reason);
                failed.put("message", message);
                return failed.toString();
            } catch (Exception e) {
                return "{\"_tag\":\"StreamFailed\",\"reason\":\"" + reason
                        + "\",\"message\":\"\"}";
            }
        }

        // --- Spike-era surface below: not yet part of the treaty ---

        /**
         * Korrid control-plane RPC (Effect RPC over HTTP, single request).
         * Runs on the WebView JS-bridge thread, so a blocking call is fine.
         * Legacy diagnostic RPC surface; stream startup is not reachable here.
         */
        @JavascriptInterface
        public String korriRpc(String rpcUrl, String tag, String payloadJson) {
            try {
                JSONObject body = new JSONObject();
                body.put("_tag", "Request");
                // Effect RPC request ids must parse as BigInt on the server.
                body.put("id", String.valueOf(System.currentTimeMillis() * 1000
                        + (long) (Math.random() * 1000)));
                body.put("tag", tag);
                body.put("payload", new JSONObject(payloadJson));
                body.put("headers", new JSONArray());

                OkHttpClient client = new OkHttpClient.Builder()
                        .callTimeout(20, TimeUnit.SECONDS)
                        .build();
                Request request = new Request.Builder()
                        .url(rpcUrl)
                        .post(RequestBody.create(body.toString(),
                                MediaType.get("application/json")))
                        .build();

                try (Response response = client.newCall(request).execute()) {
                    String text = response.body() != null ? response.body().string() : "";
                    if (!response.isSuccessful()) {
                        return errorResult("HTTP " + response.code() + ": " + text);
                    }
                    Object parsed = new JSONTokener(text).nextValue();
                    JSONArray frames = parsed instanceof JSONArray
                            ? (JSONArray) parsed
                            : new JSONArray().put(parsed);
                    for (int i = 0; i < frames.length(); i++) {
                        JSONObject frame = frames.optJSONObject(i);
                        if (frame == null) continue;
                        JSONObject exit = frame.optJSONObject("exit");
                        if (exit == null) continue;
                        if ("Success".equals(exit.optString("_tag"))) {
                            JSONObject ok = new JSONObject();
                            ok.put("status", "ok");
                            ok.put("value", exit.opt("value"));
                            return ok.toString();
                        }
                        return errorResult("rpc-failure: " + exit);
                    }
                    return errorResult("no Exit frame in RPC response");
                }
            } catch (Exception e) {
                return errorResult(e.getMessage() != null ? e.getMessage() : "rpc failed");
            }
        }

        @JavascriptInterface
        public void openArtemisUi() {
            // Escape hatch into the stock Artemis PcView for pairing/setup.
            runOnUiThread(() -> startActivity(
                    new Intent(KorriShellActivity.this, PcView.class)));
        }

        @JavascriptInterface
        public void openArtemisSettings() {
            // Escape hatch into Artemis streaming settings for tinkering.
            runOnUiThread(() -> startActivity(new Intent(KorriShellActivity.this,
                    com.limelight.preferences.StreamSettings.class)));
        }

        // --- Korri settings contract (theme-free; web surface owns all UI) ---

        @JavascriptInterface
        public String getSettingsSchema() {
            return KorriSettingsBridge.schemaJson(KorriShellActivity.this);
        }

        @JavascriptInterface
        public String getSettingsValues() {
            return KorriSettingsBridge.valuesJson(KorriShellActivity.this);
        }

        @JavascriptInterface
        public String setSetting(String key, String jsonValue) {
            return KorriSettingsBridge.applySetting(KorriShellActivity.this, key, jsonValue);
        }

        private String errorResult(String message) {
            try {
                JSONObject error = new JSONObject();
                error.put("status", "failed");
                error.put("message", message);
                return error.toString();
            } catch (Exception e) {
                return "{\"status\":\"failed\"}";
            }
        }
    }

    private ComputerManagerService.ComputerManagerBinder awaitBinder(int seconds) {
        try {
            binderReady.await(seconds, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        return managerBinder;
    }

    /**
     * Return the computer once it is ONLINE with an active address, polling
     * briefly when needed. This replaces the trampoline's visible spinner
     * screen with an in-shell wait.
     */
    private ComputerDetails awaitOnlineComputer(
            ComputerManagerService.ComputerManagerBinder binder,
            String hostUuid,
            int timeoutSeconds) {
        ComputerDetails existing = binder.getComputer(hostUuid);
        if (existing != null
                && existing.state == ComputerDetails.State.ONLINE
                && existing.activeAddress != null) {
            return existing;
        }

        binder.invalidateStateForComputer(hostUuid);
        final CountDownLatch online = new CountDownLatch(1);
        final ComputerDetails[] resolved = new ComputerDetails[1];
        binder.startPolling(new ComputerManagerListener() {
            @Override
            public void notifyComputerUpdated(ComputerDetails details) {
                if (!details.uuid.equalsIgnoreCase(hostUuid)) return;
                if (details.state == ComputerDetails.State.ONLINE
                        && details.activeAddress != null) {
                    resolved[0] = details;
                    online.countDown();
                } else if (details.state == ComputerDetails.State.OFFLINE) {
                    online.countDown();
                }
            }
        });
        try {
            online.await(timeoutSeconds, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } finally {
            binder.stopPolling();
        }
        return resolved[0];
    }

    private List<NvApp> cachedAppList(String hostUuid) throws Exception {
        String rawAppList = CacheHelper.readInputStreamToString(
                CacheHelper.openCacheFileForInput(getCacheDir(), "applist", hostUuid));
        if (rawAppList.isEmpty()) return java.util.Collections.emptyList();
        return NvHTTP.getAppListByReader(new StringReader(rawAppList));
    }
}
