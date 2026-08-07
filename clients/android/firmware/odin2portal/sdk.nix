{ pkgs }:
{
  markerRuntimeInputs = [
    pkgs.android-tools
    pkgs.coreutils
    pkgs.diffutils
    pkgs.e2fsprogs
    pkgs.gawk
    pkgs.gnugrep
  ];

  rollbackRuntimeInputs = [
    pkgs.coreutils
    pkgs.diffutils
    pkgs.findutils
    pkgs.gnugrep
  ];

  runtimeInputs = [
    pkgs.android-tools
    pkgs.coreutils
    pkgs.diffutils
    pkgs.e2fsprogs
    pkgs.findutils
    pkgs.gnugrep
    pkgs.gnused
  ];
}
