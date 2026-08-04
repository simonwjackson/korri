package com.limelight.korri.overlay;

import android.accessibilityservice.AccessibilityServiceInfo;
import android.app.Activity;
import android.app.AppOpsManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Process;
import android.provider.Settings;
import android.view.accessibility.AccessibilityManager;

import java.util.List;

/** Honest accessibility-grant query and user-owned Settings transition. */
public final class KorriOverlayPermission {
    private static final String ACCESS_RESTRICTED_SETTINGS =
            "android:access_restricted_settings";
    private static final String ACCESSIBILITY_DETAILS_SETTINGS =
            "android.settings.ACCESSIBILITY_DETAILS_SETTINGS";
    private static final String SETTINGS_UNAVAILABLE_MESSAGE =
            "Android accessibility settings could not be opened";

    public enum State {
        ENABLED,
        DISABLED,
        RESTRICTED_OR_UNAVAILABLE
    }

    public enum Restriction {
        ALLOWED,
        DENIED,
        UNAVAILABLE
    }

    public interface SettingsLauncher {
        boolean canResolve(Intent intent);
        void start(Intent intent) throws Exception;
    }

    private KorriOverlayPermission() {}

    public static State state(Context context) {
        ComponentName service = new ComponentName(context, KorriOverlayService.class);
        boolean available;
        try {
            context.getPackageManager().getServiceInfo(service, 0);
            available = true;
        } catch (PackageManager.NameNotFoundException | SecurityException error) {
            available = false;
        }
        ContextSettingsLauncher launcher = new ContextSettingsLauncher(context);
        boolean settingsAvailable = launcher.canResolve(detailsIntent(service))
                || launcher.canResolve(generalIntent());
        AccessibilityManager manager =
                (AccessibilityManager) context.getSystemService(Context.ACCESSIBILITY_SERVICE);
        boolean enabled = false;
        if (manager != null) {
            List<AccessibilityServiceInfo> services = manager.getEnabledAccessibilityServiceList(
                    AccessibilityServiceInfo.FEEDBACK_ALL_MASK);
            for (AccessibilityServiceInfo candidate : services) {
                if (candidate.getResolveInfo() != null
                        && candidate.getResolveInfo().serviceInfo != null
                        && service.getPackageName().equals(
                                candidate.getResolveInfo().serviceInfo.packageName)
                        && service.getClassName().equals(
                                candidate.getResolveInfo().serviceInfo.name)) {
                    enabled = true;
                    break;
                }
            }
        }
        return classify(
                Build.VERSION.SDK_INT,
                available,
                settingsAvailable,
                enabled,
                restrictedSettings(context));
    }

    /** Pre-33 compatibility classifier retained for callers and tests. */
    public static State classify(boolean serviceAvailable, boolean settingsAvailable, boolean enabled) {
        return classify(32, serviceAvailable, settingsAvailable, enabled, Restriction.UNAVAILABLE);
    }

    public static State classify(
            int sdk,
            boolean serviceAvailable,
            boolean settingsAvailable,
            boolean enabled,
            Restriction restriction) {
        if (!serviceAvailable || !settingsAvailable) {
            return State.RESTRICTED_OR_UNAVAILABLE;
        }
        if (sdk >= 33 && restriction != Restriction.ALLOWED) {
            return State.RESTRICTED_OR_UNAVAILABLE;
        }
        return enabled ? State.ENABLED : State.DISABLED;
    }

    public static String stateJson(State state) {
        switch (state) {
            case ENABLED:
                return "{\"_tag\":\"Enabled\"}";
            case DISABLED:
                return "{\"_tag\":\"Disabled\"}";
            default:
                return "{\"_tag\":\"RestrictedOrUnavailable\"}";
        }
    }

    public static String openedJson() {
        return "{\"_tag\":\"Opened\"}";
    }

    public static String openSettings(Context context) {
        return openSettings(
                new ComponentName(context, KorriOverlayService.class),
                new ContextSettingsLauncher(context));
    }

    static String openSettings(ComponentName service, SettingsLauncher launcher) {
        Intent details = detailsIntent(service);
        if (launcher.canResolve(details)) {
            try {
                launcher.start(details);
                return openedJson();
            } catch (Exception ignored) {
                // Some Android builds resolve the detail screen but reject its execution.
            }
        }
        Intent general = generalIntent();
        if (launcher.canResolve(general)) {
            try {
                launcher.start(general);
                return openedJson();
            } catch (Exception ignored) {
                // The result below says only that Settings could not be opened.
            }
        }
        return unavailableJson(SETTINGS_UNAVAILABLE_MESSAGE);
    }

    private static Restriction restrictedSettings(Context context) {
        if (Build.VERSION.SDK_INT < 33) return Restriction.UNAVAILABLE;
        try {
            AppOpsManager manager =
                    (AppOpsManager) context.getSystemService(Context.APP_OPS_SERVICE);
            if (manager == null) return Restriction.UNAVAILABLE;
            int mode = manager.unsafeCheckOpNoThrow(
                    ACCESS_RESTRICTED_SETTINGS, Process.myUid(), context.getPackageName());
            return mode == AppOpsManager.MODE_ALLOWED
                    ? Restriction.ALLOWED
                    : Restriction.DENIED;
        } catch (RuntimeException error) {
            return Restriction.UNAVAILABLE;
        }
    }

    private static Intent detailsIntent(ComponentName service) {
        return new Intent(ACCESSIBILITY_DETAILS_SETTINGS)
                .putExtra("android.provider.extra.ACCESSIBILITY_SERVICE_COMPONENT_NAME", service);
    }

    private static Intent generalIntent() {
        return new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
    }

    private static String unavailableJson(String message) {
        return "{\"_tag\":\"Unavailable\",\"message\":"
                + org.json.JSONObject.quote(message) + "}";
    }

    private static final class ContextSettingsLauncher implements SettingsLauncher {
        private final Context context;

        ContextSettingsLauncher(Context context) {
            this.context = context;
        }

        @Override
        public boolean canResolve(Intent intent) {
            return intent.resolveActivity(context.getPackageManager()) != null;
        }

        @Override
        public void start(Intent intent) {
            if (!(context instanceof Activity)) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            }
            context.startActivity(intent);
        }
    }
}
