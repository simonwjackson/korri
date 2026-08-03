package com.limelight;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

@RunWith(RobolectricTestRunner.class)
public class KorriStorageRootTest {
    @Rule
    public TemporaryFolder temporary = new TemporaryFolder();

    @Test
    public void selectsKorriForFreshStorage() throws Exception {
        File external = temporary.newFolder("external");

        assertEquals(new File(external, "korri"), KorriStorageRoot.resolve(external));
    }

    @Test
    public void renamesTheLegacyTreeWithoutCopyingItsContents() throws Exception {
        File external = temporary.newFolder("external");
        File legacy = new File(external, "korri-retro");
        assertTrue(legacy.mkdir());
        Files.write(new File(legacy, "library.yaml").toPath(),
                "games: {}\n".getBytes(StandardCharsets.UTF_8));

        File resolved = KorriStorageRoot.resolve(external);

        assertEquals(new File(external, "korri"), resolved);
        assertFalse(legacy.exists());
        assertTrue(new File(resolved, "library.yaml").isFile());
    }

    @Test
    public void neverMergesAConflictingLegacyTreeIntoKorri() throws Exception {
        File external = temporary.newFolder("external");
        File current = new File(external, "korri");
        File legacy = new File(external, "korri-retro");
        assertTrue(current.mkdir());
        assertTrue(legacy.mkdir());

        assertEquals(current, KorriStorageRoot.resolve(external));
        assertTrue(legacy.isDirectory());
    }
}
