{ lib, writeShellApplication, SDL2, bzip2, zlib, stdenv }:

let
  runtimeLibraryPath = lib.makeLibraryPath [
    SDL2
    bzip2
    zlib
    stdenv.cc.cc.lib
  ];
in
writeShellApplication {
  name = "gmloader-next";
  text = ''
    if [ "$#" -eq 0 ] || [ "''${1:-}" = "--version" ]; then
      printf '%s\n' "korri-gmloader-next-wrapper 0.1"
      exit 0
    fi

    if [ -n "''${KORRI_GMLOADER_NEXT_BIN:-}" ]; then
      export LD_LIBRARY_PATH="${runtimeLibraryPath}''${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
      exec "$KORRI_GMLOADER_NEXT_BIN" "$@"
    fi

    printf '%s\n' "KORRI_GMLOADER_NEXT_BIN is not set; install a gmloader-next runner binary for this platform." >&2
    exit 127
  '';
  meta = {
    description = "Korri wrapper for a source-agnostic GMLoader Next runtime";
    homepage = "https://github.com/PortsMaster/GMLoader-next";
    license = lib.licenses.mit;
    platforms = lib.platforms.linux;
    mainProgram = "gmloader-next";
  };
}
