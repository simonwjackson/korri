{
  pkgs,
  portmasterWestonRuntimePackage,
}:

pkgs.runCommand "portmaster-weston-runtime-check" { } ''
  set -eu

  runtime_name="$(cat ${portmasterWestonRuntimePackage}/nix-support/runtime-name)"
  runtime_root="$(cat ${portmasterWestonRuntimePackage}/nix-support/runtime-root)"
  runtime_library_path="$(cat ${portmasterWestonRuntimePackage}/nix-support/library-path)"

  test "$runtime_name" = "weston_pkg_0.2"
  test -d "$runtime_root"
  test -f ${portmasterWestonRuntimePackage}/nix-support/compatibility-profile.json
  test -x "$runtime_root/westonwrap.sh"
  grep -q 'Detected Weston Xwayland display' "$runtime_root/westonwrap.sh"
  grep -q 'Weston Xwayland display.*is ready' "$runtime_root/westonwrap.sh"
  grep -q 'xdpyinfo' "$runtime_root/westonwrap.sh"
  grep -q 'candidate_name' "$runtime_root/westonwrap.sh"
  test -e ${pkgs.libglvnd}/lib/libGLESv2.so
  grep -q 'libglvnd' "$runtime_root/westonwrap.sh"
  test -x "$runtime_root/wp_weston"
  test -x "$runtime_root/bin/Xwayland"
  grep -q "${pkgs.xwayland}/bin/Xwayland" "$runtime_root/bin/Xwayland"
  grep -q 'XKB_CONFIG_ROOT' "$runtime_root/bin/Xwayland"
  grep -q 'libglvnd' "$runtime_root/bin/Xwayland"
  LD_LIBRARY_PATH="$runtime_root/lib_aarch64/graphics/mesa_x11_stub:$runtime_root/lib_aarch64:$runtime_library_path" "$runtime_root/bin/Xwayland" -version >/dev/null

  ${pkgs.lib.optionalString pkgs.stdenv.hostPlatform.isAarch64 ''
    for binary in "$runtime_root/wp_weston" "$runtime_root/tools/findlib"; do
      interpreter="$(${pkgs.patchelf}/bin/patchelf --print-interpreter "$binary")"
      case "$interpreter" in
        /nix/store/*/lib/ld-linux-aarch64.so.1) ;;
        *) echo "unexpected interpreter for $binary: $interpreter" >&2; exit 1 ;;
      esac
    done
  ''}

  grep -q '"CFW_NAME": "ROCKNIX"' ${portmasterWestonRuntimePackage}/nix-support/compatibility-profile.json
  grep -q '"XKB_CONFIG_ROOT": "/tmp/weston/share/xkb"' ${portmasterWestonRuntimePackage}/nix-support/compatibility-profile.json
  grep -q '"LIBGL_DRIVERS_PATH": "${pkgs.mesa}/lib/dri"' ${portmasterWestonRuntimePackage}/nix-support/compatibility-profile.json
  grep -q '"__EGL_VENDOR_LIBRARY_DIRS": "${pkgs.mesa}/share/glvnd/egl_vendor.d"' ${portmasterWestonRuntimePackage}/nix-support/compatibility-profile.json
  grep -q 'mesa' ${portmasterWestonRuntimePackage}/nix-support/library-path
  grep -q '"mode": "runtime-mounts"' ${portmasterWestonRuntimePackage}/nix-support/compatibility-profile.json
  grep -q "$runtime_root" ${portmasterWestonRuntimePackage}/nix-support/compatibility-profile.json

  touch "$out"
''
