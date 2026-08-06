package com.limelight.korri.overlay;

import android.view.KeyEvent;

/** Safe, allowlisted diagnostic formatting for the physical Guide input edge. */
final class KorriPhysicalGuideTelemetry {
    private KorriPhysicalGuideTelemetry() {}

    static String format(
            int keyCode,
            int action,
            int deviceId,
            boolean consumed,
            boolean sessionAccepted,
            boolean showing) {
        final String keyName;
        if (keyCode == KeyEvent.KEYCODE_BUTTON_MODE) {
            keyName = "BUTTON_MODE";
        } else if (keyCode == KeyEvent.KEYCODE_BACK) {
            keyName = "BACK";
        } else {
            return null;
        }
        return "event=physical-guide-key"
                + " key=" + keyName
                + " keyCode=" + keyCode
                + " action=" + action
                + " deviceId=" + deviceId
                + " consumed=" + consumed
                + " sessionAccepted=" + sessionAccepted
                + " showing=" + showing;
    }
}
