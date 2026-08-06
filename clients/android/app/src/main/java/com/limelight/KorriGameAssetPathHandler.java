package com.limelight;

import android.webkit.WebResourceResponse;

import androidx.annotation.Nullable;
import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Narrow app-private cover-art route for assets assigned by korrid.
 *
 * The request path is parsed as one opaque content-addressed identity and then
 * resolved through the repository's assignment record. Raw request paths are
 * never appended to the private root.
 */
final class KorriGameAssetPathHandler implements WebViewAssetLoader.PathHandler {
    static final String ROUTE_PREFIX = "/game-assets/";
    private static final String STATE_DIR = "game-assets";
    private static final String BLOBS_DIR = "blobs";
    private static final String ASSIGNMENTS_FILE = "assignments.json";
    private static final Pattern ASSET_ID = Pattern.compile(
            "^[0-9a-f]{64}\\.(png|jpg|webp)$");

    private final File privateRoot;

    KorriGameAssetPathHandler(File privateRoot) {
        this.privateRoot = privateRoot;
    }

    static boolean isWellFormedAssetId(String assetId) {
        return assetId != null && ASSET_ID.matcher(assetId).matches();
    }

    static String trustedUrlForAssetId(String assetId) {
        if (!isWellFormedAssetId(assetId)) {
            return null;
        }
        return "https://appassets.androidplatform.net" + ROUTE_PREFIX + assetId;
    }

    @Nullable
    @Override
    public WebResourceResponse handle(String path) {
        String assetId = assetIdFromRequestPath(path);
        if (assetId == null) {
            return null;
        }
        File blob = resolveKnownBlob(privateRoot, assetId);
        if (blob == null) {
            return null;
        }
        try {
            return new WebResourceResponse(
                    mimeType(assetId),
                    null,
                    new FileInputStream(blob));
        } catch (Exception ignored) {
            return null;
        }
    }

    private static String assetIdFromRequestPath(String path) {
        if (path == null || path.isEmpty()) {
            return null;
        }
        if (path.startsWith("/") || path.contains("/") || path.contains("\\")
                || path.contains("%") || path.contains("?") || path.contains("#")) {
            return null;
        }
        return isWellFormedAssetId(path) ? path : null;
    }

    static File resolveKnownBlob(File privateRoot, String assetId) {
        if (!isWellFormedAssetId(assetId)) {
            return null;
        }
        try {
            File assetRoot = new File(privateRoot, STATE_DIR).getCanonicalFile();
            if (!assignmentKnowsAsset(assetRoot, assetId)) {
                return null;
            }
            File blobsRoot = new File(assetRoot, BLOBS_DIR).getCanonicalFile();
            File blob = new File(blobsRoot, assetId).getCanonicalFile();
            String prefix = blobsRoot.getPath() + File.separator;
            if (!blob.getPath().startsWith(prefix) || !blob.isFile()) {
                return null;
            }
            return blob;
        } catch (Exception ignored) {
            return null;
        }
    }

    private static boolean assignmentKnowsAsset(File assetRoot, String assetId) throws Exception {
        File assignments = new File(assetRoot, ASSIGNMENTS_FILE).getCanonicalFile();
        if (!assignments.isFile()) {
            return false;
        }
        byte[] bytes = readAllBytes(assignments);
        JSONObject root = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
        Iterator<String> keys = root.keys();
        while (keys.hasNext()) {
            JSONObject assignment = root.optJSONObject(keys.next());
            if (assignment != null && assetId.equals(assignment.optString("asset_id"))) {
                return true;
            }
        }
        return false;
    }

    private static byte[] readAllBytes(File file) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        FileInputStream input = new FileInputStream(file);
        try {
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
        } finally {
            input.close();
        }
        return output.toByteArray();
    }

    private static String mimeType(String assetId) {
        String lower = assetId.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".png")) {
            return "image/png";
        }
        if (lower.endsWith(".jpg")) {
            return "image/jpeg";
        }
        if (lower.endsWith(".webp")) {
            return "image/webp";
        }
        return "application/octet-stream";
    }

    static WebResourceResponse emptyResource() {
        return new WebResourceResponse(
                "text/plain",
                "UTF-8",
                new ByteArrayInputStream(new byte[0]));
    }
}
