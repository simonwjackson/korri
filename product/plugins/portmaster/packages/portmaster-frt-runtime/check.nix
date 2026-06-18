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

  grep -q '"mode": "runtime-mounts"' ${portmasterFrtRuntimePackage}/nix-support/compatibility-profile.json
  grep -q "$runtime_root" ${portmasterFrtRuntimePackage}/nix-support/compatibility-profile.json

  touch "$out"
''
