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
  devApp = import ./dev-app.nix {
    inherit pkgs inputdPackage korridPackage;
  };
  korriBundle = import ./korri-bundle.nix {
    inherit
      pkgs
      inputdPackage
      inputplumberKorri
      korridPackage
      ;
  };
  toApp = package: {
    type = "app";
    program = "${package}/bin/${package.name}";
  };
in
{
  apps.korri-dev = toApp devApp;
  packages = {
    inputplumber-korri = inputplumberKorri;
    retroarch-inputplumber-autoconfig = retroarchInputplumberAutoconfig;
    korri-inputd = inputdPackage;
    korri-bundle = korriBundle;
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
      test -x ${inputdPackage}/bin/korri-bundle-launch
      test -x ${inputdPackage}/bin/korri-device-gate
      test "$(sha256sum ${inputdPackage}/bin/korri-device-gate | cut -d' ' -f1)" = \
        "$(sha256sum ${../deploy/device-check.sh} | cut -d' ' -f1)"
      test -x ${devApp}/bin/korri-dev
      grep -F 'KORRI_INPUTD_PROFILE=development' ${devApp}/bin/korri-dev >/dev/null
      grep -F 'KORRI_INPUTD_SOURCE="$physical_input"' ${devApp}/bin/korri-dev >/dev/null
      test "$(readlink -f ${korriBundle}/bin/inputplumber)" = ${inputplumberKorri}/bin/inputplumber
      test "$(readlink -f ${korriBundle}/bin/korri-inputd)" = ${inputdPackage}/bin/korri-inputd
      test "$(readlink -f ${korriBundle}/bin/korrid)" = ${korridPackage}/bin/korrid
      test "$(readlink -f ${korriBundle}/share/inputplumber)" = ${inputplumberKorri}/share/inputplumber
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
