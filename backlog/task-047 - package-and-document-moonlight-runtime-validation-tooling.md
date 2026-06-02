---
id: task-047
title: Package and document Moonlight runtime validation tooling
status: To Do
priority: medium
labels:
  - moonlight
  - sunshine
  - runtime-settings
  - tooling
  - docs
created: 2026-05-30
source: se-architecture-improvement
---

# Package and document Moonlight runtime validation tooling

## Why it matters

Manual validation currently requires running source-tree Bun entrypoints and hand-wiring Sunshine/Moonlight environment variables. A packaged operator command plus a durable runbook would make bitrate/FPS/runtime-resolution smoke tests repeatable on devices without a development checkout.

## Acceptance Criteria

- [ ] `moonlight-runtime-watch` or an equivalent `korri` subcommand is available from the installed Korri toolchain.
- [ ] A docs/acceptance or docs/solutions runbook lists host gate setup, client launch env, socket discovery, bitrate/FPS commands, resolution proof-gated smoke path, expected logs/artifacts, and rollback/restore steps.
- [ ] The runbook distinguishes proven bitrate/FPS validation from proof-gated resolution and documents required `h264_vaapi`/`SUNSHINE_LIVE_SETTINGS_MVP=1` preconditions.
- [ ] The tooling has a product-path profile that can prove command accepted/applied, moving-video liveness, bandwidth movement, and no reconnect/encoder-restart/Moonlight-restart evidence.
- [ ] Product/operator status surfaces current applied bitrate, supported runtime operations, and enough request-id-correlated lifecycle data to diagnose failed or unsupported commands.
- [ ] Logs/artifacts make it easy to prove the seamless VAAPI path was used (`seamless_vaapi=1`) and that no fallback path was used.

## Related

- `tools/cli/moonlight-runtime-watch.ts`
- `tools/cli/moonlight-control.ts`
- `packages/moonlight-embedded-korri/README.md`
- `packages/sunshine-korri/README.md`
- `docs/acceptance/sunshine-korri-runtime-bitrate-restart-2026-05-25.md`
- `docs/acceptance/sunshine-korri-seamless-vaapi-runtime-bitrate-sm8550-2026-05-31.md`
- `docs/acceptance/sunshine-korri-runtime-resolution-2026-05-26.md`

## Notes

2026-05-31: Extended after the SM8550 seamless bitrate proof. This item now also owns operator-facing validation tooling/status for shippable live bitrate, while implementation, deployment, guardrails, automated coverage, hardware validation, soak, compatibility, and FFmpeg-helper hardening are split into task-058 through task-065.
