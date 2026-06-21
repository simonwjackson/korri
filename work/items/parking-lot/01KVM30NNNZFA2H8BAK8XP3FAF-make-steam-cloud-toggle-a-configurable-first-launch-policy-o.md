---
id: 01KVM30NNNZFA2H8BAK8XP3FAF
slug: make-steam-cloud-toggle-a-configurable-first-launch-policy-o
title: Make Steam Cloud toggle a configurable first-launch policy option (registry.vdf)
origin: parked
status: To Do
priority: low
labels:
  - steam
  - kiosk
  - materializer
  - plugin-config
  - cloud
created: 2026-06-21
source: user
---

# Make Steam Cloud toggle a configurable first-launch policy option (registry.vdf)

## Why it matters

Steam Cloud sync prompts can block headless/kiosk launches on cleared prefixes. The bypass is setting CloudEnabled in ~/.steam/registry.vdf (HKCU>Software>Valve>Steam) with Steam stopped. This was cut from the ARM64-proton/declarative-policy plan (01KVM124SW03GF7P1XZGKDSS4M) because cloud lives in registry.vdf (a different file than the interstitial/EULA seeds in localconfig.vdf) and none of the ~30 games tested actually needed it. Capture it as a follow-up so the Steam plugin policy can drive it when a real need appears.

## Acceptance Criteria

- [ ] first-launch.cloud policy field (enabled|disabled|inherit) drives a registry.vdf CloudEnabled write, applied in the materializer's Steam-stopped window
- [ ] Default is inherit (no-op) unless a deployment opts in
- [ ] Writes target the correct registry.vdf (HKCU>Software>Valve>Steam) and are idempotent
- [ ] Restores cloud cleanly when set back to enabled/inherit

## Related

- `01KVM124SW03GF7P1XZGKDSS4M`
- `01KVKZQ8H628H1NNXXG7WGQGNX`
- `product/plugins/steam/src/state-materializer.ts`
