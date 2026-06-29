---
id: 01KW4R3GPE1R0RQQSGXVTWDR2X
title: Refactor RockNIX audio bootstrap seam
status: active
created: 2026-06-27
source: se-plan
---

# Refactor RockNIX audio bootstrap seam

Plan and implement a bounded RockNIX-only refactor that extracts shared PulseAudio readiness, sink-selection, and safe-volume clamp mechanics from SM8550/RK3566 platform adapters into a Korri-owned NixOS module seam while preserving platform-specific audio topology and failure posture.
