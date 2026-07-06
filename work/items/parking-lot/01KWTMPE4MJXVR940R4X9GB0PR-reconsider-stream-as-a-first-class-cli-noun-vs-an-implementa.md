---
id: 01KWTMPE4MJXVR940R4X9GB0PR
slug: reconsider-stream-as-a-first-class-cli-noun-vs-an-implementa
title: "Reconsider 'stream' as a first-class CLI noun vs an implementation detail of playing a remote game"
origin: parked
status: To Do
priority: low
labels:
  - cli
  - streaming
  - api-design
  - ux
  - task-067
created: 2026-07-06
source: user
---

# Reconsider 'stream' as a first-class CLI noun vs an implementation detail of playing a remote game

## Why it matters

The adaptive quality controls (bitrate/fps/resolution/lean/auto boundaries) are currently exposed under a `korri stream ...` command, which treats 'stream' as a first-class concept the user manages. But streaming is really just the transport for playing a game that happens to run on another machine -- an implementation detail. The user would prefer these controls to attach to the game/session/launch, so the mental model is 'play this game with these boundaries' rather than 'manage a stream.' The same flat key=value boundary schema would ride on launch and on the running session/game, with no separate 'stream' surface. Deciding this before the CLI (and later GUI) solidifies avoids baking a noun the product may not want; keeping it also has merit (a clear place for live, transport-level controls). Out of scope for the immediate controller work, but should be settled before the surface hardens.

## Acceptance Criteria

- [ ] Decide whether adaptive-quality/boundary controls live on a 'stream' noun or on the game/session/launch.
- [ ] If the latter: redesign so boundaries are expressed per-game/session (e.g. on launch and on a running-session command) and 'stream' becomes internal; keep the identical key=value schema regardless of surface.
- [ ] Ensure the chosen model still supports live mid-session adjustment and observability (watch feed) without reintroducing a separate stream concept.
- [ ] Record the decision in the task-067 spec so the CLI and future GUI share one noun model.

## Related

- `01KSXN94148T4616TA79KHQD9T`
- `product/surfaces/terminal/korri-cli/stream-quality.ts`
