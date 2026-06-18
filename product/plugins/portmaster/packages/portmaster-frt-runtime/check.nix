{
  pkgs,
  portmasterFrtRuntimePackage,
}:

pkgs.runCommand "portmaster-frt-runtime-check" { } ''
  set -eu

  runtime_name="$(cat ${portmasterFrtRuntimePackage}/nix-support/runtime-name)"
  runtime_root="$(cat ${portmasterFrtRuntimePackage}/nix-support/runtime-root)"

  test "$runtime_name" = "frt_3.5.2"
  test -d "$runtime_root"
  test -f ${portmasterFrtRuntimePackage}/nix-support/compatibility-profile.json
  test -x "$runtime_root/frt_3.5.2"
  test -f ${portmasterFrtRuntimePackage}/nix-support/library-path

  ${pkgs.lib.optionalString pkgs.stdenv.hostPlatform.isAarch64 ''
    interpreter="$(${pkgs.patchelf}/bin/patchelf --print-interpreter "$runtime_root/frt_3.5.2")"
    rpath="$(${pkgs.patchelf}/bin/patchelf --print-rpath "$runtime_root/frt_3.5.2")"
    case "$interpreter" in
      /nix/store/*/lib/ld-linux-aarch64.so.1) ;;
      *) echo "unexpected interpreter: $interpreter" >&2; exit 1 ;;
    esac
    grep -qi 'sdl2' ${portmasterFrtRuntimePackage}/nix-support/library-path
    test -n "$rpath"
  ''}

  grep -q '"mode": "runtime-mounts"' ${portmasterFrtRuntimePackage}/nix-support/compatibility-profile.json
  grep -q "$runtime_root" ${portmasterFrtRuntimePackage}/nix-support/compatibility-profile.json

  touch "$out"
''
