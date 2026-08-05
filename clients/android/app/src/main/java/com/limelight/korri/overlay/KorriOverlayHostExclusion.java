package com.limelight.korri.overlay;

import java.util.Objects;

/** UI-thread, process-local ownership of the temporary gameplay-overlay hosts. */
public final class KorriOverlayHostExclusion {
    public interface LegacyHost {
        boolean isVisible();
        void closeAndDestroy();
    }

    private LegacyHost currentLegacyHost;

    public void register(LegacyHost host) {
        currentLegacyHost = Objects.requireNonNull(host);
    }

    public void unregister(LegacyHost host) {
        if (currentLegacyHost == host) currentLegacyHost = null;
    }

    public void globalConnected() {
        closeVisibleLegacyHost();
    }

    public void openGlobal(Runnable open) {
        closeVisibleLegacyHost();
        open.run();
    }

    public void hideBoth(Runnable dismissGlobal) {
        closeVisibleLegacyHost();
        dismissGlobal.run();
    }

    private void closeVisibleLegacyHost() {
        LegacyHost legacyHost = currentLegacyHost;
        if (legacyHost != null && legacyHost.isVisible()) {
            legacyHost.closeAndDestroy();
        }
    }
}
