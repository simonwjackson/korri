{
  pkgs,
  patchPath ? null,
  patchPaths ? [ patchPath ],
  absoluteTouchPatchPath,
  readmePath,
  moonlightPackage,
}:

let
  lib = pkgs.lib;
  check = message: assertion: { inherit message assertion; };

  patch = lib.concatStringsSep "\n" (map builtins.readFile patchPaths);
  absoluteTouchPatch = builtins.readFile absoluteTouchPatchPath;
  readme = builtins.readFile readmePath;
  contains = needle: haystack: lib.hasInfix needle haystack;

  checks = [
    (check "Moonlight absolute touch patch is documented" (contains "Adds `-absolutetouch`" readme))
    (check "Moonlight absolute touch CLI flag is registered and shown in help" (
      contains "{\"absolutetouch\", no_argument, NULL" absoluteTouchPatch
      && contains "-absolutetouch" absoluteTouchPatch
    ))
    (check "Moonlight absolute touch setting persists through config" (
      contains "absolute_touch" absoluteTouchPatch
      && contains "write_config_bool(fd, \"absolutetouch\"" absoluteTouchPatch
    ))
    (check "Moonlight absolute touch sends absolute pointer coordinates on touchscreen input" (
      contains "absoluteTouchEnabled" absoluteTouchPatch
      && contains "send_touch_position(dev, dev->touchX, dev->touchY)" absoluteTouchPatch
      && contains "send_touch_position(dev, dev->touchDownX, dev->touchDownY)" absoluteTouchPatch
    ))
    (check "Moonlight absolute touch preserves upstream relative touch behavior by default" (
      contains "Default is off" absoluteTouchPatch
      && contains "preserving the upstream trackpad behavior" absoluteTouchPatch
    ))
    (check "Moonlight local control protocol is named generically" (
      contains "moonlight.local-control" patch
      && contains "Moonlight local control protocol" readme
      && !(contains "korri.local-control" patch)
    ))
    (check "Moonlight local control protocol uses filesystem AF_UNIX sockets" (
      contains "AF_UNIX" patch
      && contains "SOCK_STREAM | SOCK_CLOEXEC" patch
      && contains "struct sockaddr_un" patch
      && !(contains "AF_INET" patch)
      && !(contains "SOCK_DGRAM" patch)
    ))
    (check "Moonlight local control protocol requires launcher runtime dir ownership checks" (
      contains "MOONLIGHT_LOCAL_CONTROL_RUNTIME_DIR" patch
      && contains "MOONLIGHT_LOCAL_CONTROL_SOCKET" patch
      && contains "st.st_uid != getuid()" patch
      && contains "st.st_mode & 0022" patch
      && contains "strncmp(runtime_dir, socket_path" patch
    ))
    (check "Moonlight local control protocol cleans only safe stale sockets" (
      contains "lstat(socket_path" patch
      && contains "S_ISSOCK" patch
      && contains "stale socket owner mismatch" patch
      && contains "unlink(socket_path)" patch
    ))
    (check "Moonlight local control protocol rejects unauthorized peers before reading frames" (
      contains "SO_PEERCRED" patch
      && contains "moonlight_local_control_peer_authorized(client_fd)" patch
      && contains "MOONLIGHT_LOCAL_CONTROL_ALLOW_ROOT" patch
    ))
    (check "Moonlight local control protocol bounds frames and clients" (
      contains "MOONLIGHT_CONTROL_MAX_FRAME_BYTES 65536" patch
      && contains "MOONLIGHT_CONTROL_MAX_CLIENTS 4" patch
      && contains "oversized frame" patch
      && contains "used == 0" patch
    ))
    (check "Moonlight local control protocol uses json-c instead of hand-rolled JSON parsing" (
      contains "json-c/json.h" patch
      && contains "json_tokener_parse_ex" patch
      && contains "pkg_check_modules(JSONC REQUIRED json-c)" patch
    ))
    (check "Moonlight local control protocol serves hello state and subscribe methods" (
      contains "protocol.hello" patch
      && contains "state.get" patch
      && contains "events.subscribe" patch
      && contains "state.snapshot" patch
      && contains "moonlight.event" patch
    ))
    (check "Moonlight local control runtime commands have paired capability and dispatch markers" (
      contains "MOONLIGHT_LC_COMMAND_RUNTIME_SET_BITRATE" patch
      && contains "MOONLIGHT_LC_COMMAND_RUNTIME_SET_FPS" patch
      && contains "moonlight_local_control_dispatch_runtime_command" patch
      && contains "LiSendSunshineRuntimeSettingsMvp(command_id, operation" patch
    ))
    (check "Moonlight local control returns native command ids separately from JSON-RPC envelope ids" (
      contains "moonlight_local_control_next_command_id" patch
      && contains "command.accepted" patch
      && contains "json_object_object_add(accepted, \"requestId\", json_object_new_int64((int64_t) command_id))" patch
    ))
    (check "Moonlight local control emits terminal runtime command result events" (
      contains "runtime.commandResult" patch
      && contains "moonlight_local_control_emit_runtime_command_result" patch
      && contains "MOONLIGHT_LC_EMIT_OUTSIDE_RUNTIME_SETTINGS_MUTEX" patch
      && !(contains "runtime.commandResult\", \"accepted" patch)
    ))
    (check "Moonlight runtime settings observer registration is safe before control stream mutex init" (
      contains "runtime_settings_mvp_observer setter intentionally lock-free" patch
      && contains "runtime_settings_mvp_observer = observer" patch
      && contains "runtime_settings_mvp_observer_context = context" patch
    ))
    (check "Moonlight local control uses bounded subscriber and event history markers" (
      contains "MOONLIGHT_CONTROL_EVENT_HISTORY" patch
      && contains "moonlight_local_control_subscriber" patch
      && contains "moonlight_local_control_event_history" patch
      && contains "moonlight_local_control_evict_slow_subscriber" patch
    ))
    (check "Moonlight local control populates monotonic event timestamps" (
      contains "moonlight_local_control_monotonic_ms" patch
      && contains "json_object_object_add(params, \"monotonicMs\", json_object_new_int64((int64_t) moonlight_local_control_monotonic_ms()))" patch
    ))
    (check "Moonlight local control protocol advertises observer/controller authority separately" (
      contains "MOONLIGHT_LOCAL_CONTROL_AUTHORITY" patch
      && contains "observer" patch
      && contains "controller" patch
      && contains "capabilities" patch
    ))
    (check "Moonlight local control protocol documents local-only non-remote scope" (
      contains "Linux-only local IPC" readme
      && contains "LAN, HTTP, mDNS, Tailscale, browser-facing APIs" readme
    ))
  ];

  failures = builtins.filter (candidate: !candidate.assertion) checks;
in
if failures != [ ] then
  throw "Korri Moonlight local control protocol patch check failed:\n${
    lib.concatMapStringsSep "\n" (failure: "- ${failure.message}") failures
  }"
else
  pkgs.runCommand "korri-moonlight-control-protocol-patch-check" { } ''
    mkdir -p "$out"

    test -x ${moonlightPackage}/bin/moonlight
    test -f ${moonlightPackage}/nix-support/moonlight-embedded-korri/manifest.txt

    cat > "$out/summary.txt" <<'EOF'
    Korri Moonlight local control protocol patch invariants passed and patched package built.
    EOF
  ''
