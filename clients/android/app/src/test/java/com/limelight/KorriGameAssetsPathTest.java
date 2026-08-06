package com.limelight;

import android.webkit.WebResourceResponse;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

@RunWith(RobolectricTestRunner.class)
public class KorriGameAssetsPathTest {
    private static final String PNG_ID =
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png";

    @Rule
    public TemporaryFolder temp = new TemporaryFolder();

    @Test
    public void servesOnlyRepositoryKnownContentAddressedAssetIdentity() throws Exception {
        File privateRoot = temp.newFolder("private");
        writeKnownBlob(privateRoot, PNG_ID, new byte[] {1, 2, 3});
        KorriGameAssetPathHandler handler = new KorriGameAssetPathHandler(privateRoot);

        WebResourceResponse response = handler.handle(PNG_ID);

        assertNotNull(response);
        assertEquals("image/png", response.getMimeType());
        assertArrayEquals(new byte[] {1, 2, 3}, readAll(response.getData()));
    }

    @Test
    public void rejectsMalformedTraversalEncodedAndUnknownAssetRequests() throws Exception {
        File privateRoot = temp.newFolder("private");
        writeKnownBlob(privateRoot, PNG_ID, new byte[] {1});
        KorriGameAssetPathHandler handler = new KorriGameAssetPathHandler(privateRoot);

        for (String path : Arrays.asList(
                "",
                "/" + PNG_ID,
                PNG_ID + "/extra",
                "../" + PNG_ID,
                "C:/" + PNG_ID,
                PNG_ID + "?v=1",
                PNG_ID + "#frag",
                "%61aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png",
                "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.png",
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.gif",
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png")) {
            assertNull(path, handler.handle(path));
        }
        assertNull(handler.handle("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.png"));
    }

    @Test
    public void missingBlobReturnsNoResourceEvenWhenAssignmentExists() throws Exception {
        File privateRoot = temp.newFolder("private");
        File assetRoot = new File(privateRoot, "game-assets");
        assertEquals(true, assetRoot.mkdirs());
        writeText(new File(assetRoot, "assignments.json"),
                "{\"game\":{\"asset_id\":\"" + PNG_ID + "\"}}\n");

        assertNull(new KorriGameAssetPathHandler(privateRoot).handle(PNG_ID));
    }

    @Test
    public void blobWithoutAssignmentIsNotRepositoryKnown() throws Exception {
        File privateRoot = temp.newFolder("private");
        File blobs = new File(new File(privateRoot, "game-assets"), "blobs");
        assertEquals(true, blobs.mkdirs());
        writeBytes(new File(blobs, PNG_ID), new byte[] {1});

        assertNull(new KorriGameAssetPathHandler(privateRoot).handle(PNG_ID));
    }

    private static void writeKnownBlob(File privateRoot, String assetId, byte[] bytes)
            throws Exception {
        File assetRoot = new File(privateRoot, "game-assets");
        File blobs = new File(assetRoot, "blobs");
        assertEquals(true, blobs.mkdirs());
        writeBytes(new File(blobs, assetId), bytes);
        writeText(new File(assetRoot, "assignments.json"),
                "{\"game\":{\"asset_id\":\"" + assetId + "\"}}\n");
    }

    private static void writeText(File file, String text) throws Exception {
        writeBytes(file, text.getBytes(StandardCharsets.UTF_8));
    }

    private static void writeBytes(File file, byte[] bytes) throws Exception {
        FileOutputStream output = new FileOutputStream(file);
        try {
            output.write(bytes);
        } finally {
            output.close();
        }
    }

    private static byte[] readAll(InputStream input) throws Exception {
        byte[] buffer = new byte[16];
        int read = input.read(buffer);
        byte[] bytes = new byte[read];
        System.arraycopy(buffer, 0, bytes, 0, read);
        return bytes;
    }
}
