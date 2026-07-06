{
  pkgs,
  patchPath ? null,
  patchPaths ? [ patchPath ],
  healthPatchPath ? null,
  absoluteTouchPatchPath,
  readmePath,
  moonlightPackage,
}:

let
  lib = pkgs.lib;
  check = message: assertion: { inherit message assertion; };

  patch = lib.concatStringsSep "\n" (map builtins.readFile patchPaths);
  healthPatch = if healthPatchPath == null then "" else builtins.readFile healthPatchPath;
  absoluteTouchPatch = builtins.readFile absoluteTouchPatchPath;
  readme = builtins.readFile readmePath;
  contains = needle: haystack: lib.hasInfix needle haystack;

  checks = [
    (check "Moonlight absolute touch patch is documented" (contains "Adds `-absolutetouch`" readme))
    (check "Moonlight absolute touch CLI flag is registered and shown in help" (
      contains "{\"absolutetouch\", no_argument, NULL" absoluteTouchPatch
      && contains "-absolutetouch" absoluteTouchPatch
    ))
    (check "Moonlight absolute touch can be bounded to one raw screen region" (
      contains "{\"absolutetouchbounds\", required_argument, NULL" absoluteTouchPatch
      && contains "absoluteTouchBoundsEnabled" absoluteTouchPatch
      && contains "x < absoluteTouchBoundsX" absoluteTouchPatch
      && contains "touches outside the streamed game region are ignored" readme
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
      && contains "MOONLIGHT_LC_COMMAND_RUNTIME_SET_RESOLUTION" patch
      && contains "moonlight_local_control_dispatch_runtime_command" patch
      && contains "LiSendSunshineRuntimeSettingsMvp(command_id, operation" patch
    ))
    (check "Moonlight local control coerces resolution instead of rejecting for shape" (
      contains "value &= ~1u" patch
      && contains "secondary_value &= ~1u" patch
      && !(contains "resolution out of bounds" patch)
    ))
    (check "Moonlight local control clamps bitrate and FPS instead of rejecting" (
      !(contains "bitrate out of bounds" patch)
      && !(contains "fps out of bounds" patch)
      && contains "if (value < min_bitrate) value = min_bitrate" patch
      && contains "if (value < MOONLIGHT_CONTROL_MIN_FPS) value = MOONLIGHT_CONTROL_MIN_FPS" patch
    ))
    (check "Moonlight local control advertises local input touch-bounds command" (
      contains "MOONLIGHT_CONTROL_PROTOCOL_MINOR 1" patch
      && contains "MOONLIGHT_LC_COMMAND_INPUT_SET_TOUCH_BOUNDS \"input.setTouchBounds\"" patch
      && contains "moonlight_local_control_dispatch_input_command" patch
      && contains "input.commandResult" patch
      && contains "input.command.result" patch
    ))
    (check "Moonlight local control reports touch bounds limits and state" (
      contains "MOONLIGHT_CONTROL_MAX_TOUCH_BOUNDS_X 65535" patch
      && contains "json_object_object_add(limits, \"touchBounds\"" patch
      && contains "evdev_get_absolute_touch_state(&touch_state)" patch
      && contains "json_object_object_add(input, \"absoluteTouch\"" patch
      && contains "activeBounds" patch
      && contains "absRange" patch
    ))
    (check "Moonlight absolute touch runtime bounds fail closed before dynamic bounds" (
      contains "absolutetouchrequirebounds" patch
      && contains "absolute_touch_require_bounds" patch
      && contains "touch_state.bounds_required" patch
      && contains "return;" patch
    ))
    (check "Moonlight absolute touch bounds use coherent synchronized snapshot" (
      contains "static pthread_mutex_t absoluteTouchBoundsLock" patch
      && contains "static struct evdev_absolute_touch_state absoluteTouchState" patch
      && contains "evdev_set_absolute_touch_bounds" patch
      && contains "evdev_get_absolute_touch_state" patch
      && contains "*state = absoluteTouchState" patch
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
      contains "runtime_settings_mvp_mutex_initialized" patch
      && contains "runtime_settings_mvp_observer = observer" patch
      && contains "runtime_settings_mvp_observer_context = context" patch
    ))
    (check "Moonlight local control serializes JSON writes per process" (
      contains "pthread_mutex_t write_lock" patch
      && contains "pthread_mutex_lock(&control.write_lock)" patch
      && contains "pthread_mutex_unlock(&control.write_lock)" patch
    ))
    (check "Moonlight local control uses bounded subscriber and event history markers" (
      contains "MOONLIGHT_CONTROL_EVENT_HISTORY" patch
      && contains "moonlight_local_control_subscriber" patch
      && contains "moonlight_local_control_event_history" patch
      && contains "moonlight_local_control_evict_slow_subscriber" patch
    ))
    (check "Moonlight local control snapshots applied bitrate FPS and resolution from terminal events" (
      contains "runtime_settings_mvp_notify_terminal(requestId, operation, status, reason, appliedValue, 0)" patch
      && contains "control.bitrate_kbps = (int) value" patch
      && contains "control.fps = (int) value" patch
      && contains "control.width = (int) value" patch
      && contains "control.height = (int) secondary_value" patch
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
    (check "Moonlight local control emits in-client stream health samples" (
      contains "quality.sample" healthPatch
      && contains "moonlight_local_control_maybe_emit_health_sample" healthPatch
      && contains "moonlight_local_control_health_sample_locked" healthPatch
      && contains "MOONLIGHT_CONTROL_HEALTH_SAMPLE_INTERVAL_MS 1000" healthPatch
    ))
    (check "Moonlight stream health samples use Moonlight decode and RTP facts" (
      contains "LiGetEstimatedRttInfo" healthPatch
      && contains "health_has_rtt" healthPatch
      && !(contains "(void) LiGetEstimatedRttInfo" healthPatch)
      && contains "LiGetRTPVideoStats" healthPatch
      && contains "moonlight_local_control_record_video_decode" healthPatch
      && contains "deliveredBitrateKbps" healthPatch
      && contains "firstFrameMs" healthPatch
    ))
    (check "Moonlight stream health samples stay on the local control path" (
      contains "moonlight_local_control_record_video_decode" healthPatch
      && contains "LiGetEstimatedRttInfo" healthPatch
      && contains "LiGetRTPVideoStats" healthPatch
      && contains "This stays in-client and does not spawn an" readme
    ))
    (check "Moonlight stream health sampling is documented" (
      contains "0016-add-stream-health-sampling.patch" readme
      && contains "in-client" readme
      && contains "quality.sample" readme
    ))
    (check "Moonlight local control does not add a quality-profile command" (
      !(contains "qualityProfile" patch)
      && !(contains "quality-profile" patch)
      && !(contains "runtime.setQualityProfile" patch)
      && !(contains "qualityProfile" readme)
      && !(contains "quality-profile" readme)
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
    grep -q '0016-add-stream-health-sampling.patch' ${moonlightPackage}/nix-support/moonlight-embedded-korri/manifest.txt
    grep -q 'korri-inputplumber-gamecontrollerdb=share/moonlight/korri-inputplumber-gamecontrollerdb.txt' ${moonlightPackage}/nix-support/moonlight-embedded-korri/manifest.txt

    korri_mapping=${moonlightPackage}/share/moonlight/korri-inputplumber-gamecontrollerdb.txt
    test -f "$korri_mapping"
    test -f ${moonlightPackage}/nix-support/moonlight-embedded-korri/korri-inputplumber-gamecontrollerdb-present
    grep -Fq '030000005e0400008e02000001000000,Microsoft Xbox 360,a:b0,b:b1,back:b6,dpdown:h0.4,dpleft:h0.8,dpright:h0.2,dpup:h0.1' "$korri_mapping"
    grep -Fq '030000005e040000120b000001000000,Microsoft Xbox Series S|X Controller' "$korri_mapping"
    grep -Fq 'dpup:h0.1,dpright:h0.2,dpdown:h0.4,dpleft:h0.8' "$korri_mapping"
    if grep -Fq 'dpdown:h0.1,dpleft:h0.2,dpright:h0.8,dpup:h0.4' "$korri_mapping"; then
      echo "Korri InputPlumber Moonlight mapping still contains inverted Xbox 360 D-pad" >&2
      exit 1
    fi

    cat > "$out/summary.txt" <<'EOF'
    Korri Moonlight local control protocol patch invariants passed and patched package built.
    EOF
  ''
