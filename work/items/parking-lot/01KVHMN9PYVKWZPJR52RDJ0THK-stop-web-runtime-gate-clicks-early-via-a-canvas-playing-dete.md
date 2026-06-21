---
id: 01KVHMN9PYVKWZPJR52RDJ0THK
slug: stop-web-runtime-gate-clicks-early-via-a-canvas-playing-dete
title: "Stop web-runtime gate clicks early via a canvas \"playing\" detector"
origin: parked
status: To Do
priority: low
labels:[]
created: 2026-06-20
source: se-work
---

# Stop web-runtime gate clicks early via a canvas "playing" detector

## Why it matters

korri-web-runtime currently clicks the canvas center every 2s for a fixed 60s startup window to clear engine focus gates (e.g. GameMaker), because the overlay is canvas-drawn with no DOM "playing" signal and only becomes click-ready after the engine finishes loading. The fixed window means a few clicks land during real gameplay (minor input interference). A pixel-variance check (CDP screenshot of a small canvas region; flat overlay vs varied gameplay) would let the loop stop as soon as play starts.
