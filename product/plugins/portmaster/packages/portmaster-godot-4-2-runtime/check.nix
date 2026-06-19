{
  pkgs,
  portmasterGodot42RuntimePackage,
}:

pkgs.runCommand "portmaster-godot-4-2-runtime-check" { } ''
  set -eu

  runtime_name="$(cat ${portmasterGodot42RuntimePackage}/nix-support/runtime-name)"
  runtime_root="$(cat ${portmasterGodot42RuntimePackage}/nix-support/runtime-root)"

  test "$runtime_name" = "godot_4.2.2"
  test -d "$runtime_root"
  test -f ${portmasterGodot42RuntimePackage}/nix-support/compatibility-profile.json
  test -x "$runtime_root/godot422.aarch64"

  ${pkgs.lib.optionalString pkgs.stdenv.hostPlatform.isAarch64 ''
    interpreter="$(${pkgs.patchelf}/bin/patchelf --print-interpreter "$runtime_root/godot422.aarch64")"
    case "$interpreter" in
      /nix/store/*/lib/ld-linux-aarch64.so.1) ;;
      *) echo "unexpected interpreter: $interpreter" >&2; exit 1 ;;
    esac
  ''}

  grep -q '"mode": "runtime-mounts"' ${portmasterGodot42RuntimePackage}/nix-support/compatibility-profile.json
  grep -q "$runtime_root" ${portmasterGodot42RuntimePackage}/nix-support/compatibility-profile.json

  touch "$out"
''
