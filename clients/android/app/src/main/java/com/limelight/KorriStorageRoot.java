package com.limelight;

import java.io.File;

/** Selects the user-visible Korri root and migrates the former local-play name. */
final class KorriStorageRoot {
    private static final String CURRENT_NAME = "korri";
    private static final String LEGACY_NAME = "korri-retro";

    private KorriStorageRoot() {}

    static synchronized File resolve(File externalStorage) {
        File current = new File(externalStorage, CURRENT_NAME);
        File legacy = new File(externalStorage, LEGACY_NAME);
        if (!current.exists() && legacy.isDirectory() && !legacy.renameTo(current)) {
            // Keep existing libraries usable until Android grants enough access
            // for the same-filesystem rename to succeed on a later call.
            return legacy;
        }
        return current;
    }
}
