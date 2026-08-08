{
  pkgs,
  system,
  inputplumberNixpkgs,
  crane,
  korriInputModule,
  korridLinuxDeviceModule,
  korridPackage,
}:

let
  inputplumberPkgs = import inputplumberNixpkgs { inherit system; };
  inputplumberRuntime = pkgs.callPackage ./inputplumber-package.nix {
    inputplumber = inputplumberPkgs.inputplumber;
  };
  inputplumberData = import ./inputplumber-data.nix { inherit pkgs; };
  inputplumberKorri = inputplumberData.compose { inherit inputplumberRuntime; };
  retroarchInputplumberAutoconfig = pkgs.callPackage ./retroarch-inputplumber-autoconfig.nix { };
  inputdPackage = import ../package.nix { inherit pkgs crane; };
in
{
  packages = {
    inputplumber-korri = inputplumberKorri;
    retroarch-inputplumber-autoconfig = retroarchInputplumberAutoconfig;
    korri-inputd = inputdPackage;
  };
  checks = {
    inputplumber-korri-package = import ./inputplumber-package-check.nix {
      inherit
        pkgs
        inputplumberRuntime
        inputplumberKorri
        retroarchInputplumberAutoconfig
        ;
    };
    korri-inputd-package = pkgs.runCommand "korri-inputd-package-check" { } ''
      test -x ${inputdPackage}/bin/korri-inputd
      test -x ${inputdPackage}/bin/korri-device-gate
      test "$(sha256sum ${inputdPackage}/bin/korri-device-gate | cut -d' ' -f1)" = \
        "$(sha256sum ${../deploy/device-check.sh} | cut -d' ' -f1)"
      touch "$out"
    '';
    korri-input-module = import ./korri-input-module-check.nix {
      module = korriInputModule;
      inherit pkgs inputdPackage inputplumberKorri;
    };
    korrid-linux-device-module = import ../../korrid/nixos-module-check.nix {
      module = korridLinuxDeviceModule;
      inherit pkgs korridPackage;
    };
  };
}
