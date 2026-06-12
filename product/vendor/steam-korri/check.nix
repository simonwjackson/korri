# Colocated package-output contract for steam-korri.
#
# The package owns immutable helper scripts and the optional aarch64 FHS run
# capsule. Product/session policy stays in the NixOS module. Keep the checks
# here focused on artifact shape, helper contracts, and vendoring provenance.
{
  pkgs,
  steamKorriPackage,
}:

let
  lib = pkgs.lib;
  pkg = steamKorriPackage;
  manifest = pkg.rocknixSteamManifest or { };
  isAarch64 = pkgs.stdenv.hostPlatform.system == "aarch64-linux";
  sourceRoot = ./.;
  seedScript = builtins.readFile ./scripts/steam-arm64-seed;
  packageSource = builtins.readFile ./package.nix;

  check = message: assertion: { inherit message assertion; };
  checks = [
    (check "steam-korri exposes the ROCKNIX Steam manifest passthru" (pkg ? rocknixSteamManifest))
    (check "steam-korri records the nix-on-rocks vendoring source" (
      (manifest.korriVendoredFrom.repo or null) == "github:simonwjackson/nix-on-rocks"
      && (manifest.korriVendoredFrom.path or null) == "packages/steam"
      && (manifest.korriVendoredFrom.rev or "") != ""
    ))
    (check "steam-korri exposes helper derivation passthru" (pkg ? rocknixSteamHelpers))
    (check "steam-korri run-capsule passthru matches the host platform" (
      (pkg.rocknixSteamHasRunCapsule or null) == isAarch64
    ))
    (check "steam-korri keeps x86 builds helper-only" (
      isAarch64 || (pkg.rocknixSteamFhs or null) == null
    ))
    (check "steam-korri seed normalizes literal backslash zip entries" (
      lib.hasInfix "korri-normalize-backslash-zip-entries" seedScript
      && lib.hasInfix "normalize_backslash_zip_entries \"$STEAM_HOME\"" seedScript
    ))
    (check "steam-korri FHS target package list carries util-linux/taskset" (
      lib.hasInfix "util-linux" packageSource
    ))
  ];

  failures = builtins.filter (candidate: !candidate.assertion) checks;
in
if failures != [ ] then
  throw "steam-korri package check failed:\n${
    lib.concatMapStringsSep "\n" (failure: "- ${failure.message}") failures
  }"
else
  pkgs.runCommand "steam-korri-check"
    {
      nativeBuildInputs = [ pkgs.coreutils pkgs.gnugrep ];
      passthru = {
        inherit manifest;
      };
    }
    ''
      set -eu
      mkdir -p "$out"

      package_out=${pkg}
      manifest_file="$package_out/nix-support/rocknix-steam-bootstrap/manifest.txt"

      for executable in \
        steam-arm64-bootstrap \
        steam-arm64-seed \
        steam-guest-native \
        steam-guest-runtime-prep \
        steam-guest-run; do
        test -x "$package_out/bin/$executable" || {
          echo "built Steam package missing executable: $executable" >&2
          exit 1
        }
      done

      test -f "$manifest_file" || {
        echo "built Steam package missing bootstrap manifest: $manifest_file" >&2
        exit 1
      }

      grep -q 'steam-runtime-prep-helper=bin/steam-guest-runtime-prep' "$manifest_file" || {
        echo "built Steam package evidence missing runtime prep helper" >&2
        exit 1
      }
      grep -q 'korri-vendored-from-rev=${manifest.korriVendoredFrom.rev}' "$manifest_file" || {
        echo "built Steam package evidence missing Korri vendoring provenance" >&2
        exit 1
      }
      grep -q 'immutable-nix-store-valve-arm64-seed-artifacts=false' "$manifest_file" || {
        echo "built Steam package must keep mutable Valve payloads out of the Nix store" >&2
        exit 1
      }

      if grep -q 'steam-run-capsule=bin/steam-arm64-fhs' "$manifest_file"; then
        test -x "$package_out/bin/steam-arm64-fhs" || {
          echo "Steam package evidence claims missing steam-arm64-fhs" >&2
          exit 1
        }
      else
        grep -q 'steam-run-capsule=aarch64-only' "$manifest_file" || {
          echo "Steam package evidence missing aarch64-only run capsule marker" >&2
          exit 1
        }
      fi

      for resource in \
        compatibilitytool.vdf \
        registry.vdf \
        toolmanifest.vdf \
        fex-emu/Config.json \
        fex-emu/AppConfig/steamwebhelper.json; do
        test -f "$package_out/share/steam-rocknix-bootstrap/resources/$resource" || {
          echo "built Steam package missing resource: $resource" >&2
          exit 1
        }
      done

      set +e
      smoke_out=$(env -i PATH="$PATH" "$package_out/bin/steam-arm64-seed" --dry-run 2>&1)
      status=$?
      set -e
      if [ "$status" -eq 0 ] || ! printf '%s\n' "$smoke_out" | grep -q 'STEAM_HOME must be set explicitly'; then
        echo "steam-arm64-seed must reject missing STEAM_HOME in dry-run mode" >&2
        printf '%s\n' "$smoke_out" >&2
        exit 1
      fi

      cat > "$out/summary.txt" <<'EOF'
      steam-korri derivation passes helper, provenance, resource, and smoke-fix checks.
      EOF
    ''
