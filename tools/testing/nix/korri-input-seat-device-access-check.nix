{ pkgs, korri }:

let
  lib = pkgs.lib;
  system = pkgs.stdenv.hostPlatform.system;
  evalConfig = import "${pkgs.path}/nixos/lib/eval-config.nix";
  inputModule = import ../../../product/systems/nixos/modules/korri-input.nix { inherit korri; };

  evalInputSeatConfig = inputSeat: evalConfig {
    inherit system;
    modules = [
      ../../../product/systems/nixos/modules/korri-runtime.nix
      inputModule
      {
        services.korri.runtime = {
          user = "korri";
          group = "korri";
          createUser = true;
        };
        services.korri.input.inputSeat = inputSeat;
      }
    ];
  };

  dedicated = evalInputSeatConfig {
    enable = true;
    group = "uinput";
  };

  broadDenied = evalInputSeatConfig {
    enable = true;
    group = "input";
  };

  broadAllowed = evalInputSeatConfig {
    enable = true;
    group = "input";
    allowBroadInputGroup = true;
  };

  failingAssertions = cfg: builtins.filter (assertion: !assertion.assertion) cfg.config.assertions;
  inputSeatFailures = cfg:
    builtins.filter (assertion: lib.hasInfix "services.korri.input.inputSeat" assertion.message) (failingAssertions cfg);
  hasBroadGroupFailure = cfg:
    builtins.any (
      assertion:
      lib.hasInfix "services.korri.input.inputSeat.group = \"input\"" assertion.message
    ) (inputSeatFailures cfg);
in
pkgs.runCommand "korri-input-seat-device-access-check" { } ''
  set -eu

  ${lib.optionalString (inputSeatFailures dedicated != [ ]) ''
    echo "dedicated uinput group unexpectedly failed input-seat assertions:" >&2
    ${lib.concatMapStringsSep "\n" (assertion: ''echo ${lib.escapeShellArg assertion.message} >&2'') (inputSeatFailures dedicated)}
    exit 1
  ''}

  ${lib.optionalString (!(builtins.elem "uinput" (dedicated.config.users.users.korri.extraGroups or [ ]))) ''
    echo "dedicated uinput group was not added to korri user" >&2
    exit 1
  ''}

  ${lib.optionalString (!(lib.hasInfix ''KERNEL=="uinput", GROUP="uinput", MODE="0660", OPTIONS+="static_node=uinput"'' (dedicated.config.services.udev.extraRules or ""))) ''
    echo "dedicated uinput udev rule missing" >&2
    exit 1
  ''}

  ${lib.optionalString (!hasBroadGroupFailure broadDenied) ''
    echo "broad input-group configuration did not fail assertion" >&2
    exit 1
  ''}

  ${lib.optionalString (inputSeatFailures broadAllowed != [ ]) ''
    echo "explicitly acknowledged broad input-group configuration failed input-seat assertions" >&2
    exit 1
  ''}

  touch "$out"
''
