---
id: task-062
title: Run clean product-path hardware validation for live bitrate
status: To Do
priority: high
labels:
  - acceptance
  - hardware
  - bandai
  - aka
  - runtime-settings
created: 2026-05-31
source: user
context:
  cwd: .
  branch: trunk
  commit: 29121a0
  repo: simonwjackson/korri
  invoked_by: se-backlog
---

# Run clean product-path hardware validation for live bitrate

## Why it matters

The proof used manual/Desktop launch and temporary deployment; shippable confidence requires reboot-clean validation through the normal product path on real devices.

## Acceptance Criteria

- [ ] Reboot `aka` and `bandai`, start services normally, and validate `1080p@120fps` H.264 with Moonlight `v4l2m2m`.
- [ ] Validate normal `app.library.launch` product RPC path, explicit `korri-sessiond` managed path, and the intended Sunshine app (`Korri Stream` or configured `Desktop`).
- [ ] For bitrate upshift, downshift, and restore-to-baseline, record command accepted, command result applied, local-control state, bandwidth movement, and moving-video screenshots.
- [ ] Prove no Moonlight process restart, Sunshine encoder restart, session reconnect, Gamescope/Sway/DRM contention, failed units, or decoder error regression occurred.
- [ ] Validate real gameplay, controller input, audio continuity, and clean teardown back to Bandai home state.

## Related

- `docs/acceptance/sunshine-korri-seamless-vaapi-runtime-bitrate-sm8550-2026-05-31.md`
- `tools/device/sessiond.ts`
- `korri/products/app/api/library/launch.rpc-handler.ts`
- `packages/moonlight-embedded-korri/README.md`
- `packages/sunshine-korri/README.md`

## Notes

This is the clean replacement for the manual `/tmp` validation run.
