package com.limelight.korri.overlay;

final class KorriOverlayWindowTelemetry {
    private static final String EVENT = "event=overlay-window-create";

    private KorriOverlayWindowTelemetry() {}

    static String success() {
        return EVENT + " result=success";
    }

    static String failure(Exception failure) {
        String error = failure == null ? "" : failure.getClass().getSimpleName();
        if (!error.matches("[A-Za-z_$][A-Za-z0-9_$]*")) error = "Unknown";
        return EVENT + " result=failure error=" + error;
    }
}
