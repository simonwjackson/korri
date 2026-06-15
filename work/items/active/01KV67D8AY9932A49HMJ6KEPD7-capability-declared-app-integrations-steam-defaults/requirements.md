---
date: 2026-06-15
topic: capability-declared-app-integrations-steam-defaults
---

# Capability-Declared App Integrations and Steam Defaults

## Summary

Define a phased built-in integration model that can grow toward a plugin system without requiring one up front. Phase 1 makes Steam tangible: when the Steam integration is active, Steam launches default to Gamescope using the Steam-inside-Gamescope behavior, while explicit user configuration always wins.

---

## Problem Frame

Korri already has a cascading configuration system, but first-class app support needs a natural way to contribute baseline defaults without forcing users to manually copy product knowledge into their own config. Steam is the immediate forcing case: recent Bandai validation showed a better out-of-box Steam experience requires Gamescope around the Steam session itself, not per-game LaunchOptions rewrites.

The broader product direction is modular. Steam should be the first example of a built-in integration that contributes well-scoped capabilities now and can later grow into richer plugin-style behavior. The first step should avoid building a marketplace or arbitrary extension runtime before the cascade-defaults problem is solved.

---

## Actors

- A1. Player/operator: Uses a Korri image or personal config and expects first-class apps to behave well without hand-tuning every default.
- A2. Image/profile composer: Chooses which integrations are active for a given image shape, such as minimal, retro-focused, or full-featured.
- A3. Integration author: Defines what a built-in app integration contributes to Korri, starting with baseline defaults and expanding through later capabilities.
- A4. Planner/implementer: Turns these product requirements into concrete cascade and launch behavior without inventing new product semantics.

---

## Key Flows

- F1. Steam integration supplies a baseline
  - **Trigger:** A product image, profile, or user configuration activates the Steam integration.
  - **Actors:** A1, A2
  - **Steps:** Korri evaluates the existing cascade; the Steam integration contributes its baseline defaults; no user Gamescope setting is required.
  - **Outcome:** Steam launches default to Gamescope using the Steam-inside-Gamescope behavior.
  - **Covered by:** R1, R2, R3, R5, R6

- F2. User override wins
  - **Trigger:** A user explicitly configures Steam not to use Gamescope.
  - **Actors:** A1
  - **Steps:** Korri evaluates user configuration above the Steam integration baseline; the explicit user value replaces the integration default.
  - **Outcome:** Steam launches follow the user override rather than the integration baseline.
  - **Covered by:** R4, R5

- F3. Future integration capability grows in phases
  - **Trigger:** Korri later adds runtime inclusion, RetroArch defaults, or broader plugin-style capabilities.
  - **Actors:** A2, A3, A4
  - **Steps:** A later phase adds a new declared capability without changing the meaning of the Phase 1 defaults capability.
  - **Outcome:** The integration model remains usable after Phase 1 and can be resumed incrementally.
  - **Covered by:** R7, R8, R9, R10

---

## Requirements

**Integration model**

- R1. Korri must define built-in app integrations as capability-declared contributors, not as arbitrary code that can bypass product-owned seams.
- R2. Phase 1 must include a baseline-defaults capability: an active integration can contribute default values into the existing cascade.
- R3. Integration-provided defaults must use the same cascade path as other defaults; they must not create a parallel configuration mechanism that planning or users have to reason about separately.
- R4. Explicit user configuration must always override integration-provided defaults, including the ability to disable the Steam Gamescope default.
- R5. Integration activation must be possible from an image/profile layer or a user configuration layer, with the same baseline behavior once active.

**Steam Phase 1 behavior**

- R6. When the Steam integration is active and the user has not configured Steam Gamescope behavior, Korri must default Steam launches to use Gamescope.
- R7. Steam's default Gamescope behavior must be the controller-safe Steam-inside-Gamescope shape: Gamescope wraps the Steam app/session, and Steam launches its games normally.
- R8. Steam's Phase 1 default must not rewrite per-game Steam LaunchOptions as the default mechanism.
- R9. Steam's Phase 1 default must not require choosing a resolution, FSR policy, MangoHud policy, or other detailed Gamescope tuning.

**Phasing and future direction**

- R10. Each phase must end in a usable product state; Phase 1 must deliver tangible Steam default behavior even if later phases are never implemented.
- R11. The model must be shaped so a later phase can add runtime-inclusion capabilities for Steam, but Phase 1 must not depend on resolving that runtime design.
- R12. The model must be shaped so RetroArch can become a later proving case for the same integration-default mechanism.
- R13. The model may move toward a fuller plugin system over time, but Phase 1 must not require a dynamic plugin marketplace, third-party plugin loading, or installable plugin lifecycle.

---

## Acceptance Examples

- AE1. **Covers R2, R3, R6, R7.** Given the Steam integration is active and the user has not configured Steam Gamescope behavior, when a Steam app is launched, Steam runs with Gamescope by default using the Steam-inside-Gamescope behavior.
- AE2. **Covers R4.** Given the Steam integration is active and a user explicitly disables Steam Gamescope behavior in their config, when a Steam app is launched, Korri follows the user override instead of the integration baseline.
- AE3. **Covers R5, R6.** Given a full-featured image profile activates the Steam integration, when a user boots that image without personal Steam config, Steam still receives the integration's baseline Gamescope default.
- AE4. **Covers R3, R8.** Given a Steam game has native Steam LaunchOptions, when the Steam integration baseline enables Gamescope, Korri does not use per-game LaunchOptions rewriting as the default way to apply Gamescope.
- AE5. **Covers R9.** Given the Steam integration is active, when no user or image profile sets resolution or overlay policy, Phase 1 still succeeds by only supplying the minimum Steam Gamescope default.

---

## Success Criteria

- A user or image profile can enable Steam integration and get the validated Steam-inside-Gamescope default without manually configuring Gamescope.
- A user can disable or override the Steam Gamescope default through the normal cascade, without special-case escape hatches.
- Planning can implement Phase 1 without inventing a full plugin runtime, marketplace, or third-party extension model.
- The requirements leave a clear runway for later runtime-inclusion and RetroArch phases without making them prerequisites.

---

## Scope Boundaries

- Phase 1 does not build a dynamic plugin marketplace or third-party plugin loader.
- Phase 1 does not implement Jellyfin or media-library integration.
- Phase 1 does not require Steam runtime/package/service inclusion; that is a later phase.
- Phase 1 does not add Steam discovery, diagnostics, EULA/interstitial handling, lifecycle reaper behavior, UI affordances, or state-preservation behavior.
- Phase 1 does not make per-game Steam LaunchOptions Gamescope wrapping the default.
- Phase 1 does not commit to a public configuration field beyond the behavior that Steam has Gamescope enabled by default when the integration is active.
- RetroArch is not part of Phase 1; it is a later proving case for the same model.

---

## Key Decisions

- Capability-declared integrations first; full plugin system later: This keeps the first slice small while making the direction explicit.
- Steam is the first integration: Steam has a concrete validated need and a clear Phase 1 success condition.
- Steam Gamescope means Steam-inside-Gamescope by default: Bandai validation showed this preserves controller input, unlike per-game Gamescope LaunchOptions wrapping.
- User overrides always win: Integration defaults are product baselines, not mandatory behavior.
- Runtime inclusion is deferred: It is important, but it should be designed as its own phase rather than blocking the baseline-defaults slice.

---

## Dependencies / Assumptions

- Korri's existing cascade can accept an additional integration-provided baseline layer without changing user-facing override semantics.
- The Steam launch path can interpret the Steam Gamescope baseline as Steam-inside-Gamescope without requiring a new public mode field.
- Image/profile composition is allowed to activate integrations for different product shapes, such as minimal, retro-focused, or full-featured images.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R1-R5][Technical] Where exactly should integration-provided baselines enter the existing cascade so that user config reliably wins?
- [Affects R6-R8][Technical] Which existing Steam launch path should consume the Steam Gamescope baseline and enforce the Steam-inside-Gamescope behavior?
- [Affects R11][Technical] What should the runtime-inclusion capability own in Phase 2, and how should it interact with image/profile composition?
