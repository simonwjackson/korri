{
  pkgs,
  patchPath,
  readmePath,
  sunshinePackagePath,
  sunshinePackage,
}:

let
  lib = pkgs.lib;
  check = message: assertion: { inherit message assertion; };

  patch = builtins.readFile patchPath;
  readme = builtins.readFile readmePath;
  sunshinePackageSource = builtins.readFile sunshinePackagePath;
  contains = needle: haystack: lib.hasInfix needle haystack;

  checks = [
    (check "Sunshine input-seat mirror patch is applied by sunshine-korri" (
      contains "0015-add-korri-input-seat-event-mirror.patch" sunshinePackageSource
    ))
    (check "Sunshine input-seat mirror is gated by stable socket env and active-launch sidecar" (
      contains "KORRI_INPUT_SEAT_MIRROR_SOCKET" patch
      && contains "KORRI_INPUT_SEAT_RUNTIME_DIR" patch
      && contains "sunshine-active-launch.json" patch
      && contains "mirrorToken" patch
      && !(contains "KORRI_INPUT_SEAT_LAUNCH_ID" patch)
      && contains "input seat mirror disabled" patch
    ))
    (check "Sunshine input-seat mirror uses local Unix socket writes" (
      contains "AF_UNIX" patch
      && contains "sockaddr_un" patch
      && contains "connect(fd" patch
      && contains "send(fd" patch
      && contains "close(fd" patch
    ))
    (check "Sunshine input-seat mirror emits bounded token-envelope NDJSON" (
      contains "korri_input_seat_emit_json" patch
      && contains "KORRI_INPUT_SEAT_MAX_FRAME_BYTES" patch
      && contains "\\n" patch
      && contains "source-state" patch
      && contains "frame" patch
      && contains "mirrorToken" patch
    ))
    (check "Sunshine input-seat mirror emits launch-scoped controller lifecycle frames" (
      contains "korri_input_seat_emit_source_connected" patch
      && contains "korri_input_seat_emit_source_state" patch
      && contains "korri_input_seat_emit_source_disconnected" patch
      && contains "launchId" patch
      && contains "controllerNumber" patch
    ))
    (check "Sunshine input-seat mirror forwards only controller-domain packet data" (
      contains "leftTrigger" patch
      && contains "rightTrigger" patch
      && contains "leftStickX" patch
      && contains "leftStickY" patch
      && contains "rightStickX" patch
      && contains "rightStickY" patch
      && !(contains "passthrough(PNV_KEYBOARD_PACKET" patch)
      && !(contains "passthrough(PNV_REL_MOUSE_MOVE_PACKET" patch)
      && !(contains "passthrough(PNV_UNICODE_PACKET" patch)
    ))
    (check "Sunshine input-seat mirror write failures are local diagnostics only" (
      contains "failed to connect input seat mirror socket" patch
      && contains "failed to write input seat mirror frame" patch
      && contains "return" patch
    ))
    (check "Sunshine input-seat mirror contract is documented" (
      contains "Input-seat event mirror patch" readme
      && contains "KORRI_INPUT_SEAT_MIRROR_SOCKET" readme
      && contains "KORRI_INPUT_SEAT_RUNTIME_DIR" readme
      && contains "sunshine-active-launch.json" readme
      && contains "mirrorToken" readme
      && contains "bounded token-envelope NDJSON" readme
      && contains "Sunshine remains an event source" readme
    ))
  ];

  failures = builtins.filter (candidate: !candidate.assertion) checks;
in
if failures != [ ] then
  throw "Korri Sunshine input-seat mirror patch check failed:\n${
    lib.concatMapStringsSep "\n" (failure: "- ${failure.message}") failures
  }"
else
  pkgs.runCommand "korri-sunshine-input-seat-mirror-patch-check" { } ''
    mkdir -p "$out"

    test -x ${sunshinePackage}/bin/sunshine

    cat > "$out/summary.txt" <<'EOF'
    Korri Sunshine input-seat mirror patch invariants passed and patched Sunshine builds.
    EOF
  ''
