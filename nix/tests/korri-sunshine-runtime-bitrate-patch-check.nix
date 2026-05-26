{
  pkgs,
  patchPath,
  readmePath,
  moonlightPatchPath,
  moonlightReadmePath,
  sunshinePackage,
  moonlightPackage,
}:

let
  lib = pkgs.lib;
  check = message: assertion: { inherit message assertion; };

  patch = builtins.readFile patchPath;
  readme = builtins.readFile readmePath;
  moonlightPatch = builtins.readFile moonlightPatchPath;
  moonlightReadme = builtins.readFile moonlightReadmePath;
  contains = needle: haystack: lib.hasInfix needle haystack;

  checks = [
    (check "Sunshine runtime settings request packet is named" (
      contains "RUNTIME_SETTINGS_REQUEST_PACKET = 0x5504" patch
    ))
    (check "Sunshine runtime settings ack packet is named" (
      contains "RUNTIME_SETTINGS_ACK_PACKET = 0x5505" patch
    ))
    (check "Sunshine runtime bitrate operation is named" (
      contains "RUNTIME_SETTINGS_OPERATION_SET_BITRATE_KBPS = 1" patch
    ))
    (check "Sunshine runtime FPS operation is named" (
      contains "RUNTIME_SETTINGS_OPERATION_SET_FPS = 2" patch
    ))
    (check "Sunshine runtime capability query operation is named" (
      contains "RUNTIME_SETTINGS_OPERATION_QUERY_CAPABILITIES = 0" patch
    ))
    (check "Sunshine runtime resolution operation is named" (
      contains "RUNTIME_SETTINGS_OPERATION_SET_RESOLUTION = 3" patch
    ))
    (check "Sunshine runtime bitrate applied status is named" (
      contains "RUNTIME_SETTINGS_STATUS_APPLIED = 0" patch
    ))
    (check "Sunshine runtime bitrate failed status is named" (
      contains "RUNTIME_SETTINGS_STATUS_FAILED = 1" patch
    ))
    (check "Sunshine runtime bitrate invalid status is named" (
      contains "RUNTIME_SETTINGS_STATUS_INVALID = 2" patch
    ))
    (check "Sunshine runtime bitrate disabled status is named" (
      contains "RUNTIME_SETTINGS_STATUS_DISABLED = 3" patch
    ))
    (check "Sunshine runtime settings reason codes are named" (
      contains "RUNTIME_SETTINGS_REASON_NONE = 0" patch
      && contains "RUNTIME_SETTINGS_REASON_GATE_DISABLED" patch
      && contains "RUNTIME_SETTINGS_REASON_INVALID_BOUNDS" patch
      && contains "RUNTIME_SETTINGS_REASON_INVALID_PAYLOAD" patch
      && contains "RUNTIME_SETTINGS_REASON_UNSUPPORTED_ENCODER" patch
      && contains "RUNTIME_SETTINGS_REASON_UNSUPPORTED_BACKEND" patch
      && contains "RUNTIME_SETTINGS_REASON_UNSUPPORTED_OPERATION" patch
      && contains "RUNTIME_SETTINGS_REASON_APPLY_FAILED" patch
      && contains "RUNTIME_SETTINGS_REASON_PROOF_GATED" patch
    ))
    (check "Sunshine runtime bitrate patch does not expose a logs-only pending status" (
      !(contains "RUNTIME_SETTINGS_STATUS_ACCEPTED_PENDING" patch)
      && !(contains "accepted/pending" readme)
      && !(contains "accepted=1" patch)
    ))
    (check "Sunshine runtime bitrate patch logs queued requests without implying final success" (
      contains "queued=1" patch
    ))
    (check "Sunshine runtime settings gate only enables the MVP for explicit value 1" (
      contains "SUNSHINE_LIVE_SETTINGS_MVP" patch
      && contains "std::string_view {enabled_value} == \"1\"sv" patch
    ))
    (check "Sunshine runtime settings requests and acks use mail queues" (
      contains "queue_t<video::runtime_bitrate_request_t> runtime_bitrate_events" patch
      && contains "queue_t<video::runtime_bitrate_ack_t> runtime_bitrate_ack_queue" patch
      && contains "mail->queue<runtime_bitrate_request_t>(mail::runtime_bitrate)" patch
      && contains "mail->queue<runtime_bitrate_ack_t>(mail::runtime_bitrate_ack)" patch
    ))
    (check "Sunshine runtime bitrate patch does not carry AVCodec field mutation fallback" (
      !(contains "update_runtime_bitrate" patch)
      && !(contains "avcodec runtime bitrate update" patch)
      && !(contains "AV_OPT_SEARCH_CHILDREN" patch)
    ))
    (check "Sunshine runtime bitrate patch gates support to h264_vaapi" (
      contains "runtime_bitrate_supports_encoder_restart" patch
      && contains "encoder.name == \"vaapi\"sv" patch
      && contains "encoder.codec_from_config(config).name == \"h264_vaapi\"" patch
      && contains "runtime bitrate unsupported encoder" patch
    ))
    (check "Sunshine runtime bitrate README documents h264_vaapi as the only supported path" (
      contains "Only `h264_vaapi` via Sunshine's AVCodec/VAAPI path is currently supported" readme
    ))
    (check "Sunshine runtime settings patch documents FPS as experimental frame pacing" (
      contains "Supports operation `2`: set effective stream FPS" readme
      && contains "runtime FPS" patch
      && contains "applied_fps" patch
      && contains "runtime_fps_interval" patch
    ))
    (check "Sunshine runtime FPS rejects impossible upshifts before queueing" (
      contains "operation == video::RUNTIME_SETTINGS_OPERATION_SET_FPS && requested_value >" patch
      && contains "rejection_status = video::RUNTIME_SETTINGS_STATUS_INVALID" patch
    ))
    (check "Sunshine runtime FPS unsupported encoders fail with current applied FPS" (
      contains "live-settings-mvp: runtime FPS unsupported" patch
      && contains "RUNTIME_SETTINGS_STATUS_FAILED" patch
      && contains "runtime_bitrate_ack_t {request->request_id, RUNTIME_SETTINGS_OPERATION_SET_FPS, status, reason, applied_fps}" patch
    ))
    (check "Sunshine runtime capability acks expose active-session support facts" (
      contains "control_runtime_settings_capability_ack_t" patch
      && contains "supported_operations" patch
      && contains "min_bitrate_kbps" patch
      && contains "max_fps" patch
      && contains "current_bitrate_kbps" patch
      && contains "current_width" patch
      && contains "current_height" patch
    ))
    (check "Sunshine runtime settings acks carry additive reason fields" (
      contains "boost::endian::little_uint16_at reason" patch
      && contains "ack.reason" patch
      && contains "reason=" patch
    ))
    (check "Sunshine runtime resolution uses explicit width and height payloads" (
      contains "control_runtime_settings_request_prefix_t" patch
      && contains "boost::endian::little_uint32_at width" patch
      && contains "boost::endian::little_uint32_at height" patch
      && contains "applied_width" patch
      && contains "applied_height" patch
    ))
    (check "Sunshine runtime resolution validates bounds before queueing" (
      contains "RUNTIME_SETTINGS_OPERATION_SET_RESOLUTION" patch
      && contains "requested_width" patch
      && contains "requested_height" patch
      && contains "RUNTIME_SETTINGS_STATUS_INVALID" patch
      && contains "std::uint64_t" patch
    ))
    (check "Sunshine runtime resolution tracks applied dimensions for later acks" (
      contains "runtime_settings_applied_width" patch
      && contains "runtime_settings_applied_height" patch
      && contains "session->control.runtime_settings_applied_width = (std::uint32_t) session->config.monitor.width" patch
      && contains "auto current_applied_width = session->control.runtime_settings_applied_width" patch
      && contains "ack.status == video::RUNTIME_SETTINGS_STATUS_APPLIED" patch
    ))
    (check "Sunshine runtime resolution refreshes touch mapping only after apply" (
      contains "runtime resolution" patch
      && contains "touch_port" patch
      && contains "make_port" patch
      && contains "applied_width" patch
      && contains "applied_height" patch
    ))
    (check "Moonlight runtime settings sender can request FPS" (
      contains "MOONLIGHT_SEND_RUNTIME_SETTINGS_MVP_FPS" moonlightPatch
      && contains "MOONLIGHT_SEND_RUNTIME_SETTINGS_MVP_FPS" moonlightReadme
      && contains "operation=2" moonlightPatch
    ))
    (check "Moonlight runtime settings sender can request resolution" (
      contains "MOONLIGHT_SEND_RUNTIME_SETTINGS_MVP_RESOLUTION" moonlightPatch
      && contains "MOONLIGHT_SEND_RUNTIME_SETTINGS_MVP_RESOLUTION" moonlightReadme
      && contains "operation=3" moonlightPatch
      && contains "applied_width" moonlightPatch
      && contains "applied_height" moonlightPatch
    ))
    (check "Moonlight one-shot runtime settings sender refuses ambiguous bitrate FPS or resolution input" (
      contains "set only one runtime settings value: bitrate, fps, or resolution" moonlightPatch
    ))
    (check "Moonlight runtime settings adaptation can react to connection status" (
      contains "MOONLIGHT_RUNTIME_SETTINGS_MVP_POOR_KBPS" moonlightPatch
      && contains "MOONLIGHT_RUNTIME_SETTINGS_MVP_POOR_FPS" moonlightPatch
      && contains "MOONLIGHT_RUNTIME_SETTINGS_MVP_OKAY_KBPS" moonlightPatch
      && contains "MOONLIGHT_RUNTIME_SETTINGS_MVP_OKAY_FPS" moonlightPatch
      && contains "runtime_settings_mvp_connection_status_update" moonlightPatch
      && contains "connectionStatusUpdate = runtime_settings_mvp_connection_status_update" moonlightPatch
    ))
    (check "Moonlight runtime settings adaptation does not send resolution" (
      !(contains "MOONLIGHT_RUNTIME_SETTINGS_MVP_POOR_RESOLUTION" moonlightPatch)
      && !(contains "MOONLIGHT_RUNTIME_SETTINGS_MVP_OKAY_RESOLUTION" moonlightPatch)
    ))
    (check "Runtime settings READMEs document operation 0 as a non-mutating capability query" (
      contains "Operation `0` is a non-mutating capability query" readme
      && contains "Operation `0` is a non-mutating capability query" moonlightReadme
    ))
    (check "Runtime settings READMEs document policy-free mechanism ownership" (
      contains "Moonlight and Sunshine expose mechanisms and facts only; Korri owns adaptation policy" readme
      && contains "Moonlight and Sunshine expose mechanisms and facts only; Korri owns adaptation policy" moonlightReadme
    ))
    (check "Runtime settings READMEs document local readiness host capability and client proof as separate facts" (
      contains "local Moonlight command readiness, host Sunshine runtime-settings capability, and target-client proof" readme
      && contains "local Moonlight command readiness, host Sunshine runtime-settings capability, and target-client proof" moonlightReadme
    ))
    (check "Runtime settings READMEs document the canonical reason-code vocabulary" (
      contains "Reason codes:" readme
      && contains "`gate-disabled`" readme
      && contains "`invalid-bounds`" readme
      && contains "`invalid-payload`" readme
      && contains "`unsupported-encoder`" readme
      && contains "`unsupported-backend`" readme
      && contains "`unsupported-operation`" readme
      && contains "`apply-failed`" readme
      && contains "`control-not-ready`" readme
      && contains "`no-ack`" readme
      && contains "`conflict`" readme
      && contains "`stale-ack`" readme
      && contains "`stream-ended`" readme
      && contains "`proof-gated`" readme
      && contains "Reason codes:" moonlightReadme
      && contains "`gate-disabled`" moonlightReadme
      && contains "`invalid-bounds`" moonlightReadme
      && contains "`invalid-payload`" moonlightReadme
      && contains "`unsupported-encoder`" moonlightReadme
      && contains "`unsupported-backend`" moonlightReadme
      && contains "`unsupported-operation`" moonlightReadme
      && contains "`apply-failed`" moonlightReadme
      && contains "`control-not-ready`" moonlightReadme
      && contains "`no-ack`" moonlightReadme
      && contains "`conflict`" moonlightReadme
      && contains "`stale-ack`" moonlightReadme
      && contains "`stream-ended`" moonlightReadme
      && contains "`proof-gated`" moonlightReadme
    ))
    (check "Moonlight runtime settings README marks connection-status adaptation spike-only" (
      contains "connection-status adaptation is spike-only" moonlightReadme
    ))
    (check "Sunshine runtime bitrate README documents the status contract" (
      contains "Runtime settings status contract" readme
      && contains "`0` — applied" readme
      && contains "`1` — failed or unsupported" readme
      && contains "`2` — invalid" readme
      && contains "`3` — disabled" readme
    ))
  ];

  failures = builtins.filter (candidate: !candidate.assertion) checks;
in
if failures != [ ] then
  throw "Korri Sunshine runtime bitrate patch check failed:\n${
    lib.concatMapStringsSep "\n" (failure: "- ${failure.message}") failures
  }"
else
  pkgs.runCommand "korri-sunshine-runtime-bitrate-patch-check" { } ''
    mkdir -p "$out"

    test -x ${sunshinePackage}/bin/sunshine
    test -x ${moonlightPackage}/bin/moonlight
    test -f ${moonlightPackage}/nix-support/moonlight-embedded-korri/manifest.txt

    cat > "$out/summary.txt" <<'EOF'
    Korri Sunshine runtime bitrate patch invariants passed and patched packages built.
    EOF
  ''
