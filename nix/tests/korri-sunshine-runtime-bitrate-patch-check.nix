{
  pkgs,
  patchPath,
  readmePath,
}:

let
  lib = pkgs.lib;
  check = message: assertion: { inherit message assertion; };

  patch = builtins.readFile patchPath;
  readme = builtins.readFile readmePath;
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
    (check "Sunshine runtime bitrate patch does not expose a logs-only pending status" (
      !(contains "RUNTIME_SETTINGS_STATUS_ACCEPTED_PENDING" patch)
      && !(contains "accepted/pending" readme)
      && !(contains "accepted=1" patch)
    ))
    (check "Sunshine runtime bitrate patch logs queued requests without implying final success" (
      contains "queued=1" patch
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
    cat > "$out/summary.txt" <<'EOF'
    Korri Sunshine runtime bitrate patch invariants passed.
    EOF
  ''
