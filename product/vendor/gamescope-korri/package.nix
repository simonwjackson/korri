{
  lib,
  gamescope,
}:

gamescope.overrideAttrs (oldAttrs: {
  pname = "gamescope-korri";
  version = "${oldAttrs.version or gamescope.version}-korri";
  __intentionallyOverridingVersion = true;

  patches = (oldAttrs.patches or [ ]) ++ [
    # Allow gamescope to use render-only Vulkan devices (e.g. PanVK on
    # Mali-G52, where the GPU lives on renderD128 only and the display
    # primary node belongs to rockchip-drm). Required for RG353M /
    # RK3566 handhelds; harmless on Adreno / Steam-Deck-class hardware
    # where hasPrimary is already true.
    ./patches/0001-rendervulkan-allow-render-only-vulkan-device.patch
    # Allow forcing implicit dmabuf-fence sync (GAMESCOPE_DISABLE_EXPLICIT_SYNC)
    # on render-only Vulkan ICDs whose drm_syncobj timelines don't signal
    # (PanVK on Mali-G52); prevents the nested-present deadlock.
    ./patches/0002-waylandbackend-optional-explicit-sync.patch
    # Make the precompile-all-shaders thread optional
    # (GAMESCOPE_DISABLE_PIPELINE_PRECOMPILE). PanVK's Bifrost-v7 compiler
    # is slow enough that precompiling every permutation freezes the first
    # frames for minutes; on-demand compile + disk cache is fast.
    ./patches/0003-rendervulkan-optional-pipeline-precompile.patch
  ];

  postInstall = (oldAttrs.postInstall or "") + ''
    mkdir -p "$out/nix-support/gamescope-korri"
    {
      printf '%s\n' 'pname=gamescope-korri'
      printf '%s\n' 'version=${oldAttrs.version or gamescope.version}-korri'
      printf '%s\n' 'upstream-version=${oldAttrs.version or gamescope.version}'
      printf '%s\n' 'korri-patches=0001-rendervulkan-allow-render-only-vulkan-device 0002-waylandbackend-optional-explicit-sync 0003-rendervulkan-optional-pipeline-precompile'
      printf '%s\n' 'control-api=korri-gamescope-control-bridge-v1'
      printf '%s\n' 'control-backend=x11-root-atoms'
      printf '%s\n' 'unsupported-controls=structured-command-result'
      printf '%s\n' 'events=bridge-command-result'
      printf '%s\n' 'x-atoms=GAMESCOPE_XWAYLAND_MODE_CONTROL GAMESCOPE_SCALING_FILTER GAMESCOPE_SHARPNESS GAMESCOPE_FSR_FEEDBACK'
    } > "$out/nix-support/gamescope-korri/manifest.txt"
  '';

  meta = (oldAttrs.meta or { }) // {
    description = "Korri Gamescope package lane for runtime control patches";
    maintainers = (oldAttrs.meta.maintainers or [ ]) ++ [ ];
    mainProgram = (oldAttrs.meta.mainProgram or "gamescope");
  };
})
