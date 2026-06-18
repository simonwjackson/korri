---
id: evier
title: Evier Developer Control Surface
status: active
jobs: []
---

# Evier Developer Control Surface

Evier is a developer/operator theme for exercising runtime stream, presentation, and device controls. It renders controls for Moonlight stream settings, plugin-provided presentation metadata/actions, display brightness, and battery readback.

Evier does **not** own the product control contract. Product-accessible control semantics live in stream-control API/domain modules:

- `app.stream-control.controls.get` exposes available controls, support status, mutation tags, readback paths, and valid value specs.
- `app.stream-control.state.get` exposes authoritative typed readbacks.
- `app.stream-control.*.set` mutation responses expose typed command `outcome` data while retaining raw protocol `response` as diagnostics.
- `@platform/stream-control/control-surface` derives readback truth states such as `known`, `unknown`, `unavailable`, `mixed`, and `diverged` from product state.

The Evier theme consumes those contracts through a stream-control client and handles only view lifecycle concerns such as polling, debouncing, stale refresh suppression, and rendering.

## Truth Rules

- Displayed values must come from authoritative readback, not local request state.
- Command ACK is not applied state.
- Moonlight accepted commands are pending until authoritative readback proves the value.
- GameScope command success requires readback-backed command results.
- Unsupported controls must be capability-gated and should not present false precision.
