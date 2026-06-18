{
  pkgs,
  portmasterArmhfRuntimePackage,
}:

pkgs.runCommand "portmaster-armhf-runtime-check" { } ''
  set -euo pipefail

  rootfs="$(cat ${portmasterArmhfRuntimePackage}/nix-support/armhf-rootfs)"
  library_path="$(cat ${portmasterArmhfRuntimePackage}/nix-support/library-path)"
  qemu_arm="$(cat ${portmasterArmhfRuntimePackage}/nix-support/qemu-arm)"

  test -x "$qemu_arm"
  test -e "$rootfs/lib/ld-linux-armhf.so.3"
  test -e "$rootfs/usr/lib/arm-linux-gnueabihf/libSDL2-2.0.so.0"
  test -e "$rootfs/usr/lib/arm-linux-gnueabihf/libSDL2_image-2.0.so.0"
  test -e "$rootfs/usr/lib/arm-linux-gnueabihf/libSDL2_mixer-2.0.so.0"
  test -e "$rootfs/usr/lib/arm-linux-gnueabihf/libSDL2_ttf-2.0.so.0"
  test -e "$rootfs/usr/lib/arm-linux-gnueabihf/libharfbuzz.so.0"
  test -e "$rootfs/usr/lib/arm-linux-gnueabihf/libopusfile.so.0"

  case "$library_path" in
    *"$rootfs/lib/arm-linux-gnueabihf"*"$rootfs/usr/lib/arm-linux-gnueabihf"*) ;;
    *) echo "library path does not include expected armhf dirs: $library_path" >&2; exit 1 ;;
  esac

  mkdir -p "$out"
  printf 'ok\n' > "$out/result"
''
