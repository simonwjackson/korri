---
title: Korrid device state is current-state-first
date: 2026-07-01
area: architecture
---

# Korrid device state is current-state-first

Korrid owns normalized device facts. Providers update one `DeviceState` service backed by `SubscriptionRef`, and consumers either read the current snapshot through `app.device.status` or subscribe to the current-state-first device event stream.

## Decision

- Device facts use one reducer/update path for startup probes, periodic observations, and manual `app.device.refresh` requests.
- Battery is the first provider. Its domain state distinguishes `Unknown`, `NoBattery`, `Ready`, `Stale`, and `ReadError` so UI surfaces do not treat missing hardware or read failures as fresh fixture data.
- Live updates are exposed through a surface-safe subscription path. The current RPC JSON serialization is unary/non-framed, so the first implementation uses an SSE transport at `/api/device/events` behind the Korri device source/bridge abstraction rather than making REST the product API.
- Provider read failures become typed device-state variants. The stream only fails for transport/server failures.
- Stream-control projects battery readback from `DeviceState` when running in Korrid, avoiding a second authoritative sysfs battery reader.

## Provider expectations

A future provider should:

1. Seed an explicit unknown/unavailable state.
2. Run startup, background, and manual refresh work through the same update function.
3. Suppress duplicate emissions before publishing to `SubscriptionRef`.
4. Serialize or sequence reads so older completions cannot overwrite newer state.
5. Represent absence and stale data as domain variants, not thrown UI errors.
6. Add fields/schema variants additively so existing clients can ignore facts they do not understand.

## UI contract

Surface components should read device facts through platform atoms or `window.korri.device`, not through device-specific Linux paths. Refresh commands acknowledge the request; UI state changes still arrive through the device-state subscription/store.
