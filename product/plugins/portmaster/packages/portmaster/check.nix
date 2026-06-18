# Colocated package check for the PortMaster plugin package surface.
{
  pkgs,
  portmasterPackage,
}:

let
  lib = pkgs.lib;
  pkg = portmasterPackage;
  check = message: assertion: { inherit message assertion; };

  checks = [
    (check "portmaster exposes the expected pinned version" ((pkg.version or null) == "2026.05.24-0035"))
    (check "portmaster exposes the expected mainProgram" ((pkg.meta.mainProgram or null) == "portmaster"))
  ];

  failures = builtins.filter (candidate: !candidate.assertion) checks;
in
if failures != [ ] then
  throw "portmaster check failed:\n${
    lib.concatMapStringsSep "\n" (failure: "- ${failure.message}") failures
  }"
else
  pkgs.runCommand "portmaster-check"
    {
      nativeBuildInputs = [ pkgs.file ];
    }
    ''
      set -euo pipefail

      portmaster_dir=${pkg}/share/korri/portmaster/PortMaster
      mkdir -p "$out"

      test -x ${pkg}/bin/portmaster
      test -d "$portmaster_dir"
      test -f "$portmaster_dir/version"
      test "$(cat "$portmaster_dir/version")" = "2026.05.24-0035"
      test -x "$portmaster_dir/PortMaster.sh"
      test -x "$portmaster_dir/harbourmaster"
      test -x "$portmaster_dir/pugwash"
      test -x "$portmaster_dir/gptokeyb"
      test -x "$portmaster_dir/gptokeyb2"
      test -f "$portmaster_dir/control.txt"
      test -f "$portmaster_dir/pylibs.zip"
      test -d "$portmaster_dir/autoinstall"
      test -d "$portmaster_dir/runtimes"
      test -d "$portmaster_dir/libs"

      grep -q 'KORRI_PORTMASTER_HOME' "$portmaster_dir/PortMaster.sh"
      grep -q 'KORRI_PORTMASTER_HOME' "$portmaster_dir/control.txt"
      grep -q 'KORRI_PORTMASTER_DIRECTORY' "$portmaster_dir/control.txt"
      grep -q 'korri/portmaster-roms' ${pkg}/bin/portmaster
      grep -q '.korri-portmaster-source-version' ${pkg}/bin/portmaster

      file -b "$portmaster_dir/gptokeyb" > "$out/gptokeyb-file.txt"
      grep -q 'ARM aarch64' "$out/gptokeyb-file.txt"

      cat > "$out/summary.txt" <<'SUMMARY'
      portmaster package surface passes payload, wrapper, Korri path patch, and pinned-version checks.
      SUMMARY
    ''
