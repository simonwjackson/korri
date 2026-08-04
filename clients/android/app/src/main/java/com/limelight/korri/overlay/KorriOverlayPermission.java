package com.limelight.korri.overlay;

import android.accessibilityservice.AccessibilityServiceInfo;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.view.accessibility.AccessibilityManager;

import java.util.List;

/** Honest accessibility-grant query and user-owned Settings transition. */
public final class KorriOverlayPermission {
    public enum State {
        ENABLED,
        DISABLED,
        RESTRICTED_OR_UNAVAILABLE
    }

    private KorriOverlayPermission() {}

    public static State state(Context context) {
        ComponentName service = new ComponentName(context, KorriOverlayService.class);
        boolean available;
        try {
            context.getPackageManager().getServiceInfo(service, 0);
            available = true;
        } catch (PackageManager.NameNotFoundException error) {
            available = false;
        }
        Intent settings = settingsIntent(service);
        boolean settingsAvailable = settings.resolveActivity(context.getPackageManager()) != null;
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
        return classify(available, settingsAvailable, enabled);
    }

    public static State classify(boolean serviceAvailable, boolean settingsAvailable, boolean enabled) {
        if (!serviceAvailable || !settingsAvailable) {
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
        try {
            Intent intent = settingsIntent(new ComponentName(context, KorriOverlayService.class));
            if (intent.resolveActivity(context.getPackageManager()) == null) {
                return unavailableJson("Android accessibility settings are unavailable");
            }
            if (!(context instanceof android.app.Activity)) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            }
            context.startActivity(intent);
            return openedJson();
        } catch (Exception error) {
            return unavailableJson(error.getMessage() == null
                    ? "Android accessibility settings are unavailable"
                    : error.getMessage());
        }
    }

    private static Intent settingsIntent(ComponentName service) {
        return new Intent("android.settings.ACCESSIBILITY_DETAILS_SETTINGS")
                .putExtra("android.provider.extra.ACCESSIBILITY_SERVICE_COMPONENT_NAME", service);
    }

    private static String unavailableJson(String message) {
        return "{\"_tag\":\"Unavailable\",\"message\":"
                + org.json.JSONObject.quote(message) + "}";
    }
}
