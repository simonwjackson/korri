{
  pkgs,
  portmasterWestonRuntimePackage,
}:

pkgs.runCommand "portmaster-weston-runtime-check" { } ''
  set -eu

  runtime_name="$(cat ${portmasterWestonRuntimePackage}/nix-support/runtime-name)"
  runtime_root="$(cat ${portmasterWestonRuntimePackage}/nix-support/runtime-root)"

  test "$runtime_name" = "weston_pkg_0.2"
  test -d "$runtime_root"
  test -f ${portmasterWestonRuntimePackage}/nix-support/compatibility-profile.json
  test -x "$runtime_root/westonwrap.sh"
  test -x "$runtime_root/wp_weston"
  test -x "$runtime_root/bin/Xwayland"

  ${pkgs.lib.optionalString pkgs.stdenv.hostPlatform.isAarch64 ''
    for binary in "$runtime_root/wp_weston" "$runtime_root/tools/findlib"; do
      interpreter="$(${pkgs.patchelf}/bin/patchelf --print-interpreter "$binary")"
      case "$interpreter" in
        /nix/store/*/lib/ld-linux-aarch64.so.1) ;;
        *) echo "unexpected interpreter for $binary: $interpreter" >&2; exit 1 ;;
      esac
    done
  ''}

  grep -q '"mode": "runtime-mounts"' ${portmasterWestonRuntimePackage}/nix-support/compatibility-profile.json
  grep -q "$runtime_root" ${portmasterWestonRuntimePackage}/nix-support/compatibility-profile.json

  touch "$out"
''
