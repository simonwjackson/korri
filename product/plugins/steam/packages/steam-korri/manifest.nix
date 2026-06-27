# ROCKNIX Steam ARM64 guest-native package contract for SM8550 package consumers.
#
# Keep this manifest aligned with the ROCKNIX Steam package sources listed in
# `rocknixSource.paths`. It is intentionally data-only so package derivations,
# docs, and static checks can share the same bootstrap/resource expectations
# without importing ROCKNIX host/session launch policy.

{
  pname = "steam-rocknix-guest-native";
  version = "1.0.0.85-rocknix-guest-native";

  korriVendoredFrom = {
    repo = "github:simonwjackson/nix-on-rocks";
    rev = "402305ecb4a2f3a1f7edb34c0ae03349df73ef3d";
    path = "packages/steam";
  };

  rocknixSource = {
    repo = "github:simonwjackson/rocknix";
    rev = "a7b7898a11152b66475e0a6d72d090927c769731";
    paths = {
      package = "projects/ROCKNIX/packages/emulators/standalone/steam/package.mk";
      installHelper = "projects/ROCKNIX/packages/virtual/emulators/sources/Install Steam.sh";
      resources = "projects/ROCKNIX/packages/emulators/standalone/steam/resources";
      fexConfig = "projects/ROCKNIX/packages/compat/fex-emu/config/fex-emu";
      launcher = "projects/ROCKNIX/packages/emulators/standalone/steam/scripts/start_steam.sh";
    };
  };

  steamLauncher = {
    version = "1.0.0.85";
    debUrl = "https://repo.steampowered.com/steam/archive/stable/steam-launcher_1.0.0.85_amd64.deb";
    role = "ROCKNIX x86/FEX launcher source; not fetched by the v1 Nix derivation";
  };

  arm64Bootstrap = {
    runtimeTarUrl = "https://repo.steampowered.com/steamrt3c/images/latest-public-beta/steam-runtime-steamrt-arm64.tar.xz";
    defaultTrackingChannel = "steamdeck_stable";
    clientManifestUrl = "https://client-update.fastly.steamstatic.com/steam_client_steamdeck_stable_linuxarm64";
    cdnBaseUrl = "https://client-update.steamstatic.com";
    protonCompatibilityToolName = "Proton CachyOS 11.0 (ARM64)";
    protonCompatibilityToolLink = "proton-cachyos-11.0-20260601-slr-arm64";
  };

  resources = [
    {
      name = "compatibilitytool.vdf";
      file = ./resources/compatibilitytool.vdf;
      upstreamPath = "projects/ROCKNIX/packages/emulators/standalone/steam/resources/compatibilitytool.vdf";
      sha256 = "c64b93acb94ca6f3aaf915e46eb1f56d3106cc6f5aa06c8cba8ecc01d5affd84";
    }
    {
      name = "registry.vdf";
      file = ./resources/registry.vdf;
      upstreamPath = "projects/ROCKNIX/packages/emulators/standalone/steam/resources/registry.vdf";
      sha256 = "3cd5456968193f4f3fa15f291a795e6fa813e89691022dd3b94ad76e7ea029ce";
    }
    {
      name = "fex-emu/Config.json";
      file = ./resources/fex-emu/Config.json;
      upstreamPath = "projects/ROCKNIX/packages/compat/fex-emu/config/fex-emu/Config.json";
      sha256 = "fc10f006b7587e7ce1a5a57a412ecd6463627161c03a50b2471ad4367d6614c5";
    }
    {
      name = "fex-emu/AppConfig/steamwebhelper.json";
      file = ./resources/fex-emu/AppConfig/steamwebhelper.json;
      upstreamPath = "projects/ROCKNIX/packages/compat/fex-emu/config/fex-emu/AppConfig/steamwebhelper.json";
      sha256 = "e342841254a27b5e8f0cab30e39aa5792811a75da54f64a0ca23c4ffd3baf76b";
    }
  ];

  packageContract = {
    supported = [
      "immutable Steam bootstrap/resource artifact"
      "generic env-driven steam-arm64-bootstrap helper"
      "generic env-driven steam-arm64-seed helper for guest-owned mutable ARM64 client/runtime state"
      "generic steam-guest-native launcher preflight that executes the ARM64 client inside the guest"
      "explicit legacy steam-guest-runtime-prep helper for opt-in Steam Runtime / pressure-vessel repair"
      "generic steam-guest-run helper for the package-owned aarch64 FHS Steam execution capsule"
      "pressure-vessel exposure of already-provided input devices without startup-time Steam-owned file mutation"
      "resource/evidence output for downstream ROCKNIX or guest adapters"
    ];
    downstreamOwned = [
      "target Steam home and library layout"
      "SM8550 /storage default path choices"
      "/dev/uinput creation or repair"
      "FEX rootfs and thunk configuration"
      "binfmt toggling"
      "host or guest display-session orchestration"
      "Gamescope launch geometry"
      "per-game Proton or compatibility settings"
      "SM8550 power and affinity policy"
    ];
    unsupported = [
      "nix run .#steam as a complete Steam desktop launcher"
      "guest-native Steam client execution without a guest-provided nix-ld or FHS dynamic-linker strategy"
      "immutable Nix-store Valve ARM64 client/runtime seed artifacts in v1"
    ];
  };
}
