# Colocated package check for midas-machine.
{
  pkgs,
  midasMachinePackage,
}:

let
  lib = pkgs.lib;
  pkg = midasMachinePackage;
  payload = pkg.passthru.payload or pkg;
  fexRuntime = pkg.passthru.fexRuntime;
  protonRuntime = pkg.passthru.protonRuntime;
  protonGeRuntime = pkg.passthru.protonGeRuntime;
  check = message: assertion: { inherit message assertion; };
  isAarch64 = pkgs.stdenv.hostPlatform.system == "aarch64-linux";

  checks = [
    (check "midas-machine exposes the expected mainProgram" ((pkg.meta.mainProgram or null) == "midas-machine"))
    (check "midas-machine records the pinned upstream version" ((pkg.passthru.version or null) == "final-demo"))
    (check "midas-machine advertises the upstream Windows binary name" ((pkg.passthru.binaryName or null) == "midas_demo.exe"))
    (check "midas-machine carries the FEX runtime package" ((pkg.passthru.fexRuntime or null) != null))
    (check "midas-machine carries the Proton runtime package" ((pkg.passthru.protonRuntime or null) != null))
    (check "midas-machine carries the Proton-GE runtime package" ((pkg.passthru.protonGeRuntime or null) != null))
  ];

  failures = builtins.filter (candidate: !candidate.assertion) checks;
in
if failures != [ ] then
  throw "midas-machine check failed:\n${
    lib.concatMapStringsSep "\n" (failure: "- ${failure.message}") failures
  }"
else
  pkgs.runCommand "midas-machine-check"
    {
      nativeBuildInputs = [ pkgs.file ];
    }
    ''
      set -euo pipefail

      mkdir -p "$out"

      test -x ${pkg}/bin/midas-machine
      test -x ${payload}/bin/midas-machine-wine
      test -x ${payload}/bin/midas-machine-fex
      test -f ${payload}/share/midas-machine/midas_demo.exe
      test -f ${payload}/share/midas-machine/midasReadMe.txt
      test -f ${payload}/share/midas-machine/bass.dll
      test -f ${payload}/share/midas-machine/PNG.DLL
      test -d ${payload}/share/midas-machine/levels
      test -d ${payload}/share/midas-machine/music

      magic=$(head -c2 ${payload}/share/midas-machine/midas_demo.exe | od -An -tx1 | tr -d ' \n')
      if [ "$magic" != "4d5a" ]; then
        echo "error: midas_demo.exe is not a PE executable (magic: $magic)" >&2
        exit 1
      fi

      file -b ${payload}/share/midas-machine/midas_demo.exe | grep -q 'PE32 executable.*Intel 80386'

      grep -q 'MIDAS_RUN_DIR' ${payload}/bin/midas-machine-wine
      grep -q 'XDG_DATA_HOME' ${payload}/bin/midas-machine-wine
      grep -q 'midas_demo.exe' ${payload}/bin/midas-machine-wine
      ${lib.optionalString (!isAarch64) ''
        grep -q '/bin/wine' ${payload}/bin/midas-machine-wine
      ''}

      test -f ${fexRuntime}/share/korri/fex-runtime/setup-env
      grep -q 'MIDAS_FEX_RUNTIME_SETUP' ${payload}/bin/midas-machine-fex
      grep -q 'KORRI_FEX_RUNTIME_APP_ID' ${payload}/bin/midas-machine-fex
      grep -q 'KORRI_FEX_RUNTIME_ENABLE_THUNKS' ${payload}/bin/midas-machine-fex
      grep -F -q 'source "$fex_runtime_setup"' ${payload}/bin/midas-machine-fex

      test -f ${protonRuntime}/share/korri/proton-runtime/setup-env
      grep -q 'MIDAS_PROTON_RUNTIME_SETUP' ${payload}/bin/midas-machine-fex
      grep -q 'KORRI_PROTON_RUNTIME_FILES' ${payload}/bin/midas-machine-fex
      grep -q '/bin/wine' ${payload}/bin/midas-machine-fex

      test -f ${protonGeRuntime}/share/korri/proton-ge-runtime/setup-env
      grep -q 'MIDAS_PROTON_GE_RUNTIME_SETUP' ${payload}/bin/midas-machine-fex
      grep -q 'KORRI_PROTON_GE_RUNTIME_PROTON' ${payload}/bin/midas-machine-fex
      grep -q 'KORRI_PROTON_GE_RUNTIME_PYTHON' ${payload}/bin/midas-machine-fex
      grep -q 'waitforexitandrun' ${payload}/bin/midas-machine-fex
      grep -q 'UMU_ID' ${payload}/bin/midas-machine-fex
      grep -q 'PROTON_USE_XALIA' ${payload}/bin/midas-machine-fex
      grep -q 'i386-windows' ${payload}/bin/midas-machine-fex
      grep -q 'MIDAS_USE_PROTON_GE:-1' ${payload}/bin/midas-machine-fex

      ${lib.optionalString isAarch64 ''
        grep -q 'fex-proton-ge' ${payload}/nix-support/midas-machine/manifest.txt
      ''}

      test -f ${payload}/nix-support/midas-machine/manifest.txt
      grep -q '^engine=multimedia-fusion-2-windows' ${payload}/nix-support/midas-machine/manifest.txt
      grep -q '^binary=midas_demo.exe' ${payload}/nix-support/midas-machine/manifest.txt
      grep -q '^upstream-download=https://mfgg.net/index.php?act=resdb&param=03&c=2&id=30096' ${payload}/nix-support/midas-machine/manifest.txt
      grep -q '^source-sha256=ea5c6c2de67e04189f60824d929a2e5f33e5027c66ca9f2a2934e8ba8b48e01a' ${payload}/nix-support/midas-machine/manifest.txt

      cat > "$out/summary.txt" <<'EOF'
      midas-machine derivation passes payload-shape, PE-arch, wrapper, runtime, and provenance-manifest checks.
      EOF
    ''
