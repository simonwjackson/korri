package com.limelight;

import static org.junit.Assert.assertFalse;

import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;

public class KorriPairingCeremonyRemovalContractTest {
    private static final List<String> FORBIDDEN_CALLS = List.of(
            "getPairingManager(",
            ".pair(",
            "executePairingCommand(",
            ".unpair(",
            "openPairing(");

    @Test
    public void productPathCannotInvokeTheGameStreamPairingCeremony() throws Exception {
        Path root = Path.of("src/main/java");
        try (Stream<Path> files = Files.walk(root)) {
            for (Path file : files.filter(path -> path.toString().endsWith(".java")).toList()) {
                String relative = root.relativize(file).toString().replace('\\', '/');
                if (relative.equals("com/limelight/nvstream/http/PairingManager.java")
                        || relative.equals("com/limelight/nvstream/http/NvHTTP.java")) {
                    continue;
                }
                String source = new String(
                        Files.readAllBytes(file), StandardCharsets.UTF_8);
                for (String forbidden : FORBIDDEN_CALLS) {
                    assertFalse(relative + " invokes " + forbidden, source.contains(forbidden));
                }
            }
        }
    }
}
