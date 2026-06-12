# Ryubing (Ryujinx fork) pinned onto a Mesa >= 26 Turnip Vulkan driver.
#
# Why this wrapper exists:
#
#   On Adreno devices (SM8550 / A740), the repo's main nixpkgs-25.11 pin
#   ships Mesa 25.2.6, whose Turnip driver is pathologically slow for
#   Ryujinx's Vulkan workload — the diagnostic signature is Ryujinx
#   spamming "GPU processing thread is too slow, waiting on CPU...".
#   Mesa >= 26 Turnip resolves it outright. This was established twice:
#   nix-on-rocks 2026-05-10 (same Ryujinx binary: 60 FPS on Mesa 26.0.6,
#   4 FPS on Mesa 25.2.6) and re-validated on bandai 2026-06-11 with
#   Mesa 26.1.2. See
#   docs/solutions/performance-issues/ryubing-sm8550-turnip26-openal-2026-06-11.md.
#
#   Note the asymmetry: Cemu does NOT care about this driver delta (the
#   2026-05-09 Cemu audit found driver parity and promoted the main-pin
#   Mesa). The override is therefore scoped to Ryubing only, not a
#   global mesa substitution.
#
# How it works:
#
#   The upstream `ryubing` package is left untouched; this wrapper
#   re-exposes `bin/Ryujinx` with VK_DRIVER_FILES / VK_ICD_FILENAMES
#   (legacy alias) pinned to the freedreno (Turnip) ICD from the
#   `nixpkgs-mesa` flake input — a pinned nixpkgs commit carrying
#   Mesa >= 26, mirroring the `nixpkgs-godot` narrow-scope
#   cross-channel precedent. Only the freedreno ICD is exposed, so
#   non-Adreno hosts must not use this wrapper (the overlay gates the
#   `pkgs.ryubing` substitution to aarch64).
{
  lib,
  stdenv,
  symlinkJoin,
  makeWrapper,
  ryubing,
  # Mesa engine pin, wired by the overlay.
  nixpkgs-mesa,
}:

let
  system = stdenv.hostPlatform.system;
  mesaTurnip = nixpkgs-mesa.legacyPackages.${system}.mesa;
  cpuName = stdenv.hostPlatform.parsed.cpu.name;
  vulkanIcd = "${mesaTurnip}/share/vulkan/icd.d/freedreno_icd.${cpuName}.json";
in
symlinkJoin {
  name = "ryubing-korri-${ryubing.version}";
  # Keep `pname = "ryubing"` so package-presence checks (e.g. the SM8550
  # config check's hasPackagePname) treat the wrapper as the Switch
  # emulator it is; the -korri name carries the downstream distinction.
  pname = "ryubing";
  version = ryubing.version;
  paths = [ ryubing ];
  nativeBuildInputs = [ makeWrapper ];
  postBuild = ''
    rm "$out/bin/Ryujinx"
    makeWrapper ${ryubing}/bin/Ryujinx "$out/bin/Ryujinx" \
      --set VK_DRIVER_FILES ${vulkanIcd} \
      --set VK_ICD_FILENAMES ${vulkanIcd}
  '';
  passthru = (ryubing.passthru or { }) // {
    inherit ryubing mesaTurnip vulkanIcd;
    turnipPinned = true;
  };
  meta = (ryubing.meta or { }) // {
    description = "${ryubing.meta.description or "Ryubing"} (Korri: Turnip pinned to Mesa ${mesaTurnip.version})";
    mainProgram = "Ryujinx";
  };
}
