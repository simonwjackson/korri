package com.simonwjackson.korri.spike;

import android.util.Log;

/** THROWAWAY PROTOTYPE: three-function JNI edge around the Rust server core. */
public final class RustKorridSpike {
    static {
        System.loadLibrary("korrid_spike");
    }

    private RustKorridSpike() {}

    private static native String version();
    private static native int start();
    public static native void stop();

    public static int startAndLog() {
        int port = start();
        Log.i("RustKorridSpike", version() + " listening on 127.0.0.1:" + port);
        return port;
    }
}
