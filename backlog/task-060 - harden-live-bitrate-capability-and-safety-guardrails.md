---
id: task-060
title: Harden live bitrate capability and safety guardrails
status: To Do
priority: high
labels:
  - sunshine
  - moonlight
  - runtime-settings
  - safety
  - capabilities
created: 2026-05-31
source: user
context:
  cwd: .
  branch: trunk
  commit: 29121a0
  repo: simonwjackson/korri
  invoked_by: se-backlog
---

# Harden live bitrate capability and safety guardrails

## Why it matters

Live bitrate must remain supportable only on proven paths; accidental advertisement on other encoders or stale/error states would reintroduce freezes, reconnect UX, or false success claims.

## Acceptance Criteria

- [ ] Bitrate capability is advertised only for active `h264_vaapi` sessions with the live-settings gate enabled.
- [ ] HEVC VAAPI, AV1 VAAPI, software, NVENC, unknown encoders, inactive sessions, and disabled gates omit/reject active-stream bitrate.
- [ ] Invalid bounds, unsupported commands, in-flight conflicts, stale acks, no-ack timeouts, stream-ended outcomes, and apply failures leave the current stream alive and current bitrate unchanged.
- [ ] Runtime FPS capability and runtime resolution proof-gating are unchanged by bitrate support.
- [ ] Local-control authority/session targeting prevents unrelated local users or stale sessions from mutating the active stream.
- [ ] Runtime source invariants cover the VAAPI private-state assumptions and fail closed if guard checks fail.

## Related

- `packages/sunshine-korri/patches/0005-add-seamless-vaapi-runtime-bitrate-path.patch`
- `nix/tests/korri-sunshine-runtime-bitrate-patch-check.nix`
- `packages/moonlight-embedded-korri/patches/0007-wire-local-control-runtime-command-events.patch`
- `korri/shared/stream/moonlight-control-protocol.ts`

## Notes

No reconnect fallback remains a hard constraint.
