# Scope Review Findings

## P1 — U4 smuggles in a new probe transport/service

**Evidence:** U4 proposes “a transport/capability seam that obtains those facts from the source,” may modify `product/apps/portal/api/stream/prepare.rpc-handler.ts`, and may modify `product/systems/nixos/images/source-machine.nix` “if a source-side probe listener/service is required.”

**Why it matters:** This turns “lightweight preflight launch-quality selection” into a source-machine capability/service rollout, which is close to a transport redesign and can dominate the startup grammar slice.

**Suggested fix:** Split U4 into two phases. Keep this plan’s U4 to a pure classifier plus preflight facts obtainable through existing launch/prepare/RPC paths. Defer any new source-side probe listener, Nix service, or capability protocol to a follow-up item with its own scope and validation.

## P2 — U5 over-expands handoff into telemetry/controller redesign

**Evidence:** U5 includes new early-downshift evidence across RTT slope, jitter/variance, delivery ratio, FPS collapse, queue/decode pressure, stale health, tick interruption, post-downshift stabilization, recovery gating, and possible changes to `stream-health.ts` / `stream-health-monitor.ts`.

**Why it matters:** The requirement is bounded to health-driven early downshift with optional hints. Adding new health dimensions and phase machinery risks redesigning the adaptive controller instead of consuming the existing `stream-handoff-trigger` and recovery path.

**Suggested fix:** Bound U5 v1 to existing health fields and existing recovery-supervisor serialization. Only add new trend/freshness fields when a named test proves the current health model cannot trigger early enough. Defer queue/decode-pressure expansion and broader stabilization policy tuning to follow-up.

## P2 — Resolution/FPS startup grammar is broader than current semantics

**Evidence:** U1 tests `resolution=640x360..1280x720..1920x1080`, while U2 says current Moonlight behavior usually must launch at the ceiling envelope for later growth, and the open questions defer whether resolution/FPS startup should be warned, restricted, or gated.

**Why it matters:** The plan creates startup state for levers where startup may not be applied independently. That can confuse users and force implementation work for a grammar branch with no current runtime consumer.

**Suggested fix:** For v1, make bitrate the only lever with distinct applied startup behavior. For resolution/FPS, either require `startup === ceiling` or emit an explicit validation warning/help note until Moonlight supports separate envelope-vs-initial semantics. Remove broad resolution/FPS three-part examples from implementation tests unless they assert the warning/restriction behavior.
