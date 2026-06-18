# Colocated package check for korri-proton-ge-runtime.
{
  pkgs,
  protonGeRuntimePackage,
}:

let
  lib = pkgs.lib;
  pkg = protonGeRuntimePackage;
  runtimeRoot = "${pkg}/share/korri/proton-ge-runtime/${pkg.passthru.version}";
  setupEnv = "${pkg}/share/korri/proton-ge-runtime/setup-env";
  check = message: assertion: { inherit message assertion; };

  checks = [
    (check "korri-proton-ge-runtime records the pinned GE-Proton version" (
      (pkg.passthru.version or null) == "GE-Proton10-34"
    ))
    (check "korri-proton-ge-runtime records the pinned asset hash" (
      (pkg.passthru.assetSha256 or null)
      == "51c580b66a833c73998fe00f0717eeac57197654040a2f2ed5189e3ee68d773d"
    ))
  ];

  failures = builtins.filter (candidate: !candidate.assertion) checks;
in
if failures != [ ] then
  throw "korri-proton-ge-runtime check failed:\n${
    lib.concatMapStringsSep "\n" (failure: "- ${failure.message}") failures
  }"
else
  pkgs.runCommand "korri-proton-ge-runtime-check"
    {
      nativeBuildInputs = [ pkgs.file ];
    }
    ''
      set -euo pipefail

      mkdir -p "$out"

      test -d ${runtimeRoot}
      test -x ${runtimeRoot}/files/bin/wine64
      test -x ${runtimeRoot}/proton
      test -d ${runtimeRoot}/files/lib/wine/dxvk/x86_64-windows
      test -d ${runtimeRoot}/files/lib/vkd3d/x86_64-windows
      test -f ${setupEnv}
      test -f ${pkg}/share/korri/proton-ge-runtime/manifest.txt

      grep -q 'GE-Proton10-34' ${pkg}/share/korri/proton-ge-runtime/manifest.txt
      grep -q 'release-notes=import-aarch64-build-changes-from-upstream' ${pkg}/share/korri/proton-ge-runtime/manifest.txt
      grep -q 'KORRI_PROTON_GE_RUNTIME_WINE64' ${setupEnv}
      grep -q 'KORRI_PROTON_GE_RUNTIME_PROTON' ${setupEnv}
      grep -q 'KORRI_PROTON_GE_RUNTIME_PYTHON' ${setupEnv}
      grep -q 'dxvk/x86_64-windows' ${setupEnv}
      grep -q 'vkd3d/x86_64-windows' ${setupEnv}
      grep -q 'x86_64-linux-gnu' ${setupEnv}

      file -b ${runtimeRoot}/files/bin/wine64 > "$out/wine64-file.txt"
      file -b ${runtimeRoot}/files/bin/wineserver > "$out/wineserver-file.txt"
      file -b ${runtimeRoot}/files/lib64/wine/x86_64-unix/ntdll.so > "$out/ntdll-file.txt"

      cat > "$out/summary.txt" <<'EOF'
      korri-proton-ge-runtime passes pinned asset, runtime shape,
      proton-launcher helper, and binary inspection checks.
      EOF
    ''
