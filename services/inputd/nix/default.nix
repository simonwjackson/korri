{
  pkgs,
  system,
  inputplumberNixpkgs,
  crane,
  korriInputModule,
  korridHostModule,
  korridPackage,
}:

let
  inputplumberPkgs = import inputplumberNixpkgs { inherit system; };
  inputplumberRuntime = pkgs.callPackage ./inputplumber-package.nix {
    inputplumber = inputplumberPkgs.inputplumber;
  };
  inputplumberData = import ./inputplumber-data.nix { inherit pkgs; };
  inputplumberKorri = inputplumberData.compose { inherit inputplumberRuntime; };
  inputdPackage = import ../package.nix { inherit pkgs crane; };
in
{
  packages = {
    inputplumber-korri = inputplumberKorri;
    korri-inputd = inputdPackage;
  };
  checks = {
    inputplumber-korri-package = import ./inputplumber-package-check.nix {
      inherit pkgs inputplumberRuntime inputplumberKorri;
    };
    korri-inputd-package = pkgs.runCommand "korri-inputd-package-check" { } ''
      test -x ${inputdPackage}/bin/korri-inputd
      touch "$out"
    '';
    korri-input-module = import ./korri-input-module-check.nix {
      module = korriInputModule;
      inherit pkgs inputdPackage inputplumberKorri;
    };
    korrid-linux-host-module = import ../../korrid/nixos-module-check.nix {
      module = korridHostModule;
      inherit pkgs korridPackage;
    };
  };
}
