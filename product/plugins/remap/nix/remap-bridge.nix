{
  lib,
  stdenv,
  bun,
  python3,
  acl,
  util-linux,
  systemd,
  sway,
}:

let
  runtimePath = lib.makeBinPath [
    bun
    python3
    acl
    util-linux
    systemd
    sway
  ];
  bunExe = lib.getExe bun;
  pythonExe = lib.getExe python3;
  bridgeEntry = ../packages/korri-remap-bridge/index.ts;
  nativeDriver = ../packages/korri-remap-bridge/native-driver.py;
in
stdenv.mkDerivation {
  pname = "korri-remap-bridge";
  version = "1.0.0";

  dontUnpack = true;

  buildPhase = ''
    runHook preBuild
    cat > korri-remap-bridge.c <<'EOF'
    #include <stdio.h>
    #include <stdlib.h>
    #include <string.h>
    #include <unistd.h>

    static void set_or_die(const char *name, const char *value) {
      if (setenv(name, value, 1) != 0) {
        perror(name);
        exit(125);
      }
    }

    static void set_path(void) {
      const char *prefix = "${runtimePath}:/run/current-system/sw/bin:/run/wrappers/bin";
      const char *existing = getenv("PATH");
      size_t size = strlen(prefix) + 1 + (existing == NULL ? 0 : strlen(existing)) + 1;
      char *value = malloc(size);
      if (value == NULL) {
        perror("malloc");
        exit(125);
      }
      if (existing == NULL || existing[0] == '\0') {
        snprintf(value, size, "%s", prefix);
      } else {
        snprintf(value, size, "%s:%s", prefix, existing);
      }
      set_or_die("PATH", value);
    }

    int main(int argc, char **argv) {
      const char *bun = "${bunExe}";
      const char *entry = "${bridgeEntry}";
      char **child_argv = calloc((size_t)argc + 2, sizeof(char *));
      if (child_argv == NULL) {
        perror("calloc");
        return 125;
      }

      set_path();
      set_or_die("KORRI_REMAP_NATIVE_DRIVER", "enabled");
      set_or_die("KORRI_REMAP_NATIVE_DRIVER_PYTHON", "${pythonExe}");
      set_or_die("KORRI_REMAP_NATIVE_DRIVER_PATH", "${nativeDriver}");

      child_argv[0] = (char *)bun;
      child_argv[1] = (char *)entry;
      for (int index = 1; index < argc; index += 1) {
        child_argv[index + 1] = argv[index];
      }
      child_argv[argc + 1] = NULL;

      execv(bun, child_argv);
      perror("execv");
      return 127;
    }
    EOF
    $CC -O2 -Wall -Wextra -o korri-remap-bridge korri-remap-bridge.c
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
    install -Dm0755 korri-remap-bridge $out/bin/korri-remap-bridge
    runHook postInstall
  '';
}
