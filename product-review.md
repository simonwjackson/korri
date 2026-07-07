# Product strategy findings

## P1 — Default path can still miss the playable-first outcome

**Risk:** The plan says preflight selects safe startup defaults before Moonlight starts, but U4 leaves the first implementation “gated or opt-in.” If users launching remote Moonlight streams with high ceilings must know to opt into preflight or manually provide `floor..startup..ceiling`, the core failure mode can still ship: a high-quality launch floods the link before rescue works.

**Evidence:** R6 frames preflight as the launch-time safety mechanism; U4 says preflight control “may be gated or opt-in”; U4 verification says preflight should prevent launching into a high-bitrate choke.

**Suggested fix:** Make the safe startup behavior default for remote Moonlight stream launches when a high ceiling is present and no explicit startup is supplied. If preflight capability exists, run it by default; if it fails or is unavailable, fall back to a conservative playable startup with a visible warning. Keep explicit opt-out / `required` modes, but do not make “safe launch” depend on users discovering a new flag.

## P2 — Generic startup for resolution/FPS risks teaching a false mental model

**Risk:** The plan models `floor..startup..ceiling` for every lever, but also notes Moonlight resolution/FPS cannot reliably grow beyond launch envelope. Exposing resolution/FPS startup symmetrically makes the CLI look like “start low, later reach ceiling,” which is exactly the behavior the plan cannot promise yet.

**Evidence:** R2 applies startup semantics to adaptive levers generally; R5 and the scope boundary acknowledge the launch-envelope constraint; U1 includes a `resolution=640x360..1280x720..1920x1080` parse case; the open question defers whether to warn/restrict resolution/FPS startup.

**Suggested fix:** Decide this in the plan, not during implementation. For v1, make bitrate the only promoted startup lever. For resolution/FPS, either require startup == ceiling or emit a targeted warning/error explaining that the ceiling is the launch envelope and runtime growth above it is not available. Update CLI help/examples to show resolution/FPS as envelope plus emergency floor, not as true pretty-later startup.

## P2 — “Not hacky” needs visible reason codes, not just better internals

**Risk:** The design correctly makes stream health primary and route/interface hints secondary, but the UX requirement is about how the behavior feels. If a stream downshifts right after a network event and the surface only says “handoff/downshift,” users may still experience it as a black-box heuristic even if the implementation was health-driven.

**Evidence:** R7 says to avoid brittle SSID/device-name heuristics; U5 allows hints to reduce thresholds; U6 only requires “last preflight/downshift decision” and phase state, without a user-facing reason taxonomy or evidence summary.

**Suggested fix:** Add explicit reason fields to CLI/RPC state and human output: e.g. `reason=health_degradation`, `hintRole=corroborated|ignored|stabilization_hold`, and the top evidence metrics that crossed threshold. Include tests where a healthy route/interface hint is shown as ignored or non-triggering, and where a hint-assisted downshift shows both the hint and the health evidence that made it legitimate.
