{
  pkgs,
  retroarchBarePackage ? pkgs.retroarch-bare,
}:

let
  lib = pkgs.lib;
  pkg = retroarchBarePackage;
  staticChecks = [
    {
      message = "retroarch-bare passthru must guarantee XDelta patch support";
      assertion = (pkg.passthru.xdeltaPatches or false) == true;
    }
    {
      message = "retroarch-bare configure flags must enable XDelta";
      assertion = builtins.elem "--enable-xdelta" (pkg.configureFlags or [ ]);
    }
    {
      message = "retroarch-bare must record the xz/liblzma package that enables XDelta";
      assertion = (pkg.passthru.xdeltaLzmaPackage or null) == pkgs.xz;
    }
  ];
  failures = builtins.filter (candidate: !candidate.assertion) staticChecks;
in
if failures != [ ] then
  throw "Korri RetroArch XDelta package check failed:\n${
    lib.concatMapStringsSep "\n" (failure: "- ${failure.message}") failures
  }"
else
  pkgs.runCommand "korri-retroarch-xdelta-check" { nativeBuildInputs = [ pkg ]; } ''
    set -eu
    mkdir -p "$out"
    retroarch --help > "$out/retroarch-help.txt"
    grep -- '--xdelta' "$out/retroarch-help.txt" > /dev/null
    cat > "$out/summary.txt" <<'EOF'
    RetroArch exposes --xdelta and the package advertises XDelta patch support.
    EOF
  ''
