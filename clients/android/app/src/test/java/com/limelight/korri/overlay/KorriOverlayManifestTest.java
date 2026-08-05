package com.limelight.korri.overlay;

import android.Manifest;
import android.content.ComponentName;
import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.content.res.XmlResourceParser;

import androidx.test.core.app.ApplicationProvider;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.xmlpull.v1.XmlPullParser;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

@RunWith(RobolectricTestRunner.class)
public class KorriOverlayManifestTest {
    private static final String ANDROID = "http://schemas.android.com/apk/res/android";

    @Test
    public void serviceIsProtectedOnlyByAccessibilityBindingAndHasNoCommandReceiver()
            throws Exception {
        Context context = ApplicationProvider.getApplicationContext();
        PackageManager packages = context.getPackageManager();
        ServiceInfo service = packages.getServiceInfo(
                new ComponentName(context, KorriOverlayService.class),
                PackageManager.GET_META_DATA);

        assertTrue(service.exported);
        assertEquals(Manifest.permission.BIND_ACCESSIBILITY_SERVICE, service.permission);
        assertNotNull(service.metaData);
        int config = service.metaData.getInt("android.accessibilityservice");
        assertTrue(config != 0);

        PackageInfo app = packages.getPackageInfo(
                context.getPackageName(), PackageManager.GET_RECEIVERS);
        if (app.receivers != null) {
            for (android.content.pm.ActivityInfo receiver : app.receivers) {
                assertFalse(receiver.name.contains("korri.overlay"));
            }
        }
    }

    @Test
    public void accessibilityXmlRequestsOnlyKeyFilteringAndWindowState() throws Exception {
        Context context = ApplicationProvider.getApplicationContext();
        ServiceInfo service = context.getPackageManager().getServiceInfo(
                new ComponentName(context, KorriOverlayService.class),
                PackageManager.GET_META_DATA);
        int config = service.metaData.getInt("android.accessibilityservice");
        try (XmlResourceParser parser = context.getResources().getXml(config)) {
            while (parser.next() != XmlPullParser.START_TAG) {}
            assertEquals(android.view.accessibility.AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED,
                    parser.getAttributeIntValue(ANDROID, "accessibilityEventTypes", 0));
            assertTrue(parser.getAttributeBooleanValue(
                    ANDROID, "canRequestFilterKeyEvents", false));
            assertFalse(parser.getAttributeBooleanValue(
                    ANDROID, "canRetrieveWindowContent", true));
            assertFalse(parser.getAttributeBooleanValue(
                    ANDROID, "canPerformGestures", true));
            int flags = parser.getAttributeIntValue(ANDROID, "accessibilityFlags", 0);
            assertTrue((flags & android.accessibilityservice.AccessibilityServiceInfo
                    .FLAG_REQUEST_FILTER_KEY_EVENTS) != 0);
        }
    }

    @Test
    public void productionOverlayScopeContainsNoReceiverOrSecretLogging() throws Exception {
        Path source = Path.of(
                "src/main/java/com/limelight/korri/overlay/KorriOverlayService.java");
        String text = new String(Files.readAllBytes(source), StandardCharsets.UTF_8);
        assertFalse(text.contains("BroadcastReceiver"));
        assertFalse(text.contains("registerReceiver"));
        assertTrue(text.contains("Log.i(\"KorriOverlay\""));
        assertTrue(text.contains("launchId="));
        assertTrue(text.contains(" generation="));
        assertTrue(text.contains(" event="));
        assertTrue(text.contains(" reason="));
        assertFalse(text.contains("korridCapability"));
        assertFalse(text.contains("KORRI_CONTROL_TOKEN"));
    }
}
