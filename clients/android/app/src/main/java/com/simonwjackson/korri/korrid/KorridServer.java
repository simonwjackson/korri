package com.simonwjackson.korri.korrid;

import android.util.Log;

/**
 * Three-function JNI edge around the embedded Rust korrid server. The
 * portal's brain lives behind this boundary; Java only starts, stops,
 * and identifies it. Symbol names are mirrored in services/korrid
 * src/android.rs.
 */
public final class KorridServer {
    static {
        System.loadLibrary("korrid");
    }

    private KorridServer() {}

    private static native String version();
    private static native int start();
    public static native void stop();

    public static int startAndLog() {
        int port = start();
        Log.i("KorridServer", version() + " listening on 127.0.0.1:" + port);
        return port;
    }
}
