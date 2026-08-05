package com.limelight;

import android.content.Context;
import android.content.Intent;

import androidx.test.core.app.ApplicationProvider;

import com.simonwjackson.korri.korrid.KorriBrainService;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

@RunWith(RobolectricTestRunner.class)
public class KorriPrivateStateRootTest {
    @Test
    public void serviceRestartIntentCarriesStablePrivateRootSeparateFromReadableRoot() {
        Context context = ApplicationProvider.getApplicationContext();
        String readableRoot = "/storage/emulated/0/korri";

        Intent intent = KorriBrainService.launchIntent(
                context, "https://appassets.androidplatform.net", readableRoot);

        String privateRoot = intent.getStringExtra("privateStateRoot");
        assertEquals("https://appassets.androidplatform.net", intent.getStringExtra("allowedOrigin"));
        assertEquals(readableRoot, intent.getStringExtra("localStorageRoot"));
        assertEquals(KorriBrainService.privateStateRoot(context), privateRoot);
        assertFalse(privateRoot.equals(readableRoot));
        assertTrue(privateRoot.contains(context.getPackageName()));
    }
}
