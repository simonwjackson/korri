---
id: 01KWE3F5Q2ZK8N4YT7VBQ3MJ9A
slug: replace-electrobun-chromium-kiosk
title: Replace Electrobun with a decoupled web-surface host + Chromium kiosk
type: refactor
status: active
created: 2026-06-30
---

# Replace Electrobun with a decoupled web-surface host + Chromium kiosk

Direct-prompt work item. Origin is the live design + on-device validation session
that established: Electrobun's WebKitGTK renderer is the fluidity/rendering
ceiling on SM8550 (X11 present blit, GPU idle at 220 MHz, mis-scaled render in
bare WebKit); Chromium — validated live on Bandai — renders the UI pixel-correct,
feels native, runs a native Wayland surface, and drives the Adreno to its max
680 MHz. Decision: fully replace Electrobun, decouple UI serving from rendering,
and make the renderer (and a phone) interchangeable clients of a network web
service.

Plan: `plan.md`.
