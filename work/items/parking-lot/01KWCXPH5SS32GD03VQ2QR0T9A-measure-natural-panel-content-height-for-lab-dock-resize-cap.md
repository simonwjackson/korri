---
id: 01KWCXPH5SS32GD03VQ2QR0T9A
slug: measure-natural-panel-content-height-for-lab-dock-resize-cap
title: Measure natural panel content height for lab dock/resize caps
origin: parked
status: To Do
priority: low
labels:[]
created: 2026-06-30
source: se-debug
---

# Measure natural panel content height for lab dock/resize caps

## Why it matters

The lab panel "never taller than content" cap uses the measured bounding box, which for an already-sized panel equals its imposed height, not the natural content height. This means a panel shrunk below its content can't be grown back to content, and a grouped reflow could still produce a height above content. Measuring natural content (e.g. header + body scrollHeight via an unconstrained path) would make the content cap exact in all paths.

## Acceptance Criteria

- [ ] contentHeightOf returns natural content height independent of an explicit/sized box height
- [ ] A panel shrunk below content can be resized back up to (but not beyond) its content height
- [ ] Grouped reflow never sizes a member taller than its content

## Related

- `tools/theme-workshop/lab/chrome/LabPanelDeck.tsx`
- `tools/theme-workshop/lab/chrome/lab-panel-dock.ts`
