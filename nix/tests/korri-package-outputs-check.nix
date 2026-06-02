{
  pkgs,
  packages,
}:

let
  lib = pkgs.lib;
  check = message: assertion: { inherit message assertion; };

  packagePath = name: packages.${name};

  checks = [
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
