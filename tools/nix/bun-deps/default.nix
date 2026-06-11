{
  pkgs,
  lib ? pkgs.lib,
}:

let
  proseqlOverrideKey = "@proseql/core@0.15.0";

  generatedBunNix = ../generated/bun.nix;
  generatedProductionPackageNames = ../generated/bun-production-package-names.nix;

  productionPackageNames = import generatedProductionPackageNames;

  # bun.nix is a function expecting fetchurl etc. We only need attribute names
  # for existence checks; values are lazy, so passing nulls is safe (we never
  # access them).
  bunNixManifest = import generatedBunNix {
    copyPathToStore = null;
    fetchFromGitHub = null;
    fetchgit = null;
    fetchurl = null;
  };

  forbiddenProductionPackagePatterns = [
    "@axe-core/playwright@"
    "@playwright/test@"
    "@storybook/"
    "@cucumber/"
    "@vitest/"
    "@testing-library/"
    "fallow@"
    "@argo-video/cli@"
    "@tiptap/"
    "@xyflow/"
  ];

  forbiddenProductionPackageMatches = builtins.filter (
    name: builtins.any (pattern: lib.hasInfix pattern name) forbiddenProductionPackagePatterns
  ) productionPackageNames;

  productionBunNix = builtins.toFile "bun-production.nix" ''
    { copyPathToStore, fetchFromGitHub, fetchgit, fetchurl, ... }@args:
    let
      full = import ${generatedBunNix} args;
      allowed = builtins.listToAttrs (
        map (name: { inherit name; value = null; }) (import ${generatedProductionPackageNames})
      );
    in
    builtins.intersectAttrs allowed full
  '';

  invariantFailures =
    lib.optional (!(builtins.hasAttr proseqlOverrideKey bunNixManifest)) ''
      override key '${proseqlOverrideKey}' is not present in tools/nix/generated/bun.nix.
      The proseql codec patch will not be applied to the bun offline cache.
      Update the override key to match the version recorded in tools/nix/generated/bun.nix
      (run `just refresh-bun-deps` if bun.lock changed).
    ''
    ++ lib.optional (!(builtins.elem proseqlOverrideKey productionPackageNames)) ''
      production Bun package set is missing '${proseqlOverrideKey}'.
      Update tools/nix/generated/bun-production-package-names.nix with `just refresh-bun-deps`.
    ''
    ++ lib.optional (forbiddenProductionPackageMatches != [ ]) ''
      production Bun package set includes known dev/test dependencies:
      ${lib.concatStringsSep ", " forbiddenProductionPackageMatches}

      Update tools/nix/bun-production-deps.ts and regenerate with `just refresh-bun-deps`.
    '';

  assertInvariants =
    value:
    if invariantFailures == [ ] then
      value
    else
      throw "Korri Bun dependency cache policy failed:\n${
        lib.concatMapStringsSep "\n" (failure: "- ${failure}") invariantFailures
      }";

  deps = assertInvariants (
    pkgs.bun2nix.fetchBunDeps {
      bunNix = productionBunNix;
      overrides = {
        ${proseqlOverrideKey} =
          pkg:
          pkgs.runCommandLocal "proseql-core-codec-patched" { } ''
            cp -R ${pkg} $out
            chmod -R u+w $out
            for codec in hjson json5 jsonc; do
              file="$out/dist/serializers/codecs/$codec.js"
              if [ -f "$file" ]; then
                sed -i 's/^import pkg from /import * as pkg from /' "$file"
              fi
            done
          '';
      };
    }
  );
in
{
  inherit
    deps
    proseqlOverrideKey
    productionPackageNames
    forbiddenProductionPackagePatterns
    forbiddenProductionPackageMatches
    productionBunNix
    ;

  check = assertInvariants (
    pkgs.runCommand "korri-bun-deps-policy-check" { } ''
      mkdir -p "$out"
      cat > "$out/summary.txt" <<'EOF'
      Korri Bun dependency cache policy passed.
      production package count: ${builtins.toString (builtins.length productionPackageNames)}
      proseql override key: ${proseqlOverrideKey}
      EOF
    ''
  );
}
