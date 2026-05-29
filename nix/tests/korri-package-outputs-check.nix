{
  pkgs,
  packages,
}:

let
  lib = pkgs.lib;
  check = message: assertion: { inherit message assertion; };

  packagePath = name: packages.${name};
  moonlightClosure = pkgs.closureInfo {
    rootPaths = [ (packagePath "moonlight-embedded-korri") ];
  };

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
    (check "korri-portal package exposes index.html" (
      builtins.pathExists "${packagePath "korri-portal"}/index.html"
    ))
    (check "SDL2-korri package exposes libSDL2 ABI library" (
      builtins.pathExists "${packagePath "SDL2-korri"}/lib/libSDL2-2.0.so.0"
    ))
    (check "global pkgs.SDL2 remains upstream sdl2-compat" (pkgs.SDL2.pname == "sdl2-compat"))
    (check "global pkgs.SDL2 is not SDL2-korri" (
      pkgs.SDL2.drvPath != (packagePath "SDL2-korri").drvPath
    ))
  ];

  failures = builtins.filter (candidate: !candidate.assertion) checks;
in
if failures != [ ] then
  throw "Korri package outputs check failed:\n${
    lib.concatMapStringsSep "\n" (failure: "- ${failure.message}") failures
  }"
else
  pkgs.runCommand "korri-package-outputs-check" { inherit moonlightClosure; } ''
    set -eu

    paths_file="$moonlightClosure/store-paths"
    if ! grep -E -- '-SDL2-korri-[^/]*$' "$paths_file" >/dev/null; then
      echo "error: moonlight-embedded-korri closure does not reference SDL2-korri" >&2
      exit 1
    fi

    if grep -E -- '-sdl2-compat-[^/]*$' "$paths_file" >/dev/null; then
      echo "error: moonlight-embedded-korri closure references sdl2-compat; expected SDL2-korri only" >&2
      grep -E -- '-sdl2-compat-[^/]*$' "$paths_file" >&2
      exit 1
    fi

    mkdir -p "$out"
    cp "$paths_file" "$out/moonlight-closure-store-paths.txt"
    cat > "$out/summary.txt" <<'EOF'
    Korri package output invariants passed.
    SDL2-korri output and moonlight closure reference invariants passed.
    EOF
  ''
