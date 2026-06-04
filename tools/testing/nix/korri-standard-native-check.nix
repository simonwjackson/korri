{
  pkgs,
  standardChecks ? [ ],
  standardCheckPaths ? [ ],
  ownerMatrix,
}:

let
  lib = pkgs.lib;
  check = message: assertion: { inherit message assertion; };

  ownerKinds = [
    "module"
    "composed-system"
    "package-output"
    "flake-wiring"
    "deeper-manual"
  ];

  checks = [
    (check "standard native owner matrix must include at least one entry" (ownerMatrix != [ ]))
  ]
  ++ map (
    entry: check "${entry.name}: owner kind is classified" (builtins.elem entry.owner ownerKinds)
  ) ownerMatrix;

  failures = builtins.filter (candidate: !candidate.assertion) checks;
in
if failures != [ ] then
  throw "Korri standard native check failed:\n${
    lib.concatMapStringsSep "\n" (failure: "- ${failure.message}") failures
  }"
else
  pkgs.runCommand "korri-standard-native-check" { } ''
    mkdir -p "$out"
    ${lib.concatMapStringsSep "\n" (path: ''
      if [ ! -e "${path}" ]; then
        echo "standard native dependency missing: ${path}" >&2
        exit 1
      fi
    '') standardCheckPaths}
    cat > "$out/summary.txt" <<'EOF'
    Korri standard native gate passed.
    EOF
  ''
