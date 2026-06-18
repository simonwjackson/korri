# Colocated package check for mega-man-maker.
{
  pkgs,
  megaManMakerPackage,
}:

let
  lib = pkgs.lib;
  pkg = megaManMakerPackage;
  payload = pkg.passthru.payload or pkg;
  fexRuntime = pkg.passthru.fexRuntime;
  protonRuntime = pkg.passthru.protonRuntime;
  protonGeRuntime = pkg.passthru.protonGeRuntime;
  check = message: assertion: { inherit message assertion; };
  isAarch64 = pkgs.stdenv.hostPlatform.system == "aarch64-linux";

  checks = [
    (check "mega-man-maker exposes the expected mainProgram" ((pkg.meta.mainProgram or null) == "mega-man-maker"))
    (check "mega-man-maker records the pinned upstream version" ((pkg.passthru.version or null) == "1.10.4.2"))
    (check "mega-man-maker advertises the upstream Windows binary name" ((pkg.passthru.binaryName or null) == "MegaMaker.exe"))
    (check "mega-man-maker carries the FEX runtime package" ((pkg.passthru.fexRuntime or null) != null))
    (check "mega-man-maker carries the Proton runtime package" ((pkg.passthru.protonRuntime or null) != null))
    (check "mega-man-maker carries the optional Proton-GE runtime package" ((pkg.passthru.protonGeRuntime or null) != null))
  ];

  failures = builtins.filter (candidate: !candidate.assertion) checks;
in
if failures != [ ] then
  throw "mega-man-maker check failed:\n${
    lib.concatMapStringsSep "\n" (failure: "- ${failure.message}") failures
  }"
else
  pkgs.runCommand "mega-man-maker-check"
    {
      nativeBuildInputs = [ pkgs.file ];
    }
    ''
      set -euo pipefail

      mkdir -p "$out"

      test -x ${pkg}/bin/mega-man-maker
      test -x ${payload}/bin/mega-man-maker-wine
      test -x ${payload}/bin/mega-man-maker-fex
      test -f ${payload}/share/mega-man-maker/MegaMaker.exe
      test -f ${payload}/share/mega-man-maker/data.win
      test -f ${payload}/share/mega-man-maker/options.ini
      test -f ${payload}/share/mega-man-maker/gme.dll
      test -f ${payload}/share/mega-man-maker/DLL/MegaDLL.dll
      test -f ${payload}/share/mega-man-maker/DLL/buffer_zlib_x64.dll
      test -d ${payload}/share/mega-man-maker/ExampleLevels
      test -f ${payload}/share/mega-man-maker/README.txt

      magic=$(head -c2 ${payload}/share/mega-man-maker/MegaMaker.exe | od -An -tx1 | tr -d ' \n')
      if [ "$magic" != "4d5a" ]; then
        echo "error: MegaMaker.exe is not a PE executable (magic: $magic)" >&2
        exit 1
      fi

      file -b ${payload}/share/mega-man-maker/MegaMaker.exe | grep -q 'PE32+ executable.*x86-64'

      grep -q 'MMM_RUN_DIR' ${payload}/bin/mega-man-maker-wine
      grep -q 'XDG_DATA_HOME' ${payload}/bin/mega-man-maker-wine
      grep -q 'MegaMaker.exe' ${payload}/bin/mega-man-maker-wine
      ${lib.optionalString (!isAarch64) ''
        grep -q '/bin/wine' ${payload}/bin/mega-man-maker-wine
      ''}

      test -f ${fexRuntime}/share/korri/fex-runtime/setup-env
      grep -q 'MMM_FEX_RUNTIME_SETUP' ${payload}/bin/mega-man-maker-fex
      grep -q 'KORRI_FEX_RUNTIME_APP_ID' ${payload}/bin/mega-man-maker-fex
      grep -q 'KORRI_FEX_RUNTIME_ENABLE_THUNKS' ${payload}/bin/mega-man-maker-fex
      grep -F -q 'source "$fex_runtime_setup"' ${payload}/bin/mega-man-maker-fex

      test -f ${protonRuntime}/share/korri/proton-runtime/setup-env
      grep -q 'MMM_PROTON_RUNTIME_SETUP' ${payload}/bin/mega-man-maker-fex
      grep -q 'KORRI_PROTON_RUNTIME_ROOT' ${payload}/bin/mega-man-maker-fex
      grep -q 'KORRI_PROTON_RUNTIME_FILES' ${payload}/bin/mega-man-maker-fex
      grep -q 'KORRI_PROTON_RUNTIME_WINEPREFIX' ${payload}/bin/mega-man-maker-fex
      grep -q 'KORRI_PROTON_RUNTIME_WINE64' ${payload}/bin/mega-man-maker-fex
      grep -q 'MMM_USE_PROTON_SCRIPT' ${payload}/bin/mega-man-maker-fex

      test -f ${protonGeRuntime}/share/korri/proton-ge-runtime/setup-env
      grep -q 'MMM_USE_PROTON_GE' ${payload}/bin/mega-man-maker-fex
      grep -q 'MMM_PROTON_GE_RUNTIME_SETUP' ${payload}/bin/mega-man-maker-fex
      grep -q 'KORRI_PROTON_GE_RUNTIME_WINEPREFIX' ${payload}/bin/mega-man-maker-fex
      grep -q 'KORRI_PROTON_GE_RUNTIME_WINE64' ${payload}/bin/mega-man-maker-fex
      grep -q 'KORRI_PROTON_GE_RUNTIME_PROTON' ${payload}/bin/mega-man-maker-fex
      grep -q 'KORRI_PROTON_GE_RUNTIME_PYTHON' ${payload}/bin/mega-man-maker-fex
      grep -q 'UMU_ID' ${payload}/bin/mega-man-maker-fex
      grep -q 'PROTON_USE_XALIA' ${payload}/bin/mega-man-maker-fex
      grep -q 'waitforexitandrun' ${payload}/bin/mega-man-maker-fex

      ${lib.optionalString isAarch64 ''
        grep -q 'fex-proton' ${payload}/nix-support/mega-man-maker/manifest.txt
      ''}

      test -f ${payload}/nix-support/mega-man-maker/manifest.txt
      grep -q '^engine=gamemaker-windows' ${payload}/nix-support/mega-man-maker/manifest.txt
      grep -q '^binary=MegaMaker.exe' ${payload}/nix-support/mega-man-maker/manifest.txt
      grep -q '^upstream-download=https://megamanmaker.com/downloads/MegaMaker_v1_10_4_2.zip' ${payload}/nix-support/mega-man-maker/manifest.txt
      grep -q '^source-sha256=3d2145136bb828b86f88f0efbd6d719d1cdea1c3c23d6c753f5432d33c6fe6af' ${payload}/nix-support/mega-man-maker/manifest.txt

      cat > "$out/summary.txt" <<'EOF'
      mega-man-maker derivation passes payload-shape, PE-arch, wrapper, runtime, and provenance-manifest checks.
      EOF
    ''
