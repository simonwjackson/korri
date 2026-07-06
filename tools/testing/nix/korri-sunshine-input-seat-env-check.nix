{ pkgs, daemonModulePath }:

let
  lib = pkgs.lib;
  source = builtins.readFile daemonModulePath;
  checks = [
    {
      message = "korri-sunshine receives stable input-seat runtime dir";
      assertion = lib.hasInfix "KORRI_INPUT_SEAT_RUNTIME_DIR = inputSeatRuntimeDir" source;
    }
    {
      message = "korri-sunshine receives stable input-seat mirror socket";
      assertion = lib.hasInfix "KORRI_INPUT_SEAT_MIRROR_SOCKET = inputSeatMirrorSocketPath" source;
    }
    {
      message = "korri-sunshine does not receive launch-scoped input-seat env";
      assertion = !(lib.hasInfix "KORRI_INPUT_SEAT_LAUNCH_ID" source);
    }
    {
      message = "input-seat mirror sidecar requires same Unix user";
      assertion =
        lib.hasInfix "inputSeat.user == cfg.user" source
        && lib.hasInfix "sidecar is mode 0600" source;
    }
    {
      message = "input-seat mirror socket path is derived under runtime dir";
      assertion = lib.hasInfix "inputSeatMirrorSocketPath" source && lib.hasInfix "sunshine-input-seat.sock" source;
    }
  ];
  failures = builtins.filter (candidate: !candidate.assertion) checks;
in
if failures != [ ] then
  throw "Korri Sunshine input-seat env check failed:\n${
    lib.concatMapStringsSep "\n" (failure: "- ${failure.message}") failures
  }"
else
  pkgs.runCommand "korri-sunshine-input-seat-env-check" { } ''
    touch "$out"
  ''
