{
  pkgs,
  patchPath ? null,
  patchPaths ? [ patchPath ],
  readmePath,
  sunshinePackagePath,
  moonlightPatchPath ? null,
  moonlightPatchPaths ? [ moonlightPatchPath ],
  moonlightReadmePath,
  sunshinePackage,
  moonlightPackage,
}:

let
  lib = pkgs.lib;
  check = message: assertion: { inherit message assertion; };

  patch = lib.concatStringsSep "\n" (map builtins.readFile patchPaths);
  readme = builtins.readFile readmePath;
  sunshinePackageSource = builtins.readFile sunshinePackagePath;
  moonlightPatch = lib.concatStringsSep "\n" (map builtins.readFile moonlightPatchPaths);
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
    (check "Sunshine package no longer applies obsolete runtime-resolution diagnostics" (
      !(contains "0006-diagnose-vaapi-convert-sequence.patch" sunshinePackageSource)
      && !(contains "0007-finish-vaapi-gl-convert-before-encode.patch" sunshinePackageSource)
      && !(contains "0009-diagnose-avcodec-packet-content-after-resolution.patch" sunshinePackageSource)
      && !(contains "0011-force-vaapi-vram-source-copy-before-convert.patch" sunshinePackageSource)
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
    (check "Sunshine runtime bitrate patch applies via seamless VAAPI mutation only" (
      contains "runtime_update_h264_vaapi_bitrate" patch
      && contains "VAAPI runtime bitrate params updated without encoder restart" patch
      && contains "seamless_vaapi=1" patch
      && contains "request_idr_frame" patch
      && !(contains "encoder restarted for runtime bitrate" patch)
      && !(contains "disp->dummy_img(dummy_img.get())" patch)
    ))
    (check "Sunshine runtime FPS patch gates support to h264_vaapi" (
      contains "runtime_settings_supports_vaapi_h264" patch
      && contains "encoder.name == \"vaapi\"sv" patch
      && contains "encoder.codec_from_config(config).name == \"h264_vaapi\"" patch
      && contains "runtime FPS unsupported" patch
    ))
    (check "Sunshine runtime bitrate README documents seamless VAAPI support" (
      contains "Active-stream bitrate changes are advertised only for the seamless `h264_vaapi` VAAPI path" readme
      && contains "same-session moving-video and bandwidth proof" readme
    ))
    (check "Sunshine runtime settings patch documents FPS as experimental frame pacing" (
      contains "supports operation `2`: set effective stream FPS" readme
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
      && contains "runtime_bitrate_ack_t {request->request_id, RUNTIME_SETTINGS_OPERATION_SET_FPS, status, applied_fps, 0, 0, reason}" patch
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
    (check "Sunshine runtime capability support is gated by per-session active encoder facts" (
      contains "MAIL(runtime_settings_supports_encoder_restart)" patch
      && contains "session->control.runtime_settings_supports_encoder_restart" patch
      && contains "session->control.runtime_settings_encoder_restart_supported" patch
      && contains "runtime_settings_supports_encoder_restart->raise(runtime_settings_supports_vaapi_h264" patch
      && contains "auto runtime_supported = enabled && session->control.runtime_settings_encoder_restart_supported" patch
      && contains "std::uint16_t reason = enabled ? video::RUNTIME_SETTINGS_REASON_UNSUPPORTED_ENCODER" patch
    ))
    (check "Sunshine runtime capabilities advertise active-stream bitrate only for supported VAAPI sessions" (
      contains "+      supported_operations |= 1u << video::RUNTIME_SETTINGS_OPERATION_SET_BITRATE_KBPS" patch
      && contains "+    plaintext.min_bitrate_kbps = runtime_supported ? 500 : 0;" patch
      && contains "+    plaintext.max_bitrate_kbps = runtime_supported ? 150000 : 0;" patch
      && contains "supported_operations |= 1u << video::RUNTIME_SETTINGS_OPERATION_SET_FPS" patch
    ))
    (check "Sunshine runtime resolution capability remains proof-gated instead of generally advertised"
      (
        contains "proof_gated_operations" patch
        && contains "proof_gated_operations |= 1u << video::RUNTIME_SETTINGS_OPERATION_SET_RESOLUTION" patch
        && !(contains "supported_operations |= 1u << video::RUNTIME_SETTINGS_OPERATION_SET_RESOLUTION" patch)
        && contains "Runtime resolution proof gate: operation `3` is listed as proof-gated" readme
      )
    )
    (check "Moonlight runtime resolution capability parser records proof-gated operations separately" (
      contains "proofGatedOperations" moonlightPatch
      && contains "runtime_settings_mvp_settings_state.proofGatedOperations" moonlightPatch
      && contains "BbGet32(&bb, &proofGatedOperations)" moonlightPatch
      && contains "proof_gated_operations" moonlightPatch
      && contains "Runtime resolution proof gate: operation `3` is listed as proof-gated" moonlightReadme
    ))
    (check "Moonlight SDL presenter reset pumps window events after reset" (
      contains "reset_sdl_renderer_after_resolution_change(visible_w, visible_h);\n+    pump_sdl_window_events();" moonlightPatch
    ))
    (check "Runtime resolution outcomes distinguish Sunshine-applied from client-proven" (
      contains "server_applied=" patch
      && contains "client_proven=0" patch
      && contains "server_applied=" moonlightPatch
      && contains "client_proven=0" moonlightPatch
      && contains "Sunshine-applied" readme
      && contains "client-proven" readme
      && contains "Sunshine-applied" moonlightReadme
      && contains "client-proven" moonlightReadme
    ))
    (check "Sunshine runtime settings acks carry additive reason fields" (
      contains "boost::endian::little_uint16_at reason" patch
      && contains "ack.reason" patch
      && contains "reason=" patch
    ))
    (check "Sunshine runtime settings invalid payloads return invalid-payload without queueing" (
      contains "payload.size() < sizeof(control_runtime_settings_resolution_request_t)" patch
      && contains "payload.size() < sizeof(control_runtime_settings_request_t)" patch
      && contains "rejection_reason = video::RUNTIME_SETTINGS_REASON_INVALID_PAYLOAD" patch
      && contains "if (!accepted)" patch
    ))
    (check "Sunshine runtime resolution uses explicit width and height payloads" (
      contains "control_runtime_settings_request_prefix_t" patch
      && contains "boost::endian::little_uint32_at width" patch
      && contains "boost::endian::little_uint32_at height" patch
      && contains "applied_width" patch
      && contains "applied_height" patch
    ))
    (check "Sunshine runtime resolution validates conservative bounds before queueing" (
      contains "RUNTIME_SETTINGS_OPERATION_SET_RESOLUTION" patch
      && contains "requested_width" patch
      && contains "requested_height" patch
      && contains "RUNTIME_SETTINGS_STATUS_INVALID" patch
      && contains "RUNTIME_SETTINGS_REASON_INVALID_BOUNDS" patch
      && contains "requested_width > launch_width" patch
      && contains "requested_height > launch_height" patch
      && contains "!same_aspect" patch
      && contains "std::uint64_t" patch
    ))
    (check "Sunshine runtime settings track launch baselines separately from current applied values" (
      contains "runtime_settings_launch_bitrate_kbps" patch
      && contains "runtime_settings_applied_bitrate_kbps" patch
      && contains "runtime_settings_launch_fps" patch
      && contains "runtime_settings_applied_fps" patch
      && contains "runtime_settings_launch_width" patch
      && contains "runtime_settings_applied_width" patch
      && contains "runtime_settings_launch_height" patch
      && contains "runtime_settings_applied_height" patch
    ))
    (check "Sunshine runtime settings expose launch baselines in capability acks" (
      contains "launch_bitrate_kbps" patch
      && contains "launch_fps" patch
      && contains "launch_width" patch
      && contains "launch_height" patch
      && contains "plaintext.launch_bitrate_kbps = session->control.runtime_settings_launch_bitrate_kbps" patch
      && contains "plaintext.current_bitrate_kbps = session->control.runtime_settings_applied_bitrate_kbps" patch
    ))
    (check "Sunshine runtime settings update current applied values without mutating launch baselines" (
      contains "session->control.runtime_settings_applied_bitrate_kbps = ack.applied_value" patch
      && contains "session->control.runtime_settings_applied_fps = ack.applied_value" patch
      && contains "session->control.runtime_settings_applied_width = ack.applied_width" patch
      && contains "session->control.runtime_settings_applied_height = ack.applied_height" patch
      && contains "session->control.runtime_settings_launch_bitrate_kbps = (std::uint32_t) session->config.monitor.bitrate" patch
    ))
    (check "Sunshine runtime resolution preserves current applied dimensions in failure acks" (
      contains "runtime_settings_applied_width" patch
      && contains "runtime_settings_applied_height" patch
      && contains "session->control.runtime_settings_applied_width = session->control.runtime_settings_launch_width" patch
      && contains "auto current_applied_width = session->control.runtime_settings_applied_width" patch
      && contains "send_runtime_settings_ack(session, video::runtime_bitrate_ack_t {request_id, operation, rejection_status, 0, current_applied_width, current_applied_height, rejection_reason})" patch
      && contains "runtime resolution unsupported encoder" patch
      && contains "RUNTIME_SETTINGS_REASON_UNSUPPORTED_ENCODER" patch
      && contains "ack.status == video::RUNTIME_SETTINGS_STATUS_APPLIED" patch
    ))
    (check "Sunshine runtime resolution refreshes touch mapping only after apply" (
      contains "runtime resolution" patch
      && contains "touch_port" patch
      && contains "make_port" patch
      && contains "applied_width" patch
      && contains "applied_height" patch
    ))
    (check "Moonlight runtime settings sender can query Sunshine capabilities" (
      contains "SS_RUNTIME_SETTINGS_MVP_OPERATION_QUERY_CAPABILITIES 0" moonlightPatch
      && contains "runtime_settings_mvp_query_capabilities" moonlightPatch
      && contains "operation=0" moonlightPatch
      && contains "capability query" moonlightReadme
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
    (check "Moonlight runtime settings parser accepts reason-bearing and legacy acks" (
      contains "SS_RUNTIME_SETTINGS_MVP_ACK_WITH_REASON" moonlightPatch
      && contains "SS_RUNTIME_SETTINGS_MVP_REASON_NONE" moonlightPatch
      && contains "legacy no-reason runtime settings ack" moonlightPatch
      && contains "uint32_t appliedValue;\n+    uint16_t reason;" moonlightPatch
      && contains "uint32_t appliedHeight;\n+    uint16_t reason;" moonlightPatch
      && contains "BbGet32(&bb, &appliedValue);\n+                        if (hasReason)" moonlightPatch
      && contains "BbGet32(&bb, &appliedHeight);\n+                            if (hasReason)" moonlightPatch
      && contains "reason=" moonlightPatch
    ))
    (check
      "Moonlight runtime settings helper state exposes launch baselines separately from current values"
      (
        contains "SS_RUNTIME_SETTINGS_MVP_SETTINGS_STATE" moonlightPatch
        && contains "runtime_settings_mvp_settings_state" moonlightPatch
        && contains "launchBitrateKbps" moonlightPatch
        && contains "currentBitrateKbps" moonlightPatch
        && contains "launchFps" moonlightPatch
        && contains "currentFps" moonlightPatch
        && contains "launchWidth" moonlightPatch
        && contains "currentWidth" moonlightPatch
      )
    )
    (check "Moonlight runtime settings capability parser records launch baseline values" (
      contains "BbGet32(&bb, &launchBitrateKbps)" moonlightPatch
      && contains "BbGet32(&bb, &launchFps)" moonlightPatch
      && contains "BbGet32(&bb, &launchWidth)" moonlightPatch
      && contains "BbGet32(&bb, &launchHeight)" moonlightPatch
      && contains "runtime_settings_mvp_record_capability" moonlightPatch
    ))
    (check "Runtime settings restore remains explicit normal set commands only" (
      contains "Restore is explicit: callers send normal set commands back to the launch baseline values" readme
      && contains "Restore is explicit: callers send normal set commands back to the launch baseline values" moonlightReadme
      && !(contains "AUTO_RESTORE" patch)
      && !(contains "AUTO_RESTORE" moonlightPatch)
      && !(contains "RESTORE_BASELINE" patch)
      && !(contains "RESTORE_BASELINE" moonlightPatch)
    ))
    (check "Moonlight runtime settings command state rejects same-family conflicts" (
      contains "SS_RUNTIME_SETTINGS_MVP_COMMAND_STATE_IN_FLIGHT" moonlightPatch
      && contains "runtime_settings_mvp_command_state" moonlightPatch
      && contains "runtime_settings_mvp_has_inflight_family" moonlightPatch
      && contains "outcome=locally-rejected reason=conflict" moonlightPatch
    ))
    (check "Moonlight runtime settings validates advertised capabilities before sending mutations" (
      contains "runtime_settings_mvp_validate_before_send" moonlightPatch
      && contains "runtime_settings_mvp_operation_supported" moonlightPatch
      && contains "runtime_settings_mvp_operation_proof_gated" moonlightPatch
      && contains "MOONLIGHT_RUNTIME_SETTINGS_MVP_ALLOW_PROOF_GATED" moonlightPatch
      && contains "outcome=locally-rejected reason=proof-gated" moonlightPatch
      && contains "proof-gated override=manual-smoke" moonlightPatch
      && contains "else if (!supported)" moonlightPatch
      && contains "outcome=locally-rejected reason=unsupported-operation" moonlightPatch
      && contains "detail=no-capability" moonlightPatch
      && contains "outcome=locally-rejected reason=invalid-bounds" moonlightPatch
    ))
    (check "Moonlight runtime settings command state records timeout no-ack outcomes" (
      contains "SS_RUNTIME_SETTINGS_MVP_TIMEOUT_MS" moonlightPatch
      && contains "runtime_settings_mvp_check_timeouts" moonlightPatch
      && contains "outcome=timed-out reason=no-ack" moonlightPatch
    ))
    (check "Moonlight runtime settings stale acks are diagnostic and do not overwrite current state" (
      contains "outcome=stale-ack-observed reason=stale-ack" moonlightPatch
      && contains "state->state == SS_RUNTIME_SETTINGS_MVP_COMMAND_STATE_TIMED_OUT" moonlightPatch
      && contains "return false;\n+        }\n+\n+        if (state->state == SS_RUNTIME_SETTINGS_MVP_COMMAND_STATE_IN_FLIGHT)" moonlightPatch
      && contains "if (runtime_settings_mvp_record_ack(requestId, operation, status, reason))" moonlightPatch
      && contains "runtime_settings_mvp_record_current_applied" moonlightPatch
    ))
    (check "Moonlight runtime settings command and capability state is mutex-protected" (
      contains "static PLT_MUTEX runtime_settings_mvp_mutex" moonlightPatch
      && contains "PltCreateMutex(&runtime_settings_mvp_mutex)" moonlightPatch
      && contains "PltLockMutex(&runtime_settings_mvp_mutex)" moonlightPatch
      && contains "PltUnlockMutex(&runtime_settings_mvp_mutex)" moonlightPatch
      && contains "runtime_settings_mvp_check_timeouts_locked" moonlightPatch
    ))
    (check "Moonlight runtime settings records stream-ended terminal outcomes" (
      contains "runtime_settings_mvp_record_stream_ended" moonlightPatch
      && contains "outcome=stream-ended reason=stream-ended" moonlightPatch
      && contains "state->state = SS_RUNTIME_SETTINGS_MVP_COMMAND_STATE_TERMINAL" moonlightPatch
    ))
    (check "Moonlight one-shot runtime settings sender refuses ambiguous bitrate FPS or resolution input" (
      contains "set only one runtime settings value: bitrate, fps, or resolution" moonlightPatch
    ))
    (check
      "Moonlight runtime settings adaptation can react to connection status only behind spike guard"
      (
        contains "MOONLIGHT_RUNTIME_SETTINGS_MVP_POOR_KBPS" moonlightPatch
        && contains "MOONLIGHT_RUNTIME_SETTINGS_MVP_POOR_FPS" moonlightPatch
        && contains "MOONLIGHT_RUNTIME_SETTINGS_MVP_OKAY_KBPS" moonlightPatch
        && contains "MOONLIGHT_RUNTIME_SETTINGS_MVP_OKAY_FPS" moonlightPatch
        && contains "MOONLIGHT_RUNTIME_SETTINGS_MVP_ENABLE_SPIKE_ADAPTATION" moonlightPatch
        && contains "connection-status adaptation spike-only disabled" moonlightPatch
        && contains "runtime_settings_mvp_connection_status_update" moonlightPatch
        && contains "connectionStatusUpdate = runtime_settings_mvp_connection_status_update" moonlightPatch
      )
    )
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
    (check
      "Runtime settings READMEs document local readiness host capability and client proof as separate facts"
      (
        contains "local Moonlight command readiness, host Sunshine runtime-settings capability, and target-client proof" readme
        && contains "local Moonlight command readiness, host Sunshine runtime-settings capability, and target-client proof" moonlightReadme
      )
    )
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
    (check "Runtime settings READMEs document current review gates and evidence boundaries" (
      contains "Current review gates" readme
      && contains "source invariant/build check" readme
      && contains "same-session target-client proof" readme
      && contains "Current review gates" moonlightReadme
      && contains "source invariant/build check" moonlightReadme
      && contains "same-session target-client proof" moonlightReadme
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
    moonlight_manifest=${moonlightPackage}/nix-support/moonlight-embedded-korri/manifest.txt
    test -f "$moonlight_manifest"
    if ! grep -Fq '0011-reset-sdl-presenter-on-output-size-change.patch' "$moonlight_manifest"; then
      echo "error: Moonlight manifest does not list SDL presenter reset patch" >&2
      exit 1
    fi
    if grep -Fq '0012-diagnose-v4l2m2m-frame-content-hash.patch' "$moonlight_manifest"; then
      echo "error: Moonlight manifest still lists diagnostic frame-content hash patch" >&2
      exit 1
    fi

    cat > "$out/summary.txt" <<'EOF'
    Korri Sunshine runtime bitrate patch invariants passed and patched packages built.
    EOF
  ''
