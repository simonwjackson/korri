{ pkgs }:
{
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
