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
  bootstrapScript = builtins.readFile ./scripts/steam-arm64-bootstrap;
  runtimePrepScript = builtins.readFile ./scripts/steam-guest-runtime-prep;
  guestRunScript = builtins.readFile ./scripts/steam-guest-run;
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
    (check "steam-korri seed provisions packaged proton-cachyos-arm64" (
      lib.hasInfix "proton-cachyos-11.0-20260601-slr-arm64" seedScript
      && lib.hasInfix "@korriProtonCachyosArm64@" seedScript
      && lib.hasInfix "ln -sfn \"$PROTON_SOURCE/\" \"$PROTON_LINK\"" seedScript
      && lib.hasInfix "rm -f \"$STEAM_HOME/compatibilitytools.d/Proton11ARM\"" seedScript
    ))
    (check "steam-korri bootstrap registers cachyos compat manifest without touching Steam-managed Proton" (
      lib.hasInfix ''atomic_copy "$resource_dir/compatibilitytool.vdf" "$STEAM_HOME/compatibilitytools.d/compatibilitytool.vdf"'' bootstrapScript
      && lib.hasInfix ''rm -f "$STEAM_HOME/compatibilitytools.d/Proton11ARM"'' bootstrapScript
      && !(lib.hasInfix "steamapps/common/Proton" bootstrapScript)
    ))
    (check "steam-korri scripts default to the stable ARM64 tracking channel" (
      lib.hasInfix ''STEAM_BETA="''${STEAM_BETA:-steamdeck_stable}"'' seedScript
      && lib.hasInfix ''STEAM_BETA="''${STEAM_BETA:-steamdeck_stable}"'' bootstrapScript
      && lib.hasInfix "steam_client_\${STEAM_BETA}_linuxarm64" seedScript
      && lib.hasInfix "steam_client_\${STEAM_BETA}_linuxarm64" bootstrapScript
    ))
    (check "steam-korri seed wrapper includes xz for fresh runtime extraction" (
      lib.hasInfix "unzip xz" packageSource
    ))
    (check "steam-korri bootstrap repairs standard ~/.steam links" (
      lib.hasInfix "\"$STEAM_DOT/root\"" bootstrapScript
      && lib.hasInfix "\"$STEAM_DOT/bin32\"" bootstrapScript
      && lib.hasInfix "\"$STEAM_DOT/sdkarm64\"" bootstrapScript
    ))
    (check "steam-korri guest runner resolves Valve video codecs first" (
      lib.hasInfix "steamrtarm64/video:$STEAM_HOME/steamrtarm64" guestRunScript
      && lib.hasInfix "av_malloc_tracked" guestRunScript
    ))
    (check "steam-korri runtime prep keeps patch-proton scoped to compatibility tools" (
      lib.hasInfix ''"$mode" = patch-proton'' runtimePrepScript
      && lib.hasInfix ''find "$compat_tools" -mindepth 1 -maxdepth 1 -type d'' runtimePrepScript
      && lib.hasInfix "find \"$common\" -mindepth 1 -maxdepth 1 -type d -name 'Proton*'" runtimePrepScript
    ))
    (check "steam-korri guest runner does not apply runtime prep on normal startup" (
      lib.hasInfix "must not run --apply" runtimePrepScript
      && lib.hasInfix "Do not run" guestRunScript
      && !(lib.hasInfix ''"$runtime_prep" --apply'' guestRunScript)
    ))
    (check "steam-korri runtime prep productizes Proton ARM64 patches" (
      lib.hasInfix "KORRI_FEX_LAUNCHER_PATCH" runtimePrepScript
      && lib.hasInfix "KORRI_30XX_DIRECT_EXE_PATCH" runtimePrepScript
      && lib.hasInfix "KORRI_FEX_CONFIG_MERGE_PATCH" runtimePrepScript
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

      tmp=$(mktemp -d)
      trap 'rm -rf "$tmp"' EXIT
      steam_home="$tmp/Steam"
      proton_dir="$steam_home/compatibilitytools.d/proton-cachyos-11.0-20260601-slr-arm64"
      steam_managed_proton="$steam_home/steamapps/common/Proton 11.0 (ARM64)"
      mkdir -p "$proton_dir" "$steam_managed_proton"
      cat > "$steam_managed_proton/proton" <<'STEAM_MANAGED'
#!/usr/bin/env python3
# Steam-managed Proton must stay untouched by --patch-proton.
STEAM_MANAGED
      chmod 755 "$steam_managed_proton/proton"
      cat > "$proton_dir/proton" <<'PROTON'
#!/usr/bin/env python3
import json
import os
import platform
import shutil
import subprocess
import sys
class Proton:
    host_pe_arch = "x86_64-windows"
    wine_bin = "/tmp/proton/files/bin/wine"
    lib_dir = "/tmp/proton/files/lib"
    dist_dir = "/tmp/proton"
    def path(self, suffix):
        return "/tmp/proton/" + suffix
g_proton = Proton()
class CompatData:
    fex_config_file = "/tmp/fex-config.json"
g_compatdata = CompatData()
class Session:
    env = {}
    log_file = sys.stderr
    remote_debug_cmd = None
    cmdlineappend = []
    def log_enabled_for(self, name, default):
        return default
    def generate_fex_app_config(self):
        app_config = {"Config": {}, "ThunksDB": {}}
        if "PROTON_LOG" in self.env:
            app_config["Config"]["SilentLog"] = "0" if self.log_enabled_for("fex", True) else "1"

        return app_config
    def init_session(self, update_prefix_files):
        self.env["FEX_APP_CONFIG_LOCATION"] = os.path.join(g_proton.dist_dir, "share/fex-emu/")
    def run_proc(self, args, local_env=None):
        if local_env is None:
            local_env = self.env
        return subprocess.call(args, env=local_env, stderr=self.log_file, stdout=self.log_file)
    def run(self):
        adverb = []
        remote_debug_proc = None
        # CoD: Black Ops 3 workaround
        if os.environ.get("SteamGameId", 0) in [
                    "311210",
                ]:
            argv = [g_proton.wine_bin, "c:\\Program Files (x86)\\Steam\\steam.exe"]
        else:
            argv = [g_proton.lib_dir + "/wine/x86_64-unix/wine-preloader", g_proton.lib_dir + "/wine/x86_64-unix/wine", "c:\\windows\\system32\\steam.exe"]

        rc = self.run_proc(adverb + argv + sys.argv[2:] + self.cmdlineappend)
PROTON
      chmod 755 "$proton_dir/proton"
      STEAM_HOME="$steam_home" "$package_out/bin/steam-guest-runtime-prep" --patch-proton
      grep -q 'KORRI_FEX_LAUNCHER_PATCH' "$proton_dir/proton" || {
        echo "runtime prep did not apply Proton FEX launcher patch" >&2
        exit 1
      }
      ! grep -q 'KORRI_FEX_LAUNCHER_PATCH' "$steam_managed_proton/proton" || {
        echo "patch-proton mutated Steam-managed Proton" >&2
        exit 1
      }
      grep -q 'KORRI_30XX_DIRECT_EXE_PATCH' "$proton_dir/proton" || {
        echo "runtime prep did not apply 30XX direct-exe patch" >&2
        exit 1
      }
      grep -q 'KORRI_FEX_CONFIG_MERGE_PATCH' "$proton_dir/proton" || {
        echo "runtime prep did not apply FEX config merge patch" >&2
        exit 1
      }
      before=$(sha256sum "$proton_dir/proton" | cut -d' ' -f1)
      STEAM_HOME="$steam_home" "$package_out/bin/steam-guest-runtime-prep" --patch-proton
      after=$(sha256sum "$proton_dir/proton" | cut -d' ' -f1)
      test "$before" = "$after" || {
        echo "runtime prep Proton patching is not idempotent" >&2
        exit 1
      }

      cat > "$out/summary.txt" <<'EOF'
      steam-korri derivation passes helper, provenance, resource, and smoke-fix checks.
      EOF
    ''
