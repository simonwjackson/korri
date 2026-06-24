{ pkgs, gmloaderNextPackage }:

pkgs.runCommand "gmloader-next-check" { nativeBuildInputs = [ pkgs.file pkgs.binutils pkgs.patchelf ]; } ''
  set -eu

  wrapper=${gmloaderNextPackage}/bin/gmloader-next
  runner=${gmloaderNextPackage}/libexec/gmloader-next/gmloadernext.aarch64
  source_rev=${gmloaderNextPackage}/nix-support/source-rev
  binary_seed=${gmloaderNextPackage}/nix-support/binary-seed
  library_path=${gmloaderNextPackage}/nix-support/library-path

  echo checking executable layout
  test -x "$wrapper"
  test -x "$runner"
  test -s "$source_rev"
  test -s "$binary_seed"
  test -s "$library_path"
  test -e ${gmloaderNextPackage}/lib/gmloader-next/libzip.so.5
  test -e ${gmloaderNextPackage}/lib/gmloader-next/arm64-v8a/libc++_shared.so
  test -e ${gmloaderNextPackage}/lib/gmloader-next/arm64-v8a/libcompiler_rt.so
  test -e ${gmloaderNextPackage}/lib/gmloader-next/arm64-v8a/libm.so

  echo checking wrapper
  grep -Fq "$runner" "$wrapper"
  grep -Fq "LD_LIBRARY_PATH" "$wrapper"
  grep -Fq ${gmloaderNextPackage}/lib/gmloader-next "$library_path"

  echo checking elf identity
  file "$runner" > elf.txt
  grep -Eq 'aarch64|ARM aarch64|ARM64' elf.txt
  readelf -h "$runner" > elf-header.txt
  grep -q 'Machine:.*AArch64' elf-header.txt

  echo checking dynamic dependencies
  readelf -d "$runner" > dynamic.txt
  grep -q 'NEEDED.*libSDL2' dynamic.txt
  grep -q 'NEEDED.*libzip' dynamic.txt
  grep -q 'NEEDED.*libz' dynamic.txt

  echo checking nix loader patching
  patchelf --print-interpreter "$runner" > interpreter.txt
  grep -Eq '^/nix/store/.*/ld-linux-aarch64\.so\.1$' interpreter.txt
  patchelf --print-rpath "$runner" > rpath.txt
  grep -Fq ${gmloaderNextPackage}/lib/gmloader-next rpath.txt

  mkdir -p "$out"
  cp elf.txt elf-header.txt dynamic.txt interpreter.txt rpath.txt "$out/"
  printf '%s\n' ok > "$out/result"
''
