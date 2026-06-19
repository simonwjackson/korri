# Colocated package check for Super Mario Bros. Wonderland 1987.
{
  pkgs,
  smbWonderland1987Package,
}:

let
  lib = pkgs.lib;
  pkg = smbWonderland1987Package;
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
    (check "smb-wonderland-1987 exposes the expected mainProgram" (
      (pkg.meta.mainProgram or null) == "smb-wonderland-1987"
    ))
    (check "smb-wonderland-1987 records the pinned upstream version" (
      (pkg.passthru.version or null) == "rev6-2024-11-12"
    ))
    (check "smb-wonderland-1987 advertises the upstream Windows binary name" (
      (pkg.passthru.binaryName or null) == "SMBWonderland87 (rev6).exe"
    ))
    (check "smb-wonderland-1987 carries the FEX runtime package" ((pkg.passthru.fexRuntime or null) != null))
    (check "smb-wonderland-1987 carries the Proton runtime package" (
      (pkg.passthru.protonRuntime or null) != null
    ))
    (check "smb-wonderland-1987 carries the Proton-GE runtime package" (
      (pkg.passthru.protonGeRuntime or null) != null
    ))
  ];

  failures = builtins.filter (candidate: !candidate.assertion) checks;
in
if failures != [ ] then
  throw "smb-wonderland-1987 check failed:\n${
    lib.concatMapStringsSep "\n" (failure: "- ${failure.message}") failures
  }"
else
  pkgs.runCommand "smb-wonderland-1987-check"
    {
      nativeBuildInputs = [ pkgs.file ];
    }
    ''
      set -euo pipefail

      mkdir -p "$out"

      test -x ${pkg}/bin/smb-wonderland-1987
      test -x ${payload}/bin/smb-wonderland-1987-wine
      test -x ${payload}/bin/smb-wonderland-1987-fex
      test -f "${payload}/share/smb-wonderland-1987/SMBWonderland87 (rev6).exe"
      test -f ${payload}/share/smb-wonderland-1987/artwork.png

      magic=$(head -c2 "${payload}/share/smb-wonderland-1987/SMBWonderland87 (rev6).exe" | od -An -tx1 | tr -d ' \n')
      if [ "$magic" != "4d5a" ]; then
        echo "error: SMBWonderland87 (rev6).exe is not a PE executable (magic: $magic)" >&2
        exit 1
      fi

      file -b "${payload}/share/smb-wonderland-1987/SMBWonderland87 (rev6).exe" | grep -q 'PE32 executable.*Intel 80386'

      grep -q 'SW87_RUN_DIR' ${payload}/bin/smb-wonderland-1987-wine
      grep -q 'XDG_DATA_HOME' ${payload}/bin/smb-wonderland-1987-wine
      grep -q 'SMBWonderland87 (rev6).exe' ${payload}/bin/smb-wonderland-1987-wine
      ${lib.optionalString (!isAarch64) ''
        grep -q '/bin/wine' ${payload}/bin/smb-wonderland-1987-wine
      ''}

      test -f ${fexRuntimeSetup}
      grep -q 'SW87_FEX_RUNTIME_SETUP' ${payload}/bin/smb-wonderland-1987-fex
      grep -q 'KORRI_FEX_RUNTIME_APP_ID' ${payload}/bin/smb-wonderland-1987-fex
      grep -q 'KORRI_FEX_RUNTIME_ENABLE_THUNKS' ${payload}/bin/smb-wonderland-1987-fex
      grep -F -q 'source "$fex_runtime_setup"' ${payload}/bin/smb-wonderland-1987-fex

      test -f ${protonRuntimeSetup}
      grep -q 'SW87_PROTON_RUNTIME_SETUP' ${payload}/bin/smb-wonderland-1987-fex
      grep -q 'KORRI_PROTON_RUNTIME_FILES' ${payload}/bin/smb-wonderland-1987-fex
      grep -q 'SW87_USE_PROTON_GE' ${payload}/bin/smb-wonderland-1987-fex

      test -f ${protonGeRuntimeSetup}
      grep -q 'SW87_PROTON_GE_RUNTIME_SETUP' ${payload}/bin/smb-wonderland-1987-fex
      grep -q 'KORRI_PROTON_GE_RUNTIME_WINEPREFIX' ${payload}/bin/smb-wonderland-1987-fex
      grep -q 'compatdata-ge' ${payload}/bin/smb-wonderland-1987-fex
      grep -q 'KORRI_PROTON_GE_RUNTIME_PROTON' ${payload}/bin/smb-wonderland-1987-fex
      grep -q 'KORRI_PROTON_GE_RUNTIME_PYTHON' ${payload}/bin/smb-wonderland-1987-fex
      grep -q 'UMU_ID' ${payload}/bin/smb-wonderland-1987-fex
      grep -q 'PROTON_USE_XALIA' ${payload}/bin/smb-wonderland-1987-fex
      grep -q 'KORRI_PROTON_GE_RUNTIME_FILES' ${payload}/bin/smb-wonderland-1987-fex
      grep -q 'SW87_USE_PROTON_GE_SCRIPT:-1' ${payload}/bin/smb-wonderland-1987-fex
      grep -q '/bin/wine' ${payload}/bin/smb-wonderland-1987-fex
      grep -q 'i386-windows' ${payload}/bin/smb-wonderland-1987-fex

      ${lib.optionalString isAarch64 ''
        grep -q 'fex-proton-ge' ${payload}/nix-support/smb-wonderland-1987/manifest.txt
      ''}

      test -f ${payload}/nix-support/smb-wonderland-1987/manifest.txt
      grep -q '^engine=hello-engine-windows' ${payload}/nix-support/smb-wonderland-1987/manifest.txt
      grep -q '^binary=SMBWonderland87 (rev6).exe' ${payload}/nix-support/smb-wonderland-1987/manifest.txt
      grep -q '^upstream-download=https://mfgg.net/index.php?act=resdb&param=03&c=2&id=40985' ${payload}/nix-support/smb-wonderland-1987/manifest.txt
      grep -q '^source-sha256=adedd55775e258fdee5d210618348257f6e56e573ed29cfd7067ecc7a725c399' ${payload}/nix-support/smb-wonderland-1987/manifest.txt

      cat > "$out/summary.txt" <<'SUMMARY'
      smb-wonderland-1987 derivation passes payload-shape, PE-arch,
      wrapper, delegated FEX runtime, delegated Proton runtime,
      Proton-GE runtime, and provenance-manifest checks.
      SUMMARY
    ''
