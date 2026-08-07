{
  pkgs,
  system,
  inputplumberNixpkgs,
}:

let
  inputplumberPkgs = import inputplumberNixpkgs { inherit system; };
  inputplumberRuntime = pkgs.callPackage ./inputplumber-package.nix {
    inputplumber = inputplumberPkgs.inputplumber;
  };
  inputplumberData = import ./inputplumber-data.nix { inherit pkgs; };
  inputplumberKorri = inputplumberData.compose { inherit inputplumberRuntime; };
in
{
  packages.inputplumber-korri = inputplumberKorri;
  checks.inputplumber-korri-package = import ./inputplumber-package-check.nix {
    inherit pkgs inputplumberRuntime inputplumberKorri;
  };
}
