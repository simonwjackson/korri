{
  pkgs,
  packages,
}:

let
  lib = pkgs.lib;
  check = message: assertion: { inherit message assertion; };

  packagePath = name: packages.${name};

  checks = [
    (check "korri-cli package exposes executable wrapper" (
      builtins.pathExists "${packagePath "korri-cli"}/bin/korri"
    ))
    (check "korri-cli wrapper provides Nix find for Scout scans" (
      lib.hasInfix "KORRI_FIND_BIN" (builtins.readFile "${packagePath "korri-cli"}/bin/korri")
      && lib.hasInfix "findutils" (builtins.readFile "${packagePath "korri-cli"}/bin/korri")
      && lib.hasInfix "/bin/find" (builtins.readFile "${packagePath "korri-cli"}/bin/korri")
    ))
    (check "korri-cli package exposes bundled JS" (
      builtins.pathExists "${packagePath "korri-cli"}/share/korri-cli/korri-cli.js"
    ))
    (check "korri-cli package does not expose standalone bazzar wrapper" (
      !(builtins.pathExists "${packagePath "korri-cli"}/bin/bazzar")
    ))
    (check "korrid package exposes executable wrapper" (
      builtins.pathExists "${packagePath "korrid"}/bin/korrid"
    ))
    (check "korrid package exposes API wrapper" (
      builtins.pathExists "${packagePath "korrid"}/bin/korri-api"
    ))
    (check "korrid package exposes bundled JS" (
      builtins.pathExists "${packagePath "korrid"}/share/korrid/korrid.js"
    ))
    (check "korrid package exposes bundled API JS" (
      builtins.pathExists "${packagePath "korrid"}/share/korrid/korri-api.js"
    ))
    (check "korri-inputd package exposes executable wrapper" (
      builtins.pathExists "${packagePath "korri-inputd"}/bin/korri-inputd"
    ))
    (check "korri-inputd package exposes bundled JS" (
      builtins.pathExists "${packagePath "korri-inputd"}/share/korri-inputd/korri-inputd.js"
    ))
    (check "korri-game-stream package exposes runner wrapper" (
      builtins.pathExists "${packagePath "korri-game-stream"}/bin/korri-game-stream-runner"
    ))
    (check "korri-game-stream package exposes enqueue wrapper" (
      builtins.pathExists "${packagePath "korri-game-stream"}/bin/korri-game-stream-enqueue"
    ))
    (check "korri-game-stream package exposes bundled JS" (
      builtins.pathExists "${packagePath "korri-game-stream"}/share/korri-game-stream/korri-game-stream-runner.js"
    ))
    (check "korri-gamescope-control-bridge package exposes bridge wrapper" (
      builtins.pathExists "${packagePath "korri-gamescope-control-bridge"}/bin/gamescope-control-bridge"
    ))
    (check "korri-gamescope-control-bridge package exposes operator CLI wrapper" (
      builtins.pathExists "${packagePath "korri-gamescope-control-bridge"}/bin/gamescope-control"
    ))
    (check "korri-gamescope-control-bridge package exposes stream control bench wrapper" (
      builtins.pathExists "${packagePath "korri-gamescope-control-bridge"}/bin/stream-control-bench"
    ))
    (check "korri-gamescope-control-bridge package exposes bundled bridge JS" (
      builtins.pathExists "${packagePath "korri-gamescope-control-bridge"}/share/korri-gamescope-control-bridge/gamescope-control-bridge.js"
    ))
    (check "korri-gamescope-control-bridge package exposes bundled stream control bench JS" (
      builtins.pathExists "${packagePath "korri-gamescope-control-bridge"}/share/korri-gamescope-control-bridge/stream-control-bench.js"
    ))
    (check "korri-portal package exposes index.html" (
      builtins.pathExists "${packagePath "korri-portal"}/index.html"
    ))
  ];

  failures = builtins.filter (candidate: !candidate.assertion) checks;
in
if failures != [ ] then
  throw "Korri package outputs check failed:\n${
    lib.concatMapStringsSep "\n" (failure: "- ${failure.message}") failures
  }"
else
  pkgs.runCommand "korri-package-outputs-check" { } ''
    mkdir -p "$out"
    cat > "$out/summary.txt" <<'EOF'
    Korri package output invariants passed.
    EOF
  ''
