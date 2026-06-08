# Gamescope Control API Coverage Contract

Date: 2026-06-02
Status: active
Scope: `gamescope-korri` v1 local runtime-control API

## Contract boundary

The public Gamescope control surface is a local Unix-socket JSON-RPC/NDJSON protocol served by `korri-gamescope-control-bridge`. Product code, CLIs, and acceptance harnesses talk to the typed protocol; X11 root atoms and native Gamescope hooks are backend details.

The v1 guarantee applies to `gamescope-korri`. Stock Gamescope may be used only as a best-effort/debug backend when `protocol.hello` reports matching capabilities. Unsupported controls are valid command methods that return `status: "unsupported"`; truly unknown JSON-RPC method names remain JSON-RPC method errors.

Readable launch policy is a separate contract from this runtime-control protocol. Typed fields such as `gamescope.scaling.filter` render initial Gamescope argv; they do not add JSON-RPC methods or per-game `gamescope.control` YAML. In particular, launch-time `scaling.filter: pixel` is not a v1 `filter.set` value because the bridge has no verified root-atom/readback mapping for it.

## Transport and lifecycle requirements

- Socket path is session-scoped and local-only.
- Parent runtime directory and socket are owner-only by default.
- The bridge may start before Gamescope is ready; backend absence is reported as backend unavailable, not as a missing command.
- Mutating commands run through one global FIFO queue across all connected clients.
- Read-only protocol/state methods may be served outside the mutation queue only when they cannot race with backend mutation state.
- Close/restore behavior must be explicit: queued mutation commands either drain before close or receive a clear aborted/failed result.
- Maximum frame size is bounded by `GAMESCOPE_CONTROL_PROTOCOL_LIMITS.maxFrameBytes`.

## Wire envelopes

Requests use JSON-RPC 2.0 frames, one JSON object per line:

```json
{"jsonrpc":"2.0","id":"1","method":"filter.set","params":{"filter":"fsr"}}
```

Responses use JSON-RPC 2.0 success/error envelopes. Server-pushed events use a JSON-RPC notification-style frame with method `gamescope.event` and no response id:

```json
{"jsonrpc":"2.0","method":"gamescope.event","params":{"sequence":7,"type":"command.result","result":{"_tag":"command.result","command":"filter.set","status":"applied"}}}
```

## Result semantics

| Status | Meaning | Success claim |
|---|---|---|
| `applied` | Backend accepted the write and required readback matched. | Yes. |
| `unsupported` | The method is valid but the selected backend/capability cannot perform it. | No. |
| `invalid` | Request shape or values failed validation. | No. |
| `failed` | Backend command failed, or Gamescope rejected the operation. | No. |
| `timed-out` | Backend write or readback exceeded its bounded timeout. | No. |
| `readback-mismatch` | Write returned success but observed state differs from requested state. | No. |
| `readback-failed` | Write returned success but required readback could not be read. | No. |
| `aborted` | The bridge/session closed before the queued command completed. | No. |

`accepted` is not used for v1 readback divergence. If async-pending behavior is needed later, it must be introduced with explicit event semantics and not reused for mismatches.

## Required methods

| Family | Method | Required v1 behavior | Backend guarantee |
|---|---|---|---|
| Protocol | `protocol.hello` | Return protocol metadata, limits, command list, detailed capabilities, backend status, and supported events. | Bridge-only. |
| State | `state.get` | Return required state as a whole snapshot or fail the call if required state cannot be read. | `gamescope-korri`; stock best-effort. |
| Events | `events.subscribe` | Acknowledge subscription and start monotonic `gamescope.event` pushes. | Bridge-only with backend-derived/native events when available. |
| Events | `events.unsubscribe` | Stop pushes for the connection/subscription. | Bridge-only. |
| Mode | `mode.set` | Accept any positive width/height at API validation; backend may fail/unsupported by capability. | X11/native for Xwayland internal mode. |
| Scaling | `filter.set` | Set scaling filter and require readback match where available. `pixel` is launch-policy-only and invalid for v1 runtime requests. | X11/native for linear/nearest/integer/fsr/nis. |
| Scaling | `scaler.set` | Valid method; return supported or unsupported by capability. | Native if implemented; otherwise unsupported. |
| Sharpness | `sharpness.set` | Set FSR sharpness and require readback match where available. | X11/native for 0..20. |
| Refresh | `fps.set`, `refresh-cycle.set` | Valid methods; return supported or unsupported by capability. | Native if implemented; otherwise unsupported. |
| Display | `display.sleep`, `display.wake` | Valid methods; return supported or unsupported by capability. | Native if implemented; otherwise unsupported. |
| Capture | `screenshot.capture` | Valid method; return supported or unsupported by capability. | Native if implemented; otherwise unsupported. |
| Presentation | `hdr.set`, `vrr.set`, `tearing.set`, `low-latency.set` | Valid methods; return supported or unsupported by capability. | Native if implemented; otherwise unsupported. |
| Debug | `repaint.request`, `debug.set` | Valid methods; return supported or unsupported by capability. | Native/debug only. |

## Required state fields

For `gamescope-korri`, `state.get` must either read the required fields or fail the whole state call. Optional fields are present only when capabilities say they are observable.

| State field | Required? | Notes |
|---|---:|---|
| `backend` | yes | Backend kind and availability. |
| `xwaylandMode` | yes for Xwayland sessions | Inner/native Xwayland mode. |
| `filter` | yes | Current scaling filter when observable. |
| `sharpness` | yes | Current sharpness when observable. |
| `fsrFeedback` | yes for FSR sessions | Whether Gamescope reports FSR active. |
| `scaler`, `fps`, `refreshCycle`, `hdr`, `vrr`, `tearing`, `lowLatency`, `displayPower` | capability-gated | Required only when native capabilities advertise observability. |

## Event taxonomy

| Event type | Source | Required payload |
|---|---|---|
| `subscription.ready` | Bridge | subscription id, sequence, snapshot if requested. |
| `state.changed` | Native/readback-derived | changed field names and state snapshot/delta. |
| `command.result` | Bridge/backend | request id, command, result status, requested/applied/reason. |
| `backend.status` | Bridge/backend | available/unavailable, backend kind, reason. |
| `error` | Bridge | categorized error and optional request id. |

Every event includes a monotonically increasing `sequence` per bridge process.

## Coverage matrix

| Scenario | Unit/mocked coverage | Hardware/device coverage |
|---|---|---|
| Valid hello/state request | Protocol/client/bridge tests. | Optional operator smoke. |
| Valid supported mutation | Backend + bridge + CLI tests for mode/filter/sharpness. | Bandai DSI-2 proof for FSR/filter/sharpness/mode. |
| Valid unsupported mutation | Protocol/bridge/CLI tests assert `unsupported`, no backend write. | Not required unless product exposes the control. |
| Invalid method name | Protocol/bridge tests assert JSON-RPC method error. | Not required. |
| Invalid params | Protocol/CLI tests assert validation error before backend write. | Not required. |
| Backend unavailable | Bridge/backend tests assert canonical unavailable result/error. | Acceptance harness records unavailable separately from capture failure. |
| Backend timeout | Backend tests assert bounded timeout result and live bridge. | Optional stress run when debugging. |
| Readback mismatch | Backend tests assert `readback-mismatch`, requested vs observed. | Optional; hardware proof only for visual claims. |
| Readback failed | Backend tests assert `readback-failed`. | Optional. |
| Concurrent mutations | Bridge queue tests assert deterministic FIFO execution. | Optional. |
| Events | Client/bridge tests assert subscribe ack, sequence, command-result push. | Optional operator smoke. |
| Session lifecycle | Sessiond/launcher tests assert packaged bridge start/stop ordering. | Bandai session smoke. |
| Scaling policy | Launch-spec/config tests. | Bandai/Moonlight nested-resolution captures. |

## Backlog trace

- `task-101`: typed client, subscribe-style events, applied/failed/unsupported runtime status, and Bandai validation.
- `task-102`: live FSR/inner-resolution behavior requires Bandai evidence, not just unit tests.
- `task-103`: full RPC method list and unsupported semantics are defined here.
- `task-105`: this document is the API coverage contract.
- `task-106`: protocol/bridge/CLI coverage is complete when every coverage row has a test or documented hardware-only rationale.
- `task-107`: backend hardening is complete when timeout/readback/mismatch/unavailable rows pass.
- `task-108`: session wiring is complete when lifecycle rows pass.
- `task-109`: acceptance harness is complete when hardware rows are repeatable.
- `task-110`: packaging/CI is complete when packaged bridge and `gamescope-korri` eval/build checks pass.
