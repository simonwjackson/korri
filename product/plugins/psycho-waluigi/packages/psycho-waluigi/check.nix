# Colocated package check for psycho-waluigi.
{
  pkgs,
  psychoWaluigiPackage,
}:

let
  lib = pkgs.lib;
  pkg = psychoWaluigiPackage;
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
    (check "psycho-waluigi exposes the expected mainProgram" (
      (pkg.meta.mainProgram or null) == "psycho-waluigi"
    ))
    (check "psycho-waluigi records the pinned upstream version" (
      (pkg.passthru.version or null) == "2011-10-31"
    ))
    (check "psycho-waluigi advertises the upstream Windows binary name" (
      (pkg.passthru.binaryName or null) == "psychowaluigi.exe"
    ))
    (check "psycho-waluigi carries the FEX runtime package" ((pkg.passthru.fexRuntime or null) != null))
    (check "psycho-waluigi carries the Proton runtime package" (
      (pkg.passthru.protonRuntime or null) != null
    ))
    (check "psycho-waluigi carries the Proton-GE runtime package" (
      (pkg.passthru.protonGeRuntime or null) != null
    ))
  ];

  failures = builtins.filter (candidate: !candidate.assertion) checks;
in
if failures != [ ] then
  throw "psycho-waluigi check failed:\n${
    lib.concatMapStringsSep "\n" (failure: "- ${failure.message}") failures
  }"
else
  pkgs.runCommand "psycho-waluigi-check"
    {
      nativeBuildInputs = [ pkgs.file ];
    }
    ''
      set -euo pipefail

      mkdir -p "$out"

      test -x ${pkg}/bin/psycho-waluigi
      test -x ${payload}/bin/psycho-waluigi-wine
      test -x ${payload}/bin/psycho-waluigi-fex
      test -f ${payload}/share/psycho-waluigi/psychowaluigi.exe
      test -f ${payload}/share/psycho-waluigi/psychowaluigi.txt

      magic=$(head -c2 ${payload}/share/psycho-waluigi/psychowaluigi.exe | od -An -tx1 | tr -d ' \n')
      if [ "$magic" != "4d5a" ]; then
        echo "error: psychowaluigi.exe is not a PE executable (magic: $magic)" >&2
        exit 1
      fi

      file -b ${payload}/share/psycho-waluigi/psychowaluigi.exe | grep -q 'PE32 executable.*Intel 80386'

      grep -q 'PWL_RUN_DIR' ${payload}/bin/psycho-waluigi-wine
      grep -q 'XDG_DATA_HOME' ${payload}/bin/psycho-waluigi-wine
      grep -q 'psychowaluigi.exe' ${payload}/bin/psycho-waluigi-wine
      ${lib.optionalString (!isAarch64) ''
        grep -q '/bin/wine' ${payload}/bin/psycho-waluigi-wine
      ''}

      test -f ${fexRuntimeSetup}
      grep -q 'PWL_FEX_RUNTIME_SETUP' ${payload}/bin/psycho-waluigi-fex
      grep -q 'KORRI_FEX_RUNTIME_APP_ID' ${payload}/bin/psycho-waluigi-fex
      grep -q 'KORRI_FEX_RUNTIME_ENABLE_THUNKS' ${payload}/bin/psycho-waluigi-fex
      grep -F -q 'source "$fex_runtime_setup"' ${payload}/bin/psycho-waluigi-fex

      test -f ${protonRuntimeSetup}
      grep -q 'PWL_PROTON_RUNTIME_SETUP' ${payload}/bin/psycho-waluigi-fex
      grep -q 'KORRI_PROTON_RUNTIME_FILES' ${payload}/bin/psycho-waluigi-fex
      grep -q 'PWL_USE_PROTON_GE' ${payload}/bin/psycho-waluigi-fex

      test -f ${protonGeRuntimeSetup}
      grep -q 'PWL_PROTON_GE_RUNTIME_SETUP' ${payload}/bin/psycho-waluigi-fex
      grep -q 'KORRI_PROTON_GE_RUNTIME_WINEPREFIX' ${payload}/bin/psycho-waluigi-fex
      grep -q 'compatdata-ge' ${payload}/bin/psycho-waluigi-fex
      grep -q 'KORRI_PROTON_GE_RUNTIME_PROTON' ${payload}/bin/psycho-waluigi-fex
      grep -q 'KORRI_PROTON_GE_RUNTIME_PYTHON' ${payload}/bin/psycho-waluigi-fex
      grep -q 'UMU_ID' ${payload}/bin/psycho-waluigi-fex
      grep -q 'PROTON_USE_XALIA' ${payload}/bin/psycho-waluigi-fex
      grep -q 'KORRI_PROTON_GE_RUNTIME_FILES' ${payload}/bin/psycho-waluigi-fex
      grep -q 'PWL_USE_PROTON_GE_SCRIPT:-1' ${payload}/bin/psycho-waluigi-fex
      grep -q '/bin/wine' ${payload}/bin/psycho-waluigi-fex
      grep -q 'i386-windows' ${payload}/bin/psycho-waluigi-fex

      ${lib.optionalString isAarch64 ''
        grep -q 'fex-proton-ge' ${payload}/nix-support/psycho-waluigi/manifest.txt
      ''}

      test -f ${payload}/nix-support/psycho-waluigi/manifest.txt
      grep -q '^engine=multimedia-fusion-2-windows' ${payload}/nix-support/psycho-waluigi/manifest.txt
      grep -q '^binary=psychowaluigi.exe' ${payload}/nix-support/psycho-waluigi/manifest.txt
      grep -q '^upstream-download=https://mfgg.net/index.php?act=resdb&param=03&c=2&id=25698' ${payload}/nix-support/psycho-waluigi/manifest.txt
      grep -q '^source-sha256=4d5c8e02e62f00bb7a018664400425aaf9a110560b626c366cd1bd817ccac177' ${payload}/nix-support/psycho-waluigi/manifest.txt

      cat > "$out/summary.txt" <<'SUMMARY'
      psycho-waluigi derivation passes payload-shape, PE-arch,
      wrapper, delegated FEX runtime, delegated Proton runtime,
      Proton-GE runtime, and provenance-manifest checks.
      SUMMARY
    ''
