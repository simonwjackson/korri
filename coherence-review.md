# Coherence Review: stream startup/preflight/handoff plan

## P1 — Resolve resolution/FPS startup semantics before implementation

**Issue:** The plan simultaneously presents `floor..startup..ceiling` as applying to every adaptive lever, says startup quality is used during launch/establish, but leaves resolution/FPS startup behavior as an implementation-deferred open question while also prescribing tests/examples.

**Evidence:**
- R1/R2 include `--fps` and `--resolution` in the extended grammar and require startup to be inside the floor/ceiling box (`plan.md:25-27`).
- R5 says Moonlight launch resolution/FPS define the practical runtime envelope (`plan.md:29`).
- Scope says not to claim startup resolution/FPS can be lower than ceiling and later exceed the launch envelope (`plan.md:46`).
- Key decisions say bitrate startup can be launch bitrate, but resolution/FPS ceiling usually must remain the launch envelope (`plan.md:94`).
- The plan still defers whether resolution/FPS startup should be accepted or restricted to same-as-ceiling examples (`plan.md:117`).
- U1 requires parsing `resolution=640x360..1280x720..1920x1080` (`plan.md:187`), U2 only tests same-as-ceiling resolution startup (`plan.md:229`), and the risk mitigation says examples should keep startup resolution/FPS equal to ceiling for now (`plan.md:467`).

**Why it matters:** Implementation agents can reasonably choose different behaviors: reject lower resolution/FPS startup, accept it but launch at startup, launch at ceiling and immediately runtime-downshift during establishing, or parse it but warn/ignore it. Those produce different launch envelopes and user-visible semantics.

**Suggested fix:** Make the v1 rule explicit in Requirements and U2. For example: “For Moonlight v1, bitrate may have `startup != ceiling`; resolution/FPS three-part values are parsed for boundary completeness, but Moonlight launch composition uses `ceiling` as the envelope. If `startup != ceiling`, either reject it for launch commands or apply it only as a post-launch establishing target with an explicit warning/observability field.” Then update U1/U2 tests, CLI examples, the open question, and the risk mitigation to match that single rule.

## P1 — Define whether preflight may lower an explicit startup value

**Issue:** The merge precedence says explicit CLI/policy boundaries outrank preflight, but the same section says preflight may “lower startup for safety.” The tests only forbid preflight from raising an explicit startup, leaving lowering ambiguous.

**Evidence:**
- Key decisions: preflight can choose defaults or a safer startup inside explicit/user policy, while explicit ceilings remain authoritative (`plan.md:96`).
- U2 says explicit CLI/user boundaries have higher precedence than preflight-derived defaults (`plan.md:219`).
- U4 merge order is `defaults < preflight profile < explicit CLI/policy boundaries`, but then says preflight may fill missing startup/floor values or lower startup for safety and must not override user-pinned values (`plan.md:304`).
- U4 test only says preflight cannot raise explicit `6m`, not whether it may lower it (`plan.md:316`).

**Why it matters:** A poor-link preflight with `--bitrate=500k..6m..40m` could either launch at the user’s explicit `6m`, silently clamp below `6m`, warn and continue, or fail when preflight is required. Those are materially different launch behaviors.

**Suggested fix:** Add a small precedence table for each value source: default, policy, preflight, explicit range endpoint, and scalar pin. State whether preflight may lower only missing/default/policy startup values, or whether safety may clamp explicit startup. If explicit startup is hard, define poor-preflight behavior as warning or required-mode refusal rather than silent lowering. Add tests for “explicit startup + poor preflight” in both optional and required modes.

## P2 — Separate configured floor from absolute/playable panic floor

**Issue:** The plan uses “floor,” “playable floor,” “configured floor,” and “absolute panic floor” as if they are sometimes the same target and sometimes different targets.

**Evidence:**
- R9 says floor remains a low, responsive profile such as `640x360 / 30fps / 500kbps` (`plan.md:33`).
- The high-level graph labels the early downshift target as “Immediate playable-floor dispatch” (`plan.md:140`).
- U3 says floors remain binding during establish and the controller must shed toward floor (`plan.md:260`).
- U5 says dispatch goes to configured floors/playable targets (`plan.md:348`).
- U5 also says if the configured floor is above the absolute panic floor, downshift respects the configured floor (`plan.md:362`).

**Why it matters:** Agents can implement early downshift to the user-configured floor even when it is too high to be a rescue profile, or to an absolute panic/playable floor despite an explicit configured floor. That changes the safety behavior when the link is degrading.

**Suggested fix:** Introduce distinct terms and use them consistently, e.g. `configuredFloor` for the user/policy lower adaptive bound and `panicFloor`/`playableFloor` for the emergency rescue target. Then state which one U3 establishing shed, U5 early downshift, and the existing shed/emergency path must use. Add tests for “configured floor above panic floor” that assert the intended target.

## P2 — Clarify whether handoff hints can hold recovery without degraded health

**Issue:** The handoff signal language clearly says hints must not be the only reason for downshift, but it is less clear whether hints alone can force or extend a stabilization hold.

**Evidence:**
- Key decisions say route/interface events may reduce the evidence threshold but must not be the only reason for a downshift (`plan.md:98`).
- U5 says optional `StreamHandoffSignal` hints can reduce thresholds or force a stabilization hold “when corroborated” (`plan.md:346`).
- U5 tests only state that a route/interface hint with healthy metrics does not immediately panic (`plan.md:360`); they do not state whether it can suppress upward recovery or extend stabilization.

**Why it matters:** One implementation could record healthy route-change hints without affecting control, while another could keep the stream pinned low after a route hint even when health is good. Both satisfy “does not immediately panic,” but they create different recovery behavior.

**Suggested fix:** Define the handoff state machine explicitly: e.g. “A hint alone records context only; it may lower thresholds or extend stabilization only when paired with degraded/stale health or an active post-downshift stabilization window.” Add a test for “healthy metrics + route hint during recovery” that asserts whether upward recovery is allowed or held.
