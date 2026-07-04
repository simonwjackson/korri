---
id: 01KWNSXR8H87GJ720M51K1HH31
slug: senses-stream-health-telemetry
title: "Senses (Layer 4): surface numeric stream-health telemetry for the adaptive controller"
status: active
created: 2026-07-03
source: user
labels:
  - runtime-settings
  - adaptive-streaming
  - telemetry
  - moonlight
  - layer-4
---

# Senses (Layer 4) — stream-health telemetry

Layer 4 of the korri stream-quality stack. Surface a clean, normalized, rolling
stream of numeric network + decode health from the Moonlight client's own
estimates over the existing local-control channel, so the future continuous
controller (Layer 5) has real numbers instead of the coarse `poor|okay|good`
flag. Sensing only — no adaptation decisions. See `plan.md`.
