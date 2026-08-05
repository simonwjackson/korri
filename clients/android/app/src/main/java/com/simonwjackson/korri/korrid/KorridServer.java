package com.simonwjackson.korri.korrid;

import android.content.Intent;
import android.util.Log;

/**
 * JNI edge around the embedded Rust korrid server. The portal's brain
 * lives behind this boundary; Java starts/stops it and hands the trusted
 * WebView its per-server capability. Symbol names mirror services/korrid
 * src/android.rs.
 */
public final class KorridServer {
    static {
        System.loadLibrary("korrid");
    }

    private KorridServer() {}

    private static native String version();
    private static native int start(String allowedOrigin, String localStorageRoot);
    public static native String capability();
    /** Tagged authorization result; a valid Moonlight launch is consumed once. */
    public static native String authorizeMoonlightLaunchSpec(String specJson);
    /** Consumes the latest untampered local reservation before Android starts it. */
    public static native boolean verifyLaunchSpec(String specJson);
    /** Adds launch-bound RetroArch authority without exposing it as a Java/JS string. */
    public static native boolean attachRetroarchControlAuthority(
            String specJson, Intent intent);
    /** Verify the signed local handoff and publish its launch context. */
    public static native String publishLocalActiveLaunch(String specJson);
    /** Verify the signed Moonlight handoff; Java supplies its own Game component. */
    public static native String publishMoonlightActiveLaunch(
            String specJson, String applicationPackage, String gameClassName);
    /** Compare-and-clear the exact current launch. */
    public static native boolean clearActiveLaunch(String launchId);
    /** Read the current Rust snapshot; returns JSON null when idle. */
    public static native String activeLaunch();
    /** Publish strict live Moonlight values/fulfillability for the exact active launch. */
    public static native boolean publishMoonlightExecutorState(String stateJson);
    /** Compare-and-clear strict live Moonlight state for the exact launch. */
    public static native boolean clearMoonlightExecutorState(
            String launchId, String generation);
    /** Verify and consume one protected instruction for the current launch. */
    public static native String authorizePlatformInstruction(String instructionJson);
    public static native void stop();

    public static int startAndLog(String allowedOrigin, String localStorageRoot) {
        int port = start(allowedOrigin, localStorageRoot);
        Log.i("KorridServer", version() + " listening on 127.0.0.1:" + port);
        return port;
    }
}
