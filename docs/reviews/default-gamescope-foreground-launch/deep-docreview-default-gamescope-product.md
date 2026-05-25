# Product/Strategic Review — Default Gamescope Foreground Launch Plan

Reviewed plan: `docs/plans/2026-05-24-007-feat-default-gamescope-foreground-launch-plan.md`  
Origin: `docs/brainstorms/2026-05-24-002-default-gamescope-foreground-launch-policy-requirements.md`

## Findings

### P1 — Two-surface policy creates a narrow opt-out gap for local Moonlight

**Evidence**
- Origin requires narrow opt-outs: “Gamescope policy follows the existing broad-to-specific launch cascade: global/default policy can be overridden by host-machine/system, launcher, game, profile/preset, or launch-time override policy.”
- Origin AE3 says: “Given a game inherits Gamescope enabled and a selected preset disables it, when that preset is launched, the preset opt-out wins.”
- Plan changes that behavior for remote stream launches: “Local Moonlight policy is host-local and does not inherit remote game presets.”
- Plan test scenario makes the split explicit: “remote game/preset opt-out disables the remote runner wrapper but does not automatically disable local Moonlight wrapping.”

**Product impact**
For a player, one “launch game” action can now run two Gamescope policies. That may be technically correct, but it weakens the origin’s simple mental model that the narrowest game/profile/preset opt-out fixes a problematic launch. If the problematic surface is local Moonlight, the plan appears to require a broader host/client opt-out or an unspecified local launch override, increasing configuration cognitive load.

**Suggested fix**
Add an explicit plan decision and acceptance scenario for the two-surface opt-out contract. Either:
1. provide a narrow local-client override path that can be selected for a specific launch/profile without disabling all Moonlight on the host, or
2. explicitly update the plan/origin language to say game/profile/preset opt-outs apply only to the remote game-runner surface, while local Moonlight opt-outs live at local host/client/launch-override scope.

Also extend U5/U8 diagnostics to show both surfaces in one launch summary: remote runner Gamescope policy and local Moonlight Gamescope policy.

---

### P2 — Remote prepare policy diagnostics may be broader than needed for first value

**Evidence**
- U2 modifies multiple external-facing surfaces: `prepare.rpc`, `server/prepare.rpc`, `remote-stream-client`, desktop bridge, and CLI paths.
- U2 says prepare responses should expose “remote runner policy diagnostics/status,” while the plan also says “local Moonlight must not use remote game policy as its host default.”
- U8 separately owns launch diagnostics: “Add concise logging/status detail at launch boundaries that reports resolved Gamescope enabled/disabled.”

**Product impact**
Because local Moonlight no longer consumes the remote policy, adding remote policy details to prepare RPC responses may be mostly diagnostic value while expanding API surface, fallback behavior, and legacy-host complexity. That increases maintenance surface before proving the default-on launch behavior works.

**Suggested fix**
Narrow U2 to the behavior needed for launch correctness: write normalized remote runner policy into the intent and make CLI preparation policy-aware. Move remote prepare response policy details to U8 or defer them unless a concrete UI/debugging need requires the remote client to display them. R9 can still be satisfied initially through runner status/logs plus local launch diagnostics.
