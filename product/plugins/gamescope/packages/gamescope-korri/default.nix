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
    # Allow forcing implicit dmabuf-fence sync (GAMESCOPE_DISABLE_EXPLICIT_SYNC).
    # REQUIRED for nested gamescope to present at all on Mali-G52: PanVK's
    # drm_syncobj timelines don't signal, so with explicit sync on the host
    # discards every frame and the game never gets its buffer released.
    ./patches/0002-waylandbackend-optional-explicit-sync.patch
    # Make the precompile-all-shaders thread optional
    # (GAMESCOPE_DISABLE_PIPELINE_PRECOMPILE). PanVK's Bifrost-v7 compiler
    # is slow enough that precompiling every permutation freezes the first
    # frames for minutes; on-demand compile + disk cache is fast.
    ./patches/0003-rendervulkan-optional-pipeline-precompile.patch
    # Forward wl_touch input from the host compositor to nested clients.
    # Upstream's nested Wayland backend never binds wl_seat.get_touch, so
    # touchscreen events die at the gamescope surface (upstream #1606).
    # Required for touch to reach Steam and games inside nested gamescope
    # on Korri kiosks; --default-touch-mode semantics apply via wlserver.
    ./patches/0004-waylandbackend-forward-wl-touch-input.patch
    # Guard non-positive wp_viewport source/destination extents. gamescope's
    # nested Wayland backend otherwise sends a zero/negative viewport (from an
    # off-output or zero-size frame via ClipPlane) to the host compositor,
    # which rejects it as a fatal bad_value protocol error and drops the
    # connection -> the backend input thread abort()s (status 134), tearing
    # down Steam/Moonlight and the game. Upstream ValveSoftware/gamescope#1456;
    # unfixed through 3.16.25.
    ./patches/0005-waylandbackend-guard-viewport-dimensions.patch
  ];

  postInstall = (oldAttrs.postInstall or "") + ''
    mkdir -p "$out/nix-support/gamescope-korri"
    {
      printf '%s\n' 'pname=gamescope-korri'
      printf '%s\n' 'version=${oldAttrs.version or gamescope.version}-korri'
      printf '%s\n' 'upstream-version=${oldAttrs.version or gamescope.version}'
      printf '%s\n' 'korri-patches=0001-rendervulkan-allow-render-only-vulkan-device 0002-waylandbackend-optional-explicit-sync 0003-rendervulkan-optional-pipeline-precompile 0004-waylandbackend-forward-wl-touch-input 0005-waylandbackend-guard-viewport-dimensions'
      printf '%s\n' 'launch-option-source=gamescope-3.16.23 src/main.cpp src/backend.h'
      printf '%s\n' 'launch-extra-args=gamescope.extraArgs appended-before-child-separator'
      printf '%s\n' 'control-api=korri-gamescope-control-bridge-v1'
      printf '%s\n' 'control-backend=x11-root-atoms'
      printf '%s\n' 'control-filter-values=linear nearest integer fsr nis'
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
