{
  lib,
  gamescope,
}:

gamescope.overrideAttrs (oldAttrs: {
  pname = "gamescope-korri";
  version = "${oldAttrs.version or gamescope.version}-korri";
  __intentionallyOverridingVersion = true;

  patches = (oldAttrs.patches or [ ]) ++ [ ];

  postInstall = (oldAttrs.postInstall or "") + ''
    mkdir -p "$out/nix-support/gamescope-korri"
    {
      printf '%s\n' 'pname=gamescope-korri'
      printf '%s\n' 'version=${oldAttrs.version or gamescope.version}-korri'
      printf '%s\n' 'upstream-version=${oldAttrs.version or gamescope.version}'
      printf '%s\n' 'korri-patches='
      printf '%s\n' 'control-backend=x11-root-atoms'
      printf '%s\n' 'x-atoms=GAMESCOPE_XWAYLAND_MODE_CONTROL GAMESCOPE_SCALING_FILTER GAMESCOPE_SHARPNESS GAMESCOPE_FSR_FEEDBACK'
    } > "$out/nix-support/gamescope-korri/manifest.txt"
  '';

  meta = (oldAttrs.meta or { }) // {
    description = "Korri Gamescope package lane for runtime control patches";
    maintainers = (oldAttrs.meta.maintainers or [ ]) ++ [ ];
    mainProgram = (oldAttrs.meta.mainProgram or "gamescope");
  };
})
