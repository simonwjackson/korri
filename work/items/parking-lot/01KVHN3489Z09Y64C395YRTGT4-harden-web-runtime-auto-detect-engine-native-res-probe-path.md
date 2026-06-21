---
id: 01KVHN3489Z09Y64C395YRTGT4
slug: harden-web-runtime-auto-detect-engine-native-res-probe-path
title: Harden web-runtime auto-detect (engine + native-res) probe path
origin: parked
status: To Do
priority: medium
labels:[]
created: 2026-06-20
source: se-work
---

# Harden web-runtime auto-detect (engine + native-res) probe path

## Why it matters

The generic launcher's auto-detect path (engine sniff + native-res probe) mis-sizes on Sobo: the probed run shows scrollbars/blank where the declared path (--engine gamemaker --native WxH) renders the game perfectly fullscreen with no scrollbars. Likely causes: fingerprint read before engine globals/title settle (classifies as generic → no fixed-canvas gap), and/or canvas backing-store read before the engine stabilizes it. Engine/combo plugins should DECLARE native res (deterministic); this item hardens the probe so the generic/arbitrary path is reliable (stabilize-then-read for both fingerprint and canvas dims; verify overflow-kill applies).
