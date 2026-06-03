---
id: task-091
title: Expose runtime stream state and command results in product UI
status: To Do
priority: medium
labels:
  - streaming
  - ui
  - observability
  - runtime-settings
created: 2026-06-02
source: user
---

# Expose runtime stream state and command results in product UI

## Why it matters

The low-bandwidth feature needs to show users/operators what actually applied: requested resolution/bitrate/fps can differ from current applied state, and false assumptions caused debugging confusion.

## Acceptance Criteria

- [ ] Product UI or debug surface displays current applied resolution, bitrate, fps, and last runtime command status.
- [ ] State comes from Moonlight local-control snapshots or a server-owned projection, not guessed from requested settings.
- [ ] Unsupported, timed-out, disabled, diagnostic/probe-only, or conflict outcomes surface clearly.
- [ ] Tests cover state decoding for applied resolution and bitrate.

## Related

- `docs/acceptance/runtime-settings-protocol-contract.md`
- `korri/shared/stream/moonlight-control-protocol.ts`
- `korri/shared/stream/moonlight-control-client.ts`
- `korri/shared/stream/moonlight-runtime-watch-artifact.ts`
- `tools/cli/moonlight-runtime-watch.ts`

## Notes

During validation, state snapshot reported bitrateKbps=1000, fps=120, width=640, height=360 after the live drop. That is the kind of evidence the product should surface.
