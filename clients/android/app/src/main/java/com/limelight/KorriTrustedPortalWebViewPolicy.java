package com.limelight;

import android.net.Uri;

import java.util.Locale;

/**
 * Main-shell WebView policy for the privileged Korri portal.
 *
 * The broad KorriNative bridge exposes localhost/native authority. It is safe
 * only for the bundled portal origin, so navigation and resource decisions are
 * made from parsed URL components rather than string-prefix checks.
 */
final class KorriTrustedPortalWebViewPolicy {
    static final String TRUSTED_PORTAL_URL =
            "https://appassets.androidplatform.net/assets/portal/index.html";

    enum NavigationAction {
        ALLOW_IN_WEBVIEW,
        OPEN_EXTERNALLY,
        BLOCK
    }

    private final Origin trustedOrigin;

    KorriTrustedPortalWebViewPolicy() {
        this(Uri.parse(TRUSTED_PORTAL_URL));
    }

    KorriTrustedPortalWebViewPolicy(Uri portalUrl) {
        Origin origin = Origin.from(portalUrl);
        if (origin == null || !isTrustedAssetPath(portalUrl)) {
            throw new IllegalArgumentException("portal URL must be a trusted asset URL");
        }
        trustedOrigin = origin;
    }

    String portalUrl() {
        return TRUSTED_PORTAL_URL;
    }

    String portalOrigin() {
        return trustedOrigin.toString();
    }

    boolean isTrustedPortalAsset(Uri uri) {
        Origin origin = Origin.from(uri);
        return origin != null && trustedOrigin.equals(origin) && isTrustedAssetPath(uri);
    }

    NavigationAction navigationAction(Uri uri, boolean mainFrame) {
        if (isTrustedPortalAsset(uri)) {
            return NavigationAction.ALLOW_IN_WEBVIEW;
        }
        if (mainFrame && isExternalBrowserUrl(uri)) {
            return NavigationAction.OPEN_EXTERNALLY;
        }
        return NavigationAction.BLOCK;
    }

    private static boolean isTrustedAssetPath(Uri uri) {
        if (uri == null || uri.isOpaque()) {
            return false;
        }
        return uri.getPathSegments().size() >= 2
                && "assets".equals(uri.getPathSegments().get(0));
    }

    private static boolean isExternalBrowserUrl(Uri uri) {
        Origin origin = Origin.from(uri);
        if (origin == null || origin.isLoopback()) {
            return false;
        }
        return "https".equals(origin.scheme) || "http".equals(origin.scheme);
    }

    private static final class Origin {
        private final String scheme;
        private final String host;
        private final int port;

        private Origin(String scheme, String host, int port) {
            this.scheme = scheme;
            this.host = host;
            this.port = port;
        }

        static Origin from(Uri uri) {
            if (uri == null || uri.isOpaque()) {
                return null;
            }
            String scheme = uri.getScheme();
            String host = uri.getHost();
            if (scheme == null || host == null || scheme.isEmpty() || host.isEmpty()) {
                return null;
            }
            String normalizedScheme = scheme.toLowerCase(Locale.ROOT);
            int port = uri.getPort();
            if (port == -1) {
                port = defaultPort(normalizedScheme);
            }
            if (port == -1) {
                return null;
            }
            return new Origin(normalizedScheme, host.toLowerCase(Locale.ROOT), port);
        }

        private static int defaultPort(String scheme) {
            if ("https".equals(scheme)) {
                return 443;
            }
            if ("http".equals(scheme)) {
                return 80;
            }
            return -1;
        }

        boolean isLoopback() {
            return "localhost".equals(host)
                    || "127.0.0.1".equals(host)
                    || "::1".equals(host)
                    || "[::1]".equals(host);
        }

        @Override
        public boolean equals(Object other) {
            if (!(other instanceof Origin)) {
                return false;
            }
            Origin origin = (Origin) other;
            return scheme.equals(origin.scheme)
                    && host.equals(origin.host)
                    && port == origin.port;
        }

        @Override
        public int hashCode() {
            int result = scheme.hashCode();
            result = 31 * result + host.hashCode();
            result = 31 * result + port;
            return result;
        }

        @Override
        public String toString() {
            boolean defaultPort = ("https".equals(scheme) && port == 443)
                    || ("http".equals(scheme) && port == 80);
            return defaultPort ? scheme + "://" + host : scheme + "://" + host + ":" + port;
        }
    }
}
