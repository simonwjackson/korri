package com.simonwjackson.korri.korrid;

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
    /** True only for an untampered instruction from the running embedded server. */
    public static native boolean verifyLaunchSpec(String specJson);
    public static native void stop();

    public static int startAndLog(String allowedOrigin, String localStorageRoot) {
        int port = start(allowedOrigin, localStorageRoot);
        Log.i("KorridServer", version() + " listening on 127.0.0.1:" + port);
        return port;
    }
}
