package com.limelight;

import android.content.ComponentName;
import android.content.Intent;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

/** Runtime validator for the launcher-neutral v6 local launch instruction. */
final class KorriLocalLaunchSpec {
    private static final String RETROARCH = "retroarch";
    private static final String ANDROID_APP = "android-app";
    private static final ComponentName RETROARCH_COMPONENT = new ComponentName(
            "com.korri.retroarch",
            "com.retroarch.browser.retroactivity.RetroActivityFuture");
    static final class Invalid extends Exception {
        final String reason;

        Invalid(String reason, String message) {
            super(message);
            this.reason = reason;
        }
    }

    static final class FileSpec {
        final String path;
        final String content;

        FileSpec(String path, String content) {
            this.path = path;
            this.content = content;
        }
    }

    static final class Parsed {
        final boolean isAndroidApp;
        final ComponentName component;
        final Map<String, String> extras;
        final List<String> directories;
        final List<FileSpec> files;

        Parsed(
                boolean isAndroidApp,
                ComponentName component,
                Map<String, String> extras,
                List<String> directories,
                List<FileSpec> files) {
            this.isAndroidApp = isAndroidApp;
            this.component = component;
            this.extras = Collections.unmodifiableMap(extras);
            this.directories = Collections.unmodifiableList(directories);
            this.files = Collections.unmodifiableList(files);
        }

        Intent intent() {
            Intent intent = new Intent().setComponent(component);
            for (Map.Entry<String, String> extra : extras.entrySet()) {
                intent.putExtra(extra.getKey(), extra.getValue());
            }
            return intent;
        }
    }

    private KorriLocalLaunchSpec() {}

    static boolean supportsStorageProvisioning(int sdkInt) {
        return sdkInt >= 30;
    }

    static boolean requiresStorageGrant(Parsed spec, int sdkInt, boolean hasAllFilesAccess) {
        return (!spec.directories.isEmpty() || !spec.files.isEmpty())
                && sdkInt >= 30
                && !hasAllFilesAccess;
    }

    static void applyTaskPolicy(Parsed spec, Intent intent) {
        if (!spec.isAndroidApp) return;
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
    }

    static Parsed parse(String specJson, File storageRoot) throws Invalid {
        try {
            JSONObject spec = new JSONObject(specJson);
            String launcherId = spec.getString("launcherId");
            boolean isRetroarch = RETROARCH.equals(launcherId);
            boolean isAndroidApp = ANDROID_APP.equals(launcherId);
            if (!isRetroarch && !isAndroidApp) {
                throw new Invalid("UnsupportedLauncher",
                        "unsupported local launcher: " + launcherId);
            }

            JSONObject componentJson = spec.getJSONObject("component");
            ComponentName component = new ComponentName(
                    componentJson.getString("packageName"),
                    componentJson.getString("className"));
            // RetroArch is pinned to its exact component: it is the runtime Korri
            // ships and patches. An installed game is any package, so what is
            // constrained instead is the shape of its instruction below — it may
            // carry no extras and provision nothing.
            if (isRetroarch && !RETROARCH_COMPONENT.equals(component)) {
                throw new Invalid("InvalidSpec",
                        "component does not match launcher " + launcherId);
            }

            JSONObject extrasJson = spec.getJSONObject("extras");
            Map<String, String> extras = new HashMap<>();
            Iterator<String> keys = extrasJson.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                Object value = extrasJson.get(key);
                if (!(value instanceof String) || ((String) value).isEmpty()) {
                    throw new Invalid("InvalidSpec", "local launch extras must be strings");
                }
                extras.put(key, (String) value);
            }

            File root = storageRoot.getCanonicalFile();
            for (String value : extras.values()) {
                validateExtraPath(value, root, component);
            }

            JSONArray directoriesJson = spec.getJSONArray("directories");
            List<String> directories = new ArrayList<>();
            for (int index = 0; index < directoriesJson.length(); index++) {
                String path = directoriesJson.getString(index);
                requireUnderRoot(path, root, "provision directory");
                directories.add(path);
            }

            JSONArray filesJson = spec.getJSONArray("files");
            List<FileSpec> files = new ArrayList<>();
            for (int index = 0; index < filesJson.length(); index++) {
                JSONObject file = filesJson.getJSONObject(index);
                String path = file.getString("path");
                String content = file.getString("content");
                requireUnderRoot(path, root, "provision file");
                if (content.isEmpty()) {
                    throw new Invalid("InvalidSpec", "provisioned file content is empty");
                }
                files.add(new FileSpec(path, content));
            }
            // An installed game runs itself: nothing to hand it, nothing to
            // provision. Enforcing that here means a forged android-app
            // instruction cannot smuggle file writes past the validator.
            if (isAndroidApp && (!extras.isEmpty() || !directories.isEmpty()
                    || !files.isEmpty())) {
                throw new Invalid("InvalidSpec",
                        "android-app launches carry no extras and provision nothing");
            }
            return new Parsed(isAndroidApp, component, extras, directories, files);
        } catch (Invalid error) {
            throw error;
        } catch (Exception error) {
            throw new Invalid(
                    "InvalidSpec",
                    error.getMessage() != null ? error.getMessage() : "invalid launch spec");
        }
    }

    private static void validateExtraPath(
            String value,
            File storageRoot,
            ComponentName component) throws Exception {
        if (value.startsWith("/storage/")) {
            requireUnderRoot(value, storageRoot, "external-storage extra");
        } else if (value.startsWith("/data/data/")) {
            File appDataRoot = new File("/data/data/" + component.getPackageName())
                    .getCanonicalFile();
            File valueFile = new File(value).getCanonicalFile();
            if (!valueFile.getPath().startsWith(appDataRoot.getPath() + File.separator)) {
                throw new Invalid("InvalidSpec", "app-data extra is outside launcher package");
            }
        } else if (value.startsWith("/")) {
            throw new Invalid("InvalidSpec", "absolute extra uses an unsupported storage root");
        }
    }

    private static void requireUnderRoot(String path, File root, String label) throws Exception {
        File target = new File(path).getCanonicalFile();
        if (!target.getPath().startsWith(root.getPath() + File.separator)) {
            throw new Invalid("InvalidSpec", label + " is outside Korri storage");
        }
    }
}
