{
  pkgs,
  standardChecks,
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
    (check "standard native gate must include at least one check" (standardChecks != [ ]))
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
    ${lib.concatMapStringsSep "\n" (drv: ''
      if [ ! -e "${drv}" ]; then
        echo "standard native dependency missing: ${drv}" >&2
        exit 1
      fi
    '') standardChecks}
    cat > "$out/summary.txt" <<'EOF'
    Korri standard native gate passed.
    EOF
  ''
