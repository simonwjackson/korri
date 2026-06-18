# Colocated package check for mega-man-arena.
#
# Asserts the upstream zip payload shape, Windows PE architecture, wrapper
# contract, and provenance manifest without trying to boot the GUI game.
{
  pkgs,
  megaManArenaPackage,
}:

let
  lib = pkgs.lib;
  pkg = megaManArenaPackage;
  payload = pkg.passthru.payload or pkg;
  fexRuntime = pkg.passthru.fexRuntime;
  fexRuntimeSetup = "${fexRuntime}/share/korri/fex-runtime/setup-env";
  protonRuntime = pkg.passthru.protonRuntime;
  protonRuntimeSetup = "${protonRuntime}/share/korri/proton-runtime/setup-env";
  protonGeRuntime = pkg.passthru.protonGeRuntime;
  protonGeRuntimeSetup = "${protonGeRuntime}/share/korri/proton-ge-runtime/setup-env";
  check = message: assertion: { inherit message assertion; };
  isAarch64 = pkgs.stdenv.hostPlatform.system == "aarch64-linux";

  checks = [
    (check "mega-man-arena exposes the expected mainProgram" (
      (pkg.meta.mainProgram or null) == "mega-man-arena"
    ))
    (check "mega-man-arena records the pinned upstream version" (
      (pkg.passthru.version or null) == "4.20"
    ))
    (check "mega-man-arena advertises the upstream Windows binary name" (
      (pkg.passthru.binaryName or null) == "MegaManArena.exe"
    ))
    (check "mega-man-arena carries the FEX runtime package" ((pkg.passthru.fexRuntime or null) != null))
    (check "mega-man-arena carries the Proton runtime package" (
      (pkg.passthru.protonRuntime or null) != null
    ))
    (check "mega-man-arena carries the optional Proton-GE runtime package" (
      (pkg.passthru.protonGeRuntime or null) != null
    ))
  ];

  failures = builtins.filter (candidate: !candidate.assertion) checks;
in
if failures != [ ] then
  throw "mega-man-arena check failed:\n${
    lib.concatMapStringsSep "\n" (failure: "- ${failure.message}") failures
  }"
else
  pkgs.runCommand "mega-man-arena-check"
    {
      nativeBuildInputs = [ pkgs.file ];
    }
    ''
      set -euo pipefail

      mkdir -p "$out"

      test -x ${pkg}/bin/mega-man-arena
      test -x ${payload}/bin/mega-man-arena-wine
      test -x ${payload}/bin/mega-man-arena-fex
      test -f ${payload}/share/mega-man-arena/MegaManArena.exe
      test -f ${payload}/share/mega-man-arena/data.win
      test -f ${payload}/share/mega-man-arena/options.ini
      test -d ${payload}/share/mega-man-arena/Music
      test -f ${payload}/share/mega-man-arena/Music/mm2_title.nsf

      magic=$(head -c2 ${payload}/share/mega-man-arena/MegaManArena.exe | od -An -tx1 | tr -d ' \n')
      if [ "$magic" != "4d5a" ]; then
        echo "error: MegaManArena.exe is not a PE executable (magic: $magic)" >&2
        exit 1
      fi

      file -b ${payload}/share/mega-man-arena/MegaManArena.exe | grep -q 'PE32+ executable.*x86-64'

      grep -q 'MMA_RUN_DIR' ${payload}/bin/mega-man-arena-wine
      grep -q 'XDG_DATA_HOME' ${payload}/bin/mega-man-arena-wine
      grep -q 'MegaManArena.exe' ${payload}/bin/mega-man-arena-wine
      ${lib.optionalString (!isAarch64) ''
        grep -q '/bin/wine' ${payload}/bin/mega-man-arena-wine
      ''}

      test -f ${fexRuntimeSetup}
      grep -q 'MMA_FEX_RUNTIME_SETUP' ${payload}/bin/mega-man-arena-fex
      grep -q 'KORRI_FEX_RUNTIME_APP_ID' ${payload}/bin/mega-man-arena-fex
      grep -q 'KORRI_FEX_RUNTIME_RUN_DIR' ${payload}/bin/mega-man-arena-fex
      grep -q 'KORRI_FEX_RUNTIME_ENABLE_THUNKS' ${payload}/bin/mega-man-arena-fex
      grep -F -q 'source "$fex_runtime_setup"' ${payload}/bin/mega-man-arena-fex
      grep -q 'MMA_ENABLE_FEX_THUNKS' ${payload}/bin/mega-man-arena-fex

      grep -q 'FEX_ROOTFS' ${fexRuntimeSetup}
      grep -q 'FEX_SERVERSOCKETPATH' ${fexRuntimeSetup}
      grep -F -q 'runtime_dir="/run/user/$uid"' ${fexRuntimeSetup}
      grep -F -q 'FEX_SERVERSOCKETPATH="$runtime_dir/$uid.FEXServer.Socket"' ${fexRuntimeSetup}
      grep -q 'FEX_APP_CONFIG' ${fexRuntimeSetup}
      grep -q 'FEX_THUNKHOSTLIBS' ${fexRuntimeSetup}
      grep -q 'freedreno_icd.x86_64.json' ${fexRuntimeSetup}
      grep -q '"Vulkan": 1' ${fexRuntimeSetup}
      grep -q '"GL": 1' ${fexRuntimeSetup}
      grep -q '"drm": 1' ${fexRuntimeSetup}
      grep -q '"WaylandClient": 1' ${fexRuntimeSetup}
      grep -q 'VK_ICD_FILENAMES' ${fexRuntimeSetup}

      test -f ${protonRuntimeSetup}
      grep -q 'MMA_PROTON_RUNTIME_SETUP' ${payload}/bin/mega-man-arena-fex
      grep -q 'KORRI_PROTON_RUNTIME_ROOT' ${payload}/bin/mega-man-arena-fex
      grep -q 'KORRI_PROTON_RUNTIME_FILES' ${payload}/bin/mega-man-arena-fex
      grep -q 'KORRI_PROTON_RUNTIME_WINEPREFIX' ${payload}/bin/mega-man-arena-fex
      grep -F -q 'source "$proton_runtime_setup"' ${payload}/bin/mega-man-arena-fex
      grep -q 'MMA_PROTON_ROOT' ${payload}/bin/mega-man-arena-fex
      grep -q 'MMA_PROTON_FILES' ${payload}/bin/mega-man-arena-fex
      grep -q 'MMA_USE_PROTON_SCRIPT' ${payload}/bin/mega-man-arena-fex
      grep -q 'KORRI_PROTON_RUNTIME_WINE64' ${payload}/bin/mega-man-arena-fex

      grep -q 'Proton 10.0' ${protonRuntimeSetup}
      grep -q 'wine64' ${protonRuntimeSetup}
      grep -q 'WINEDLLOVERRIDES' ${protonRuntimeSetup}
      grep -q 'dxvk/x86_64-windows' ${protonRuntimeSetup}
      grep -q 'vkd3d/x86_64-windows' ${protonRuntimeSetup}

      test -f ${protonGeRuntimeSetup}
      grep -q 'MMA_USE_PROTON_GE' ${payload}/bin/mega-man-arena-fex
      grep -q 'MMA_PROTON_GE_RUNTIME_SETUP' ${payload}/bin/mega-man-arena-fex
      grep -q 'KORRI_PROTON_GE_RUNTIME_WINEPREFIX' ${payload}/bin/mega-man-arena-fex
      grep -q 'compatdata-ge' ${payload}/bin/mega-man-arena-fex
      grep -q 'KORRI_PROTON_GE_RUNTIME_WINE64' ${payload}/bin/mega-man-arena-fex
      grep -q 'KORRI_PROTON_GE_RUNTIME_PROTON' ${payload}/bin/mega-man-arena-fex
      grep -q 'KORRI_PROTON_GE_RUNTIME_PYTHON' ${payload}/bin/mega-man-arena-fex
      grep -q 'UMU_ID' ${payload}/bin/mega-man-arena-fex
      grep -q 'PROTON_USE_XALIA' ${payload}/bin/mega-man-arena-fex
      grep -q 'waitforexitandrun' ${payload}/bin/mega-man-arena-fex
      grep -q 'GE-Proton10-34' ${protonGeRuntime}/share/korri/proton-ge-runtime/manifest.txt
      grep -q 'release-notes=import-aarch64-build-changes-from-upstream' ${protonGeRuntime}/share/korri/proton-ge-runtime/manifest.txt
      grep -q 'wine64' ${protonGeRuntimeSetup}
      grep -q 'dxvk/x86_64-windows' ${protonGeRuntimeSetup}

      ${lib.optionalString isAarch64 ''
        grep -q 'fex-proton' ${payload}/nix-support/mega-man-arena/manifest.txt
      ''}

      test -f ${payload}/nix-support/mega-man-arena/manifest.txt
      grep -q '^engine=gamemaker-windows' ${payload}/nix-support/mega-man-arena/manifest.txt
      grep -q '^binary=MegaManArena.exe' ${payload}/nix-support/mega-man-arena/manifest.txt
      grep -q '^upstream-download=https://bit.ly/mmav420' ${payload}/nix-support/mega-man-arena/manifest.txt

      cat > "$out/summary.txt" <<'EOF'
      mega-man-arena derivation passes payload-shape, PE-arch,
      wrapper, delegated FEX runtime, delegated Proton runtime, optional Proton-GE runtime, and provenance-manifest checks.
      EOF
    ''
