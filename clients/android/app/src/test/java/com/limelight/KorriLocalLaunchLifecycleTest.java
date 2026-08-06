package com.limelight;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

public class KorriLocalLaunchLifecycleTest {
    @Test
    public void publicationIsClosedNonSecretStructuredIdentity() {
        assertEquals(
                "launchId=0123456789abcdef0123456789abcdef"
                        + " event=published"
                        + " gameId=wl4"
                        + " package=com.korri.retroarch"
                        + " launcher=retroarch",
                KorriLocalLaunchLifecycle.published(
                        "0123456789abcdef0123456789abcdef",
                        "wl4",
                        "com.korri.retroarch",
                        "retroarch"));
    }

    @Test
    public void rejectsMalformedOrInjectableIdentity() {
        assertThrows(IllegalArgumentException.class, () ->
                KorriLocalLaunchLifecycle.published(
                        "ABCDEF6789abcdef0123456789abcdef",
                        "wl4",
                        "com.korri.retroarch",
                        "retroarch"));
        assertThrows(IllegalArgumentException.class, () ->
                KorriLocalLaunchLifecycle.published(
                        "0123456789abcdef0123456789abcdef",
                        "wl4 token=leak",
                        "com.korri.retroarch",
                        "retroarch"));
        assertThrows(IllegalArgumentException.class, () ->
                KorriLocalLaunchLifecycle.published(
                        "0123456789abcdef0123456789abcdef",
                        "wl4",
                        "com.korri.retroarch\ncapability=leak",
                        "retroarch"));
    }
}
