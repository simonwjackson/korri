{
  pkgs,
  sunshinePatchPath,
  clientHeaderPath,
  clientInternalHeaderPath,
  clientProtocolPath,
  clientDispatchPath,
  clientControlStreamPath,
  clientConnectionPath,
  clientJniPath,
  clientJavaPath,
  clientSnapshotJavaPath,
  nativeTestPath,
}:

let
  lib = pkgs.lib;
  sunshine = builtins.readFile sunshinePatchPath;
  header = builtins.readFile clientHeaderPath;
  protocol = builtins.readFile clientInternalHeaderPath + builtins.readFile clientProtocolPath;
  dispatch = builtins.readFile clientDispatchPath;
  control = builtins.readFile clientControlStreamPath;
  connection = builtins.readFile clientConnectionPath;
  jni = builtins.readFile clientJniPath;
  java = builtins.readFile clientJavaPath;
  snapshotJava = builtins.readFile clientSnapshotJavaPath;
  contains = needle: haystack: lib.hasInfix needle haystack;
  check = message: assertion: { inherit message assertion; };
  values = [
    [ "OPERATION_QUERY_CAPABILITIES" "0" ]
    [ "OPERATION_SET_BITRATE_KBPS" "1" ]
    [ "OPERATION_SET_FPS" "2" ]
    [ "OPERATION_SET_RESOLUTION" "3" ]
    [ "STATUS_APPLIED" "0" ]
    [ "STATUS_FAILED" "1" ]
    [ "STATUS_INVALID" "2" ]
    [ "STATUS_DISABLED" "3" ]
    [ "REASON_NONE" "0" ]
    [ "REASON_GATE_DISABLED" "1" ]
    [ "REASON_INVALID_BOUNDS" "2" ]
    [ "REASON_INVALID_PAYLOAD" "3" ]
    [ "REASON_UNSUPPORTED_ENCODER" "4" ]
    [ "REASON_UNSUPPORTED_BACKEND" "5" ]
    [ "REASON_UNSUPPORTED_OPERATION" "6" ]
    [ "REASON_APPLY_FAILED" "7" ]
    [ "REASON_CONTROL_NOT_READY" "8" ]
    [ "REASON_NO_ACK" "9" ]
    [ "REASON_CONFLICT" "10" ]
    [ "REASON_STALE_ACK" "11" ]
    [ "REASON_STREAM_ENDED" "12" ]
    [ "REASON_PROOF_GATED" "13" ]
  ];
  valueChecks = map (
    entry:
    let
      name = builtins.elemAt entry 0;
      value = builtins.elemAt entry 1;
    in
    check "Sunshine and Android agree on ${name}" (
      contains "RUNTIME_SETTINGS_${name} = ${value}" sunshine
      && contains "#define SS_RUNTIME_SETTINGS_${name} ${value}" header
      && contains "SS_RUNTIME_SETTINGS_${name} = ${value};" java
    )
  ) values;
  checks = valueChecks ++ [
    (check "packet IDs remain 0x5504 and 0x5505" (
      contains "RUNTIME_SETTINGS_REQUEST_PACKET = 0x5504" sunshine
      && contains "RUNTIME_SETTINGS_ACK_PACKET = 0x5505" sunshine
      && contains "SS_RUNTIME_SETTINGS_REQUEST_PACKET 0x5504" protocol
      && contains "SS_RUNTIME_SETTINGS_ACK_PACKET 0x5505" protocol
    ))
    (check "request and acknowledgement payload sizes are exact" (
      contains "*outputLength = 8;" protocol
      && contains "*outputLength = 12;" protocol
      && contains "*outputLength = 16;" protocol
      && contains "expectedLength = 64;" protocol
      && contains "expectedLength = 20;" protocol
      && contains "expectedLength = 16;" protocol
      && contains "payloadLength != expectedLength" protocol
    ))
    (check "host status and reason pairs are fail closed" (
      contains "hostStatusReasonValid" protocol
      && contains "SS_RUNTIME_SETTINGS_MUTATION_OPERATION_MASK 0x0Eu" protocol
      && contains "reason == SS_RUNTIME_SETTINGS_REASON_GATE_DISABLED" protocol
      && !(contains "reason <=" protocol)
    ))
    (check "unavailable capability and rejected bitrate facts match the pinned treaty" (
      contains "maxFps != launchFps" protocol
      && contains "value >= command->minBitrateKbpsAtAcceptance" protocol
      && contains "value <= command->maxBitrateKbpsAtAcceptance" protocol
    ))
    (check "query and mutation results remain separate and reconcilable" (
      contains "queryOutcome" header
      && contains "mutationOutcome" header
      && contains "staleAckCount" header
      && contains "reconciliationRequired" header
      && contains "mutationWasActiveAtAcceptance" protocol
      && contains "mutationEpochAtAcceptance == state->mutationEpoch" protocol
    ))
    (check "dispatch checks lifecycle before readiness and keeps exact inactive errors" (
      contains "dispatch->lock(dispatch->context);" dispatch
      && contains "!dispatch->state->snapshot.sessionActive" dispatch
      && contains "result = dispatch->inactiveError" dispatch
      && contains "readinessError = dispatch->ready" dispatch
      && contains "dispatch->inactiveError = LI_RUNTIME_SETTINGS_ERROR_CONTROL_NOT_READY" dispatch
      && contains "dispatch->send(dispatch->context, payload, payloadLength)" dispatch
      && contains "SsRuntimeSettingsRecordSendFailure" dispatch
      && contains "dispatch->unlock(dispatch->context);" dispatch
    ))
    (check "runtime settings require Sunshine encrypted connected ENet inside readiness" (
      contains "if (!IS_SUNSHINE())" control
      && contains "result = LI_RUNTIME_SETTINGS_ERROR_NOT_SUNSHINE" control
      && contains "AppVersionQuad[0] < 5 || !encryptedControlStream" control
      && contains "client == NULL" control
      && contains "peer == NULL || peer->state != ENET_PEER_STATE_CONNECTED" control
      && contains "runtimeSettingsReady" control
      && !(contains "if (!IS_SUNSHINE()) {\n        return LI_RUNTIME_SETTINGS_ERROR_NOT_SUNSHINE" control)
    ))
    (check "control lifecycle is process-safe and preserves terminal state" (
      contains "atomic_bool runtimeSettingsPublished" control
      && contains "memory_order_release" control
      && contains "memory_order_acquire" control
      && contains "endRuntimeSettingsSession();" control
      && contains "terminateControlConnection" control
      && contains "connectionRuntimeSettingsStreamEnded();" connection
      && !(contains "PltDeleteMutex(&runtimeSettingsMutex)" control)
      && !(contains "SsRuntimeSettingsReset" control)
    ))
    (check "timeout wait uses the remaining active deadline and handles clock regression" (
      contains "SsRuntimeSettingsNextTimeoutMs" protocol
      && contains "nowMs >= command->sentAtMs ? nowMs - command->sentAtMs : 0" protocol
      && contains "runtimeSettingsWaitMs" control
      && contains "MIN(waitTimeMs, runtimeSettingsWaitMs)" control
    ))
    (check "JNI snapshot version two mapping uses one tested pure serializer" (
      contains "SS_RUNTIME_SETTINGS_SNAPSHOT_VERSION 2" header
      && contains "SS_RUNTIME_SETTINGS_SNAPSHOT_WIRE_LENGTH 31" header
      && contains "SsRuntimeSettingsSnapshotToWire" protocol
      && contains "SsRuntimeSettingsSnapshotToWire(&snapshot, wire)" jni
      && contains "SS_RUNTIME_SETTINGS_SNAPSHOT_LENGTH = 31" java
      && contains "SS_RUNTIME_SETTINGS_SNAPSHOT_RECONCILIATION_REQUIRED_INDEX = 30" java
      && contains "WIRE_LENGTH = 31" snapshotJava
      && contains "values[30]" snapshotJava
      && contains "getSunshineRuntimeSettingsSnapshotRaw" java
      && !(contains "RUNTIME_SETTINGS_SNAPSHOT_TOKEN" java)
      && !(contains "RUNTIME_SETTINGS_SNAPSHOT_ADDRESS" java)
    ))
    (check "native tests prove deterministic lifecycle and readiness ordering" (
      !(contains "usleep(" (builtins.readFile nativeTestPath))
      && contains "lockAttempts" (builtins.readFile nativeTestPath)
      && contains "waitForStarted" (builtins.readFile nativeTestPath)
      && contains "readyCallsAfterEnd" (builtins.readFile nativeTestPath)
      && contains "LI_RUNTIME_SETTINGS_ERROR_NOT_SUNSHINE" (builtins.readFile nativeTestPath)
      && contains "atomic_load(&context.readyCalls) == 0" (builtins.readFile nativeTestPath)
    ))
    (check "client has no environment adaptation hook or raw packet log" (
      !(contains "getenv(" protocol)
      && !(contains "MOONLIGHT_RUNTIME_SETTINGS" protocol)
      && !(contains "raw enet control recv" control)
      && !(contains "control recv decrypted" control)
    ))
  ];
  failures = builtins.filter (candidate: !candidate.assertion) checks;
in
if failures != [ ] then
  throw "Korri Sunshine Android protocol check failed:\n${
    lib.concatMapStringsSep "\n" (failure: "- ${failure.message}") failures
  }"
else
  pkgs.runCommand "sunshine-korri-android-client-protocol-check" { } ''
    ${pkgs.stdenv.cc}/bin/cc -std=c11 -Wall -Wextra -Werror -pedantic \
      -I${builtins.dirOf clientHeaderPath} \
      ${clientProtocolPath} \
      ${clientDispatchPath} \
      ${nativeTestPath} \
      -pthread \
      -o runtime-settings-test
    ./runtime-settings-test
    touch "$out"
  ''
