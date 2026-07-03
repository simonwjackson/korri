---
id: 01KWMNX6R2N1BNCY124TWH94XF
slug: stream-game-lifecycle-chord-decision-ux-never-auto-kill-remo
title: "Stream/game lifecycle chord: decision UX + never auto-kill remote game"
origin: parked
status: To Do
priority: high
labels:
  - korri
  - streaming
  - ux
  - lifecycle
  - kill-chord
  - overlay
  - spike
  - compositor
created: 2026-07-03
source: user
---

# Stream/game lifecycle chord: decision UX + never auto-kill remote game

## Why it matters

Ending a stream must not end the remote game. Most stream-ends are incidental (lid close, GUI crash, disconnect/reconnect, system restart) and should leave the game running on the source machine; only a deliberate act should stop a game. Today stream-end and game-kill are fused, which throws away progress and surprises the user. This item delivers (a) a pure-logic decoupling so incidental disconnects never kill the game, (b) a deliberate force-quit signal, and (c) a decision surface for the ambiguous case — designed to be seamless across local and streamed play. Interaction + neutral skin have been validated in a spike; this is now an execution-ready design.

## Acceptance Criteria

- [ ] Incidental stream-ends (lid close, GUI crash, disconnect/reconnect, restart) leave the remote game running — verified per case
- [ ] Long-hold chord = force-quit; it is the ONLY thing that stops a game (local game, local release, or remote). On remote it kills the game and lets Moonlight + gamescope collapse as a side effect (no orchestrated teardown)
- [ ] Short chord = a decision prompt (close stream / close game / keep playing), styled to the surface with a sane fallback
- [ ] A hold shows growing 'about to happen' feedback (filling ring); a tap shows the decision — two clearly different responses to one chord
- [ ] Local vs stream presentation is near-identical (only a small delta marks a stream)
- [ ] The decision + hold feedback are drawn by an always-available floor that does NOT depend on the heavy web UI (never silent); the web/home surface is progressive enhancement
- [ ] Phase 0 (pure-logic decoupling + long-hold force-quit) ships without any overlay work

## Related

- `work/items/parking-lot/01KWMKREE13NPZSFW4M406GAX0-design-stream-game-lifecycle-decision-ux-chord-never-auto-kil.md`
- `product/services/device/sessiond-role.ts`
- `product/apps/portal/stream`
- `product/systems/nixos/modules/korri-compositor.nix`

## Notes

ALIGNED DESIGN (validated via spike at yuki:/tmp/spikes/korri-chord-spike/index.html \u2014 interaction feels good; skin is deliberately neutral/surface-agnostic, flat monochrome + one clay accent for the deliberate quit, no glass/glow/emoji).\n\nMental model: two separate things \u2014 the STREAM (view/connection) and the GAME (process on source). Decouple them.\n\nChord semantics: hold past a threshold = global 'I'm done' force-quit (filling-ring feedback). Short tap = decision prompt (different interface). Wordings tested: local = 'Quit game' / 'Keep playing'; stream = 'Close stream' (game keeps running on aka) / 'Close game on aka' (stream ends with it) / 'Keep playing'. Hold duration is the key feel knob (spike default ~900ms, tunable).\n\nFork resolutions:\n- Short chord surfaces a prompt, styled to the surface, sane fallback when it can't render the pretty version.\n- Long hold kills the game regardless of type; remote teardown cascades from the game process dying \u2014 do NOT orchestrate Moonlight/gamescope shutdown.\n- Never fail silently: the floor always draws at least a plain ring + minimal prompt.\n\nArchitecture (floor vs enhancement): minimal always-drawable overlay = the reliable floor (candidate: lightweight compositor/layer-shell surface on the CLIENT, fast, tiny memory \u2014 CEF/web NOT required for the floor). Full web/home surface = progressive enhancement/skin on top. Same events drive both.\n\nStructure (5 separable pieces): 1) input state machine emitting press/hold-progress/hold-fired/tap events (owns tap-vs-hold); 2) floor renderer subscribing to those events; 3) enhancement surface rendering the pretty version of the same events; 4) action handlers (close stream / close game -> kill root / suspend[future]); 5) default decoupling (stream-end != game-kill) \u2014 pure logic, shippable as Phase 0.\n\nPhasing: Phase 0 = decouple + long-hold force-quit, no UI (short chord just detaches stream, game lives). Phase 1 = decision surface (floor first, then enhancement), plus Spike B: prove the always-drawable floor on aka's own sway/wlroots (no Bandai rebuild) before committing.\n\nNote: spike lives in yuki:/tmp/spikes/ (ephemeral) \u2014 promote into the repo if we want it kept.
