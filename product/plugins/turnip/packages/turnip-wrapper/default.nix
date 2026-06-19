# Generic Korri wrapper for aarch64 Adreno Vulkan applications.
#
# The repo's main nixpkgs pin may lag the Mesa Turnip driver needed by SM8550
# Vulkan workloads. This package centralizes the same Mesa >= 26
# VK_DRIVER_FILES / VK_ICD_FILENAMES injection used by the Switch emulator so
# emulator plugins can share one graphics-runtime owner instead of each
# hand-rolling a local wrapper.
{
  lib,
  stdenv,
  symlinkJoin,
  makeWrapper,
  nixpkgs-mesa,
  package,
  executable ? null,
  name ? "${package.pname or package.name}-korri-turnip",
}:

let
  system = stdenv.hostPlatform.system;
  mesaTurnip = nixpkgs-mesa.legacyPackages.${system}.mesa;
  cpuName = stdenv.hostPlatform.parsed.cpu.name;
  vulkanIcd = "${mesaTurnip}/share/vulkan/icd.d/freedreno_icd.${cpuName}.json";

  inferExecutable =
    if executable != null then
      executable
    else if (package.meta or { }) ? mainProgram then
      package.meta.mainProgram
    else if (package.pname or null) != null then
      package.pname
    else
      package.name;
in
symlinkJoin {
  inherit name;
  pname = package.pname or name;
  version = package.version or "unknown";
  paths = [ package ];
  nativeBuildInputs = [ makeWrapper ];
  postBuild = ''
    target="$out/bin/${inferExecutable}"
    if [ ! -e "$target" ]; then
      echo "korri-turnip-wrapper: expected executable missing: $target" >&2
      exit 1
    fi
    rm -f "$target"
    makeWrapper ${package}/bin/${inferExecutable} "$target" \
      --set VK_DRIVER_FILES ${vulkanIcd} \
      --set VK_ICD_FILENAMES ${vulkanIcd}
  '';
  passthru = (package.passthru or { }) // {
    inherit package mesaTurnip vulkanIcd;
    turnipPinned = true;
    unwrapped = package;
  };
  meta = (package.meta or { }) // {
    description = "${
      package.meta.description or name
    } (Korri: Turnip pinned to Mesa ${mesaTurnip.version})";
    mainProgram = inferExecutable;
  };
}
