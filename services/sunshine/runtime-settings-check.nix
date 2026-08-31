{
  pkgs,
  sunshinePackage,
  approvedPatchesPath,
  patchPaths,
  packagePath,
  readmePath,
}:

let
  lib = pkgs.lib;
  approved = import approvedPatchesPath;
  contains = needle: haystack: lib.hasInfix needle haystack;
  check = message: assertion: { inherit message assertion; };
  patch = lib.concatStringsSep "\n" (map builtins.readFile patchPaths);
  packageSource = builtins.readFile packagePath;
  readme = builtins.readFile readmePath;
  actualPatchRecords = map (path: {
    name = builtins.baseNameOf path;
    sha256 = builtins.hashFile "sha256" path;
  }) patchPaths;
  approvedPatchRecords = map (record: {
    inherit (record) name sha256;
  }) approved.patches;
  patchManifestLines = builtins.concatStringsSep "\n" (
    map (record: "patch=${record.name} sha256=${record.sha256}") approved.patches
  );
  expectedProvenance = ''
    format=1
    package=sunshine-korri
    base_sunshine_version=${approved.baseSunshineVersion}
    approved_base_sunshine_source_hash=${approved.approvedBaseSourceHash}
    base_sunshine_source=${sunshinePackage.korriBaseSunshineSource}
    base_sunshine_derivation=${sunshinePackage.korriBaseSunshineDerivation}
    approved_base_sunshine_derivation=${sunshinePackage.korriBaseSunshineDerivation}
    reviewed_libavcodec_version=${approved.reviewedLibavcodecVersion}
    executable=bin/sunshine
    patch_set_sha256=${approved.patchSetSha256}
    ${patchManifestLines}
  '';
  checks = [
    (check "the checked-in patch approval is exact" (
      actualPatchRecords == approvedPatchRecords
      && sunshinePackage.korriPatchNames == map (record: record.name) approved.patches
      && sunshinePackage.korriPatchSetSha256 == approved.patchSetSha256
      && sunshinePackage.korriBaseSunshineVersion == approved.baseSunshineVersion
      && sunshinePackage.korriApprovedBaseSunshineSourceHash == approved.approvedBaseSourceHash
      && builtins.elem sunshinePackage.korriBaseSunshineDerivation approved.approvedBaseDerivations
      && sunshinePackage.korriApprovedBaseSunshineDerivation == sunshinePackage.korriBaseSunshineDerivation
      && pkgs.sunshine.src.outputHash == approved.approvedBaseSourceHash
      && sunshinePackage.korriReviewedLibavcodecVersion == approved.reviewedLibavcodecVersion
    ))
    (check "runtime settings packet IDs remain stable" (
      contains "RUNTIME_SETTINGS_REQUEST_PACKET = 0x5504" patch
      && contains "RUNTIME_SETTINGS_ACK_PACKET = 0x5505" patch
    ))
    (check "runtime settings operation IDs remain stable" (
      contains "RUNTIME_SETTINGS_OPERATION_QUERY_CAPABILITIES = 0" patch
      && contains "RUNTIME_SETTINGS_OPERATION_SET_BITRATE_KBPS = 1" patch
      && contains "RUNTIME_SETTINGS_OPERATION_SET_FPS = 2" patch
      && contains "RUNTIME_SETTINGS_OPERATION_SET_RESOLUTION = 3" patch
    ))
    (check "runtime settings status IDs remain stable" (
      contains "RUNTIME_SETTINGS_STATUS_APPLIED = 0" patch
      && contains "RUNTIME_SETTINGS_STATUS_FAILED = 1" patch
      && contains "RUNTIME_SETTINGS_STATUS_INVALID = 2" patch
      && contains "RUNTIME_SETTINGS_STATUS_DISABLED = 3" patch
    ))
    (check "runtime settings reason IDs remain stable" (
      contains "RUNTIME_SETTINGS_REASON_NONE = 0" patch
      && contains "RUNTIME_SETTINGS_REASON_GATE_DISABLED = 1" patch
      && contains "RUNTIME_SETTINGS_REASON_INVALID_BOUNDS = 2" patch
      && contains "RUNTIME_SETTINGS_REASON_INVALID_PAYLOAD = 3" patch
      && contains "RUNTIME_SETTINGS_REASON_UNSUPPORTED_ENCODER = 4" patch
      && contains "RUNTIME_SETTINGS_REASON_UNSUPPORTED_BACKEND = 5" patch
      && contains "RUNTIME_SETTINGS_REASON_UNSUPPORTED_OPERATION = 6" patch
      && contains "RUNTIME_SETTINGS_REASON_APPLY_FAILED = 7" patch
      && contains "RUNTIME_SETTINGS_REASON_CONTROL_NOT_READY = 8" patch
      && contains "RUNTIME_SETTINGS_REASON_NO_ACK = 9" patch
      && contains "RUNTIME_SETTINGS_REASON_CONFLICT = 10" patch
      && contains "RUNTIME_SETTINGS_REASON_STALE_ACK = 11" patch
      && contains "RUNTIME_SETTINGS_REASON_STREAM_ENDED = 12" patch
      && contains "RUNTIME_SETTINGS_REASON_PROOF_GATED = 13" patch
    ))
    (check "the package does not apply obsolete diagnostic patches" (
      !(contains "0006-diagnose-vaapi-convert-sequence.patch" packageSource)
      && !(contains "0007-finish-vaapi-gl-convert-before-encode.patch" packageSource)
      && !(contains "0009-diagnose-avcodec-packet-content-after-resolution.patch" packageSource)
      && !(contains "0011-force-vaapi-vram-source-copy-before-convert.patch" packageSource)
    ))
    (check "runtime settings do not expose a pending success state" (
      !(contains "RUNTIME_SETTINGS_STATUS_ACCEPTED_PENDING" patch)
      && !(contains "accepted/pending" readme)
      && !(contains "accepted=1" patch)
    ))
    (check "queued requests do not imply final success" (contains "queued=1" patch))
    (check "the runtime settings gate accepts only the exact value 1" (
      contains "SUNSHINE_LIVE_SETTINGS_MVP" patch
      && contains ''std::string_view {enabled_value} == "1"sv'' patch
    ))
    (check "requests and acknowledgements use typed queues" (
      contains "queue_t<video::runtime_bitrate_request_t> runtime_bitrate_events" patch
      && contains "queue_t<video::runtime_bitrate_ack_t> runtime_bitrate_ack_queue" patch
      && contains "mail->queue<runtime_bitrate_request_t>(mail::runtime_bitrate)" patch
      && contains "mail->queue<runtime_bitrate_ack_t>(mail::runtime_bitrate_ack)" patch
      && contains "boost::endian::little_uint16_at reason" patch
    ))
    (check "runtime bitrate has no unsafe AVCodec fallback" (
      !(contains "update_runtime_bitrate" patch)
      && !(contains "avcodec runtime bitrate update" patch)
      && !(contains "AV_OPT_SEARCH_CHILDREN" patch)
    ))
    (check "runtime bitrate uses the seamless VAAPI path without restart fallback" (
      contains "runtime_update_h264_vaapi_bitrate" patch
      && contains "VAAPI runtime bitrate params updated without encoder restart" patch
      && contains "seamless_vaapi=1" patch
      && contains "request_idr_frame" patch
      && !(contains "encoder restarted for runtime bitrate" patch)
      && !(contains "disp->dummy_img(dummy_img.get())" patch)
    ))
    (check "the private VAAPI mirror fails closed on exact libavcodec drift" (
      contains "#define KORRI_SUPPORTED_LIBAVCODEC_MAJOR 62" patch
      && contains "#define KORRI_SUPPORTED_LIBAVCODEC_VERSION AV_VERSION_INT(62, 11, 100)" patch
      && contains "LIBAVCODEC_VERSION_MAJOR != KORRI_SUPPORTED_LIBAVCODEC_MAJOR" patch
      && contains "LIBAVCODEC_VERSION_INT != KORRI_SUPPORTED_LIBAVCODEC_VERSION" patch
      && contains "must be reviewed for this exact FFmpeg libavcodec version" patch
    ))
    (check "runtime FPS support is limited to H.264 VAAPI" (
      contains "runtime_settings_supports_vaapi_h264" patch
      && contains ''encoder.name == "vaapi"sv'' patch
      && contains ''encoder.codec_from_config(config).name == "h264_vaapi"'' patch
      && contains "runtime FPS unsupported" patch
    ))
    (check "runtime FPS uses experimental frame pacing" (
      contains "supports operation `2`: set effective stream FPS" readme
      && contains "runtime FPS" patch
      && contains "applied_fps" patch
      && contains "runtime_fps_interval" patch
    ))
    (check "runtime FPS rejects impossible upshifts before queueing" (
      contains "operation == video::RUNTIME_SETTINGS_OPERATION_SET_FPS && requested_value >" patch
      && contains "rejection_status = video::RUNTIME_SETTINGS_STATUS_INVALID" patch
    ))
    (check "runtime FPS failures preserve the current applied value" (
      contains "live-settings-mvp: runtime FPS unsupported" patch
      && contains "RUNTIME_SETTINGS_STATUS_FAILED" patch
      && contains "runtime_bitrate_ack_t {request->request_id, RUNTIME_SETTINGS_OPERATION_SET_FPS, status, applied_fps, 0, 0, reason}" patch
    ))
    (check "capability acknowledgements expose complete active-session facts" (
      contains "control_runtime_settings_capability_ack_t" patch
      && contains "supported_operations" patch
      && contains "proof_gated_operations" patch
      && contains "min_bitrate_kbps" patch
      && contains "max_bitrate_kbps" patch
      && contains "max_fps" patch
      && contains "current_bitrate_kbps" patch
      && contains "current_fps" patch
      && contains "current_width" patch
      && contains "current_height" patch
      && contains "launch_bitrate_kbps" patch
      && contains "launch_fps" patch
      && contains "launch_width" patch
      && contains "launch_height" patch
    ))
    (check "capability support uses active per-session encoder facts" (
      contains "MAIL(runtime_settings_supports_encoder_restart)" patch
      && contains "session->control.runtime_settings_supports_encoder_restart" patch
      && contains "session->control.runtime_settings_encoder_restart_supported" patch
      && contains "runtime_settings_supports_encoder_restart->raise(runtime_settings_supports_vaapi_h264" patch
      && contains "auto runtime_supported = enabled && session->control.runtime_settings_encoder_restart_supported" patch
    ))
    (check "capability bounds remain conservative" (
      contains "+    plaintext.min_bitrate_kbps = runtime_supported ? 500 : 0;" patch
      && contains "+    plaintext.max_bitrate_kbps = runtime_supported ? 150000 : 0;" patch
      && contains "supported_operations |= 1u << video::RUNTIME_SETTINGS_OPERATION_SET_BITRATE_KBPS" patch
      && contains "supported_operations |= 1u << video::RUNTIME_SETTINGS_OPERATION_SET_FPS" patch
    ))
    (check "validated sessions advertise runtime resolution as operation 3" (
      contains "proof_gated_operations" patch
      && contains "supported_operations |= 1u << video::RUNTIME_SETTINGS_OPERATION_SET_RESOLUTION" patch
      && !(contains "proof_gated_operations |= 1u << video::RUNTIME_SETTINGS_OPERATION_SET_RESOLUTION" patch)
      && contains "Runtime resolution is a normal runtime-settings operation for the validated Korri profile" readme
    ))
    (check "runtime resolution rejects unsafe bounds and aspect changes" (
      contains "requested_width == 0 || requested_height == 0" patch
      && contains "requested_width > launch_width" patch
      && contains "requested_height > launch_height" patch
      && contains "aspect_tolerance" patch
      && contains "aspect_abs_delta <= aspect_tolerance" patch
      && contains "!same_aspect" patch
    ))
    (check "host requests are exact before logging, scheduling, or queueing" (
      contains "request_id == 0 || reserved != 0 || payload.size() != expected_payload_size" patch
      && contains "expected_payload_size = sizeof(control_runtime_settings_request_prefix_t)" patch
      && contains "expected_payload_size = sizeof(control_runtime_settings_resolution_request_t)" patch
      && contains "expected_payload_size = sizeof(control_runtime_settings_request_t)" patch
      && contains "runtime_settings_capability_pending" patch
      && contains "runtime_settings_capability_due = std::chrono::steady_clock::now() + 100ms" patch
      && contains "now >= session->control.runtime_settings_capability_due" patch
      && contains "send_runtime_settings_capability_ack(session, request_id, enabled)" patch
      && !(contains "steady_timer" patch)
      && !(contains "async_wait" patch)
      && !(contains ").detach()" patch)
    ))
    (check "runtime resolution uses explicit width and height fields" (
      contains "control_runtime_settings_request_prefix_t" patch
      && contains "boost::endian::little_uint32_at width" patch
      && contains "boost::endian::little_uint32_at height" patch
      && contains "applied_width" patch
      && contains "applied_height" patch
    ))
    (check "launch baselines remain separate from current applied values" (
      contains "runtime_settings_launch_bitrate_kbps" patch
      && contains "runtime_settings_applied_bitrate_kbps" patch
      && contains "runtime_settings_launch_fps" patch
      && contains "runtime_settings_applied_fps" patch
      && contains "runtime_settings_launch_width" patch
      && contains "runtime_settings_applied_width" patch
      && contains "runtime_settings_launch_height" patch
      && contains "runtime_settings_applied_height" patch
      && contains "plaintext.launch_bitrate_kbps" patch
      && contains "plaintext.current_bitrate_kbps" patch
    ))
    (check "successful acknowledgements update applied values only" (
      contains "session->control.runtime_settings_applied_bitrate_kbps = ack.applied_value" patch
      && contains "session->control.runtime_settings_applied_fps = ack.applied_value" patch
      && contains "session->control.runtime_settings_applied_width = ack.applied_width" patch
      && contains "session->control.runtime_settings_applied_height = ack.applied_height" patch
      && contains "session->control.runtime_settings_launch_bitrate_kbps = (std::uint32_t) session->config.monitor.bitrate" patch
    ))
    (check "runtime resolution failures preserve current dimensions" (
      contains "auto current_applied_width = session->control.runtime_settings_applied_width" patch
      && contains "auto current_applied_height = session->control.runtime_settings_applied_height" patch
      && contains "send_runtime_settings_ack(session, video::runtime_bitrate_ack_t {request_id, operation, rejection_status, 0, current_applied_width, current_applied_height, rejection_reason})" patch
      && contains "runtime resolution unsupported encoder" patch
      && contains "ack.status == video::RUNTIME_SETTINGS_STATUS_APPLIED" patch
    ))
    (check "touch mapping refreshes only after resolution apply" (
      contains "runtime resolution" patch
      && contains "touch_port" patch
      && contains "make_port" patch
      && contains "ack.status == video::RUNTIME_SETTINGS_STATUS_APPLIED" patch
      && contains "applied_width" patch
      && contains "applied_height" patch
    ))
    (check "runtime resolution refreshes capture state after apply" (
      contains "config_t &config" patch && contains "runtime_reinit_event" patch
    ))
    (check "the VAAPI destructor skip is limited to the replacement pair" (
      contains "disable_destructor_flush_after_runtime_vaapi_replacement" patch
      && contains "runtime VAAPI replacement: destructor flush disabled for replacement pair" patch
      && !(contains "disable_flush_on_destroy" patch)
    ))
    (check "package provenance is anchored and complete" (
      sunshinePackage.korriProvenanceRelativePath == "share/korri/sunshine-korri/provenance"
      && sunshinePackage.korriApprovedBaseSunshineSourceHash == approved.approvedBaseSourceHash
      && pkgs.sunshine.src.outputHash == approved.approvedBaseSourceHash
      &&
        sunshinePackage.korriBaseSunshineSource
        == builtins.unsafeDiscardStringContext (toString pkgs.sunshine.src)
      &&
        sunshinePackage.korriBaseSunshineDerivation
        == builtins.unsafeDiscardStringContext pkgs.sunshine.drvPath
      && builtins.elem sunshinePackage.korriBaseSunshineDerivation approved.approvedBaseDerivations
      && sunshinePackage.korriApprovedBaseSunshineDerivation == sunshinePackage.korriBaseSunshineDerivation
      && contains "Package provenance" readme
    ))
  ];
  failures = builtins.filter (candidate: !candidate.assertion) checks;
in
if failures != [ ] then
  throw "Korri Sunshine runtime settings check failed:\n${
    lib.concatMapStringsSep "\n" (failure: "- ${failure.message}") failures
  }"
else
  pkgs.runCommand "sunshine-korri-runtime-settings-check"
    { nativeBuildInputs = [ pkgs.gcc pkgs.boost ]; } ''
    test -x ${sunshinePackage}/bin/sunshine
    c++ -std=c++20 -O2 -Wall -Wextra -Werror -pthread \
      ${./test-runtime-settings-host.cpp} -o host-runtime-settings-test
    ./host-runtime-settings-test

    provenance=${sunshinePackage}/${sunshinePackage.korriProvenanceRelativePath}
    test -f "$provenance"
    test "$(stat -c '%a' "$provenance")" = 444

    cat > expected-provenance <<'EOF'
    ${expectedProvenance}EOF
    cmp expected-provenance "$provenance"

    mkdir -p "$out"
    printf '%s\n' '${approved.patchSetSha256}' > "$out/patch-set-sha256"
  ''
