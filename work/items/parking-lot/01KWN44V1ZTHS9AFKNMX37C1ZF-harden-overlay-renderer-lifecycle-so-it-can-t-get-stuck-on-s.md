---
id: 01KWN44V1ZTHS9AFKNMX37C1ZF
slug: harden-overlay-renderer-lifecycle-so-it-can-t-get-stuck-on-s
title: "Harden overlay renderer lifecycle so it can't get stuck on screen"
origin: parked
status: To Do
priority: medium
labels:
  - korri
  - overlay
  - renderer
  - lifecycle
  - robustness
created: 2026-07-03
source: se-work
---

# Harden overlay renderer lifecycle so it can't get stuck on screen

## Why it matters

Phase 1 validation surfaced a stuck-modal failure mode: an overlay renderer left showing a menu with no follow-up 'hide' stays on screen indefinitely (here it was a test-harness leftover, but the product path has the same shape). The renderer is currently lazy-spawned and resident for inputd's lifetime with no session-scoped teardown and no self-timeout. Two hardening steps: (1) session-scope it — spawn on game/stream launch, hide+kill on return-to-hub — per the original P1.1 plan (currently only lazy-resident); (2) make the renderer self-protect: auto-hide after an idle timeout if it stops receiving commands, and always draw transparent on hide. Also: any teardown tooling must not use `pkill -x` on the name (Linux truncates comm to 15 chars — use pkill -f).

## Acceptance Criteria

- [ ] Overlay renderer is session-scoped (spawned per game/stream session, torn down on return-to-hub)
- [ ] A renderer that stops receiving commands auto-hides (no indefinite stuck modal)
- [ ] hide always clears to transparent
- [ ] Teardown/ops scripts match the renderer by full path (pkill -f), not truncated name

## Related

- `product/services/device/overlay-renderer/renderer.c`
- `product/services/device/overlay-renderer-client.ts`
- `work/items/active/01KWMNX6R2N1BNCY124TWH94XF-stream-game-lifecycle-chord/plan.md`
