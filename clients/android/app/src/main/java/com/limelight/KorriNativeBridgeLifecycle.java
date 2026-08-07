package com.limelight;

import android.net.Uri;

/**
 * Owns the WebView JavaScript-interface timing invariant for KorriNative.
 * Android exposes a newly-added interface only after a future navigation, so
 * the trusted portal's initial interface must survive its load callbacks.
 */
final class KorriNativeBridgeLifecycle {
    static final String BRIDGE_NAME = "KorriNative";

    interface Operations {
        void addJavascriptInterface();

        void removeJavascriptInterface();
    }

    void installBeforeInitialLoad(
            Uri uri,
            KorriTrustedPortalWebViewPolicy portalPolicy,
            Operations operations) {
        if (portalPolicy.isTrustedPortalResource(uri)) {
            operations.addJavascriptInterface();
        }
    }

    void onMainFramePageStarted(
            Uri uri,
            KorriTrustedPortalWebViewPolicy portalPolicy,
            Operations operations) {
        if (!portalPolicy.isTrustedPortalResource(uri)) {
            operations.removeJavascriptInterface();
        }
    }

    void onMainFramePageFinished() {
        // The already-injected bridge is intentionally preserved. Removing or
        // re-adding it here would make the current trusted document miss it.
    }
}
