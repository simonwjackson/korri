# Runtime Settings Protocol Contract

Date: 2026-06-02
Status: active
Scope: Sunshine/Moonlight runtime settings control for Korri downstream streaming sessions

## Contract boundary

The runtime settings protocol controls stream settings while an active Moonlight/Sunshine stream keeps running. The public product/tooling surface is Moonlight local-control; the Sunshine packet exchange is the lower-level host transport.

The contract covers individual setting changes only:

- bitrate
- FPS
- resolution

There is no high-level quality-profile command in this protocol. Product or adaptation policy may choose which individual settings to send and in what order, but the protocol remains a facts-and-controls surface, not a policy surface.

## Supported-today claim

Product-supported today means the validated Korri downstream profile only:

- patched `sunshine-korri` runtime settings series
- patched `moonlight-embedded-korri` local-control/runtime-settings series
- the validated H.264 VAAPI host path
- the validated Korri client/device profile captured in acceptance evidence

Bitrate, FPS, and resolution are normal proven runtime settings operations for that supported profile.

Other encoders, codecs, clients, host builds, and launch modes are not product-supported until separately validated. They may advertise capabilities for diagnostic use, but capability alone is not a Korri product support claim.

## Transport truth and caller truth

Two layers must stay visible:

1. Sunshine runtime-settings ack: compact transport truth from the host.
2. Moonlight local-control result/event: caller truth used by Korri product code, tools, and UI.

Product code consumes caller truth. Debugging and upstream notes may inspect transport truth.

## Wire operations

| Operation | Meaning | Mutating? | Caller command |
|---:|---|---:|---|
| `0` | Capability query for the active stream | no | `protocol.hello` / `state.get` capability state |
| `1` | Set bitrate in kbps | yes | `runtime.setBitrate` |
| `2` | Set effective FPS | yes | `runtime.setFps` |
| `3` | Set stream resolution | yes | `runtime.setResolution` |

Requests use stable runtime-settings request packet `0x5504`. Acks use stable runtime-settings ack packet `0x5505`.

## Bounds

The protocol-level value rule is deliberately small:

- bitrate must be positive
- FPS must be positive
- resolution width and height must be positive

Zero and negative values are invalid. Task-specific product policy may choose a conservative ladder or validated profile list, but those are product policy constraints, not runtime-settings protocol bounds.

## Capability and compatibility behavior

Normal product behavior fails closed:

- If the active session has not reported runtime-settings support, product mutation attempts must not be sent blindly.
- If a setting is unsupported, disabled, not ready, or not product-supported for the current profile, local-control reports a clear local outcome.
- Unsupported or unknown capability must not trigger reconnect/restart fallbacks or silent best-effort mutation attempts.

Diagnostic tools may explicitly probe unsupported or unknown combinations for research. Probe results must be labeled diagnostic and must not become product support claims without separate validation.

Capability state must expose at least:

- supported operations for the active session
- unsupported or disabled reason when known
- launch baseline bitrate/FPS/resolution
- current applied bitrate/FPS/resolution when known
- whether a mutation is queued, accepted, pending terminal outcome, or complete

## Sequencing

Runtime-settings mutations use one global queue.

Only one bitrate/FPS/resolution mutation may be in flight at a time for a stream. Commands from different callers and different setting families still serialize through that queue. This avoids racing shared encoder/session state and mirrors the Gamescope control lesson: shared runtime state needs one mutation order.

If a second mutation arrives while another is in flight, the implementation may either queue it or reject it as `conflict`, but it must not run concurrently.

## Request identity

There are two useful request identities:

- JSON-RPC/local-control request id: correlates a local-control request and immediate response.
- Runtime-settings command id: correlates the native Sunshine request, ack, timeout, stale ack, state snapshot, and terminal event.

A caller-visible accepted response must include the runtime-settings command id when a command enters the host runtime-settings path.

## Accepted versus terminal results

`accepted` is not success.

`accepted` means the command passed local validation and entered the runtime-settings path, or was queued to enter it. The terminal result arrives later through local-control `runtime.commandResult` events and state snapshots.

Only a terminal `applied` result means the setting actually changed.

## Applied truth

Maximum observability is required. A terminal result may claim `applied` only when the applied value is observable and matches the requested setting:

- requested bitrate matches applied bitrate
- requested FPS matches applied FPS
- requested width/height match applied resolution

If the host reports success but the applied value is missing, unreadable, or contradictory, local-control must not map it to caller-visible `applied`. It should surface a non-success outcome with the raw ack/reason preserved for debugging.

## Sunshine ack status

| Raw status | Meaning | Notes |
|---:|---|---|
| `0` | applied | Host says the setting applied. Local-control still requires applied value truth before caller-visible `applied`. |
| `1` | failed or unsupported | Reason disambiguates. |
| `2` | invalid | Request shape/value is invalid. |
| `3` | disabled | Runtime-settings gate or active-session support is disabled. |

Known reason values:

- `none`
- `gate-disabled`
- `invalid-bounds`
- `invalid-payload`
- `unsupported-encoder`
- `unsupported-backend`
- `unsupported-operation`
- `apply-failed`
- `control-not-ready`
- `no-ack`
- `conflict`
- `stale-ack`
- `stream-ended`

## Local-control result mapping

| Caller status | When to use |
|---|---|
| `accepted` | Immediate non-terminal response after local validation and dispatch/queueing. |
| `applied` | Terminal outcome with observable applied value matching the request. |
| `invalid` | Request is malformed or has non-positive values. |
| `disabled` | Runtime-settings support exists but is disabled by gate/session state. |
| `unsupported` | Operation is not supported by this host/client/profile. |
| `timed-out` | No terminal host ack arrived inside the bounded timeout. |
| `not-streaming` | No active stream can accept the command. |
| `unauthorized` | Caller lacks controller authority. |
| `conflict` | Command cannot enter the global mutation queue because another mutation is active and queueing is not allowed. |
| `failed` | Host/backend attempted the operation but could not apply it, or reported success without observable applied truth. |

State snapshots must preserve the latest terminal command result and the latest applied settings so late attachers and recovery code can reason from facts, not guesses.

## Timeouts and stale acks

A command has a bounded timeout. If no matching terminal ack arrives before timeout, local-control reports `timed-out` and records reason `no-ack` when available.

A later ack for an already timed-out command is stale diagnostic input. It may be recorded for debugging, but it must not silently rewrite the caller-visible terminal outcome without an explicit state/event transition.

## Recovery and rollback

The protocol does not auto-rollback.

It must expose enough baseline/current state for higher-level recovery logic to request an explicit revert:

- launch baseline bitrate/FPS/resolution
- current applied bitrate/FPS/resolution
- last command status and reason
- pending/in-flight command state when available

Recovery policy belongs to product/runtime orchestration. A revert is a normal explicit runtime-settings command, not hidden protocol behavior.

## Product and upstream posture

- Product code must use capability and product-support gates before mutation.
- Tooling may show both raw transport ack and mapped caller result.
- Upstream discussion should focus on stable operations, capability query semantics, request/ack identity, timeout/error behavior, and observable applied truth.
- Korri-specific product support claims remain separate from generic protocol capability claims.

## Moonlight-local input controls

Moonlight local-control exposes distinct command families:

- `runtime.*` commands are Sunshine runtime-settings commands. Their terminal proof can include Sunshine host-apply evidence, such as `runtime.commandResult` with `hostApply=reported` in runtime-watch artifacts.
- `input.*` commands are Moonlight-local input-control commands. `input.setTouchBounds` updates the client evdev filter before input packets are sent to Sunshine. Its `applied` result is local proof only and must not be interpreted as Sunshine host-apply proof.

Runtime-watch artifacts keep these proof classes separate. Touch-bounds proof should record `controlPlane=observed` and `hostApply=not-collected` unless a separate host-side validation surface is explicitly added later.

## Backlog trace

- `task-097`: this document is the runtime settings protocol contract.
- `task-058`: product launches must expose runtime controls only through known capabilities and caller-visible outcomes.
- `task-060`: safety guardrails use the status/reason and fail-closed capability rules.
- `task-061`: automated tests should cover transport-to-local-control mapping and no reconnect/restart fallback.
- `task-064`: compatibility matrices must distinguish capability, validation evidence, and product support.
- `task-067`, `task-086`, and `task-093`: quality ladder work composes individual settings; it does not add a quality-profile protocol command.
- `task-087` and `task-088`: physical gates/soaks prove validated profiles and applied-state claims.
- `task-091`: UI/debug surfaces should show caller-visible status plus applied settings.
- `task-092`: runtime-resolution safety work follows the positive-value protocol bound and product-level policy constraints separately.
- `task-094`, `task-095`, and `task-096`: upstream/patch cleanup work should preserve the contract vocabulary and evidence boundary.
- `task-100`: recovery fallback uses baseline/current state and explicit revert commands rather than protocol auto-rollback.