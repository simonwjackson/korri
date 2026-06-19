{
  lib,
  stdenv,
  fetchurl,
  squashfsTools,
  patchelf,
  bzip2,
  expat,
  libevdev,
  libglvnd,
  libjpeg8,
  mesa,
  systemdMinimal,
  util-linuxMinimal,
  xwayland,
  zlib,
}:

let
  runtimeName = "weston_pkg_0.2";
  libraryPath = lib.makeLibraryPath [
    expat
    libevdev
    libglvnd
    libjpeg8.out
    mesa
    systemdMinimal
    util-linuxMinimal.lib
    zlib
  ];
  xwaylandLibraryPath = lib.makeLibraryPath [
    bzip2
    libglvnd
  ];
  linuxInterpreter = lib.optionalString stdenv.hostPlatform.isLinux (
    lib.removeSuffix "\n" (builtins.readFile "${stdenv.cc}/nix-support/dynamic-linker")
  );
in
stdenv.mkDerivation {
  pname = "portmaster-weston-runtime";
  version = "0.2";

  src = fetchurl {
    url = "https://github.com/PortsMaster/PortMaster-New/releases/download/2025-07-24_0745/${runtimeName}.squashfs";
    sha256 = "14qsphl85mq9z92kgmmw0id5r5l2rdvrd317whgvp5hjq7msxk0b";
  };

  nativeBuildInputs = [ squashfsTools patchelf ];

  dontUnpack = true;

  installPhase = ''
    runHook preInstall

    runtime_root="$out/share/korri/portmaster/runtimes/${runtimeName}"
    mkdir -p "$runtime_root"
    unsquashfs -f -d "$runtime_root" "$src"

    ${lib.optionalString stdenv.hostPlatform.isAarch64 ''
      while IFS= read -r -d "" candidate; do
        if interpreter="$(patchelf --print-interpreter "$candidate" 2>/dev/null)"; then
          case "$interpreter" in
            */ld-linux-aarch64.so.1)
              patchelf --set-interpreter '${linuxInterpreter}' "$candidate"
              ;;
          esac
        fi
      done < <(find "$runtime_root" -type f -print0)
    ''}

    # The upstream Xwayland binary is not patchelf-compatible on NixOS
    # (patchelf reports `section header table out of bounds`). Westonpack
    # invokes it by relative path as `bin/Xwayland`, so replace just that
    # executable with a Nix-provided build while preserving the rest of the
    # PortMaster runtime layout. Weston also supplies XWAYLAND_LD_LIBRARY_PATH,
    # so the wrapper restores Nix-only dependencies that would otherwise be
    # missing under that launch environment.
    rm -f "$runtime_root/bin/Xwayland"
    cat > "$runtime_root/bin/Xwayland" <<'EOF_XWAYLAND'
#!${stdenv.shell}
runtime_root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
export XKB_CONFIG_ROOT="''${XKB_CONFIG_ROOT:-$runtime_root/share/xkb}"
append_library_path="${xwaylandLibraryPath}"
if [ -n "''${LD_LIBRARY_PATH:-}" ]; then
  export LD_LIBRARY_PATH="''${LD_LIBRARY_PATH}:$append_library_path"
else
  export LD_LIBRARY_PATH="$append_library_path"
fi
exec '${xwayland}/bin/Xwayland' "$@"
EOF_XWAYLAND
    chmod +x "$runtime_root/bin/Xwayland"

    # ROCKNIX mode assumes Weston Xwayland will take :1 whenever the host
    # compositor owns :0. Under nested gamescope, :1 may already be reserved,
    # so Weston can legitimately create :2 instead. Detect the non-host socket
    # Weston created and use that DISPLAY instead of waiting forever on X1.
    awk '
      /export APP_LIBRARY_PATH="\$weston_dir\/lib_\$app_arch"/ {
        print
        print "export APP_LIBRARY_PATH=\"$APP_LIBRARY_PATH:${libraryPath}\""
        next
      }
      /while ! \[\[ -e \$xfile \]\]; do/ {
        print "while ! [[ -e $xfile ]]; do"
        print "    for candidate in /tmp/.X11-unix/X*; do"
        print "        [ -S \"$candidate\" ] || continue"
        print "        candidate_name=\"$(basename \"$candidate\")\""
        print "        [ \"$candidate_name\" = \"X0\" ] && continue"
        print "        [ \"$candidate\" = \"$xfile\" ] && continue"
        print "        xfile=\"$candidate\""
        print "        display_number=\"$(printf %s \"$candidate_name\" | sed s/^X//)\""
        print "        xsock=\":$display_number\""
        print "        echo \"Detected Weston Xwayland display $xsock at $xfile\""
        print "        for ready_attempt in $(seq 1 50); do"
        print "            DISPLAY=\"$xsock\" \"$weston_dir/tools/xdpyinfo\" >/dev/null 2>&1 && break"
        print "            sleep 0.1"
        print "        done"
        print "        echo \"Weston Xwayland display $xsock is ready\""
        print "        break"
        print "    done"
        print "    if [[ -e $xfile ]]; then"
        print "        break"
        print "    fi"
        print "    sleep 0.1"
        print "done"
        skip=1
        next
      }
      skip && /^done$/ { skip=0; next }
      !skip { print }
    ' "$runtime_root/westonwrap.sh" > "$runtime_root/westonwrap.sh.tmp"
    mv "$runtime_root/westonwrap.sh.tmp" "$runtime_root/westonwrap.sh"
    chmod +x "$runtime_root/westonwrap.sh"

    mkdir -p "$out/nix-support"
    printf '%s\n' '${runtimeName}' > "$out/nix-support/runtime-name"
    printf '%s\n' "$runtime_root" > "$out/nix-support/runtime-root"
    printf '%s\n' '${libraryPath}' > "$out/nix-support/library-path"
    printf '%s\n' 'dynamic-xwayland-display' > "$out/nix-support/weston-wrapper-mode"
    cat > "$out/nix-support/compatibility-profile.json" <<EOF
    {
      "env": {
        "CFW_NAME": "ROCKNIX",
        "LD_LIBRARY_PATH": "${libraryPath}",
        "LIBGL_DRIVERS_PATH": "${mesa}/lib/dri",
        "XKB_CONFIG_ROOT": "/tmp/weston/share/xkb",
        "__EGL_VENDOR_LIBRARY_DIRS": "${mesa}/share/glvnd/egl_vendor.d"
      },
      "runtimeCompatibility": {
        "mode": "runtime-mounts",
        "runtimeMounts": [
          {
            "runtime": "${runtimeName}",
            "sourcePath": "$runtime_root"
          }
        ]
      }
    }
EOF

    runHook postInstall
  '';

  meta = {
    description = "Extracted PortMaster Weston runtime root for Godot 4 runtime-mounts compatibility";
    homepage = "https://portmaster.games/runtimes.html";
    license = lib.licenses.mit;
    platforms = [ "aarch64-linux" "x86_64-linux" ];
    sourceProvenance = with lib.sourceTypes; [ binaryNativeCode ];
  };
}
