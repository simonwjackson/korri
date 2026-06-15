---
title: feat: Add Steam integration baseline defaults
type: feat
status: completed
date: 2026-06-15
origin: work/items/active/01KV67D8AY9932A49HMJ6KEPD7-capability-declared-app-integrations-steam-defaults/requirements.md
verify_command: "bun test product/platform/library/config/app-integrations.test.ts product/platform/library/config/readable-cascade-resolver.test.ts product/platform/library/config/app-materializer.test.ts product/platform/stream/gamescope-launch-spec.test.ts"
---

# feat: Add Steam integration baseline defaults

## Summary

Add the first capability-declared built-in app integration slice by making an explicitly configured Steam app record inherit Steam baseline defaults from product code. The Phase 1 baseline is intentionally small: Steam defaults to Gamescope, and the resulting launch path wraps the Steam session itself rather than rewriting per-game Steam LaunchOptions.

---

## Problem Frame

Korri can already fold launch policy through the readable cascade, and it already has a built-in app descriptor registry for first-class integrations such as RetroArch. Steam currently has a kind/integration identity, but it does not have a built-in baseline descriptor, so users or image authors must know which Gamescope behavior is appropriate and manually encode it. Recent Bandai validation proved that the safe Steam default is Steam-inside-Gamescope; per-game Gamescope LaunchOptions wrapping is parked because it breaks Stray/Steam Input.

---

## Requirements Trace

- R1-R3: Use an internal capability-declared built-in integration path, not a parallel config mechanism.
- R4: App-scoped user configuration must be able to disable the Steam Gamescope baseline.
- R5: Activation must be possible from any config-producing layer. This plan defines Phase 1 activation as presence of an `apps.steam` app record from user, image, or profile-provided config.
- R6-R9: The Steam baseline enables Gamescope only, maps to Steam-inside-Gamescope, does not use per-game LaunchOptions rewriting, and does not choose resolution/FSR/MangoHud tuning.
- R10-R13: Keep this phase independently useful while leaving runtime inclusion, RetroArch, and plugin marketplace work for later phases.

---

## Scope Boundaries

- Do not build a dynamic plugin loader, marketplace, or third-party install lifecycle.
- Do not add Jellyfin/media integration or RetroArch integration in this slice.
- Do not make Steam runtime/package inclusion part of Phase 1.
- Do not add new public plugin configuration syntax; activation is through the existing `apps.steam` app record path.
- Do not re-enable `korri-steam-gamescope-launch` or per-game Steam LaunchOptions Gamescope wrapping as a default.
- Do not add default resolution, FSR, MangoHud, or detailed Gamescope tuning.
- Do not change Steam state preservation, EULA/interstitial handling, diagnostics, or lifecycle reaper behavior.

### Deferred to Follow-Up Work

- Phase 2: runtime-inclusion capability for Steam, including what image/profile composition should install or enable.
- RetroArch as the next proving case for baseline-default integrations.
- A fuller plugin system with installable/user plugins, contribution manifests, RPC namespaces, and UI/media/catalog capabilities.
- Explainability/debug output that shows which integration contributed a default.

---

## Context & Research

### Relevant Code and Patterns

- `product/platform/library/config/app-integrations.ts` owns the built-in app descriptor registry and `resolveAppDescriptor` merge behavior. This is the natural Phase 1 seam for an internal built-in Steam integration baseline.
- `product/platform/library/config/readable-cascade-resolver.ts` folds app-level Gamescope policy into `ReadableResolvedLaunchContext.gamescope`, then the existing runner wraps the resolved launch spec around that policy.
- `product/platform/library/config/inheritable-fields.ts` already models `GamescopePolicy.steam.enableIntegration`; no public field needs to be invented.
- `product/platform/stream/gamescope-launch-spec.ts` already renders Steam Gamescope integration from policy into Gamescope flags and wraps the child command after `--`.
- `product/platform/library/config/app-materializer.ts` materializes Steam to a normal Steam `-applaunch` spec and carries the resolved context separately; Gamescope wrapping remains outside Steam LaunchOptions.
- `product/services/device/game-stream-runner.ts` consumes resolved launch intents and applies `composeGamescopeLaunchSpec` around the app command at execution time.
- `tools/device/steam/korri-steam-gamescope-launch.sh` is parked/experimental and must stay out of the default path.

### Institutional Learnings

- `docs/solutions/architecture-patterns/steam-inside-gamescope-preserves-steam-input-2026-06-15.md`: Steam-inside-Gamescope preserved Stray controls; per-game Gamescope wrapping did not.
- `docs/handoffs/steam-launchoptions-wrapper-parked-2026-06-15.md`: the per-game LaunchOptions wrapper is explicitly parked and only opt-in/experimental.
- `docs/solutions/design-patterns/explicit-cascade-folded-policy-over-incidental-signal-heuristics-2026-05-27.md`: launch behavior should come from explicit cascade-folded policy, not argv/env heuristics.
- `docs/solutions/architecture-patterns/architectural-posture-as-nix-image-default-2026-05-27.md`: image/profile posture belongs at the image/profile layer, not as surprising bare module defaults.
- `docs/solutions/architecture-patterns/korri-plugin-architecture-2026-06-02.md`: future plugin capabilities should be explicit and should not bypass host-owned seams.

### External Research

External research was skipped. The plan is anchored in existing Korri cascade code and Bandai-specific Steam validation rather than external plugin-framework conventions.

---

## Key Technical Decisions

- **Use the existing built-in app descriptor seam for Phase 1.** It already contributes app-scoped launch defaults into the readable cascade, matching R3 without a parallel mechanism.
- **Make Steam explicitly activatable by app record presence.** Unlike always-available built-ins such as RetroArch, Steam's baseline should apply when an `apps.steam` record exists. This lets user config, image config, or profile config activate the integration without adding a new public plugin config surface.
- **Represent capability declaration internally, not as public plugin syntax.** A small internal capability marker such as baseline defaults is enough for this phase and keeps the future plugin direction visible without implementing the future plugin runtime.
- **Use existing Gamescope policy, not a new mode field.** Steam-inside-Gamescope is achieved by Steam's baseline Gamescope policy and the existing launch composer; do not introduce a public `gamescope.mode` field.
- **Default only the minimum Steam Gamescope behavior.** The Steam baseline should enable Gamescope and Steam integration, but leave resolution, scaling, overlays, and detailed tuning unset.
- **Define user override as app-scoped override.** The override lane for this phase is an explicit `apps.steam` Gamescope override. General user-level Gamescope policy is less specific than the app layer in the current cascade and should not be treated as the Steam-specific disable switch.

---

## Implementation Units

### U1. Add an explicit built-in Steam integration baseline

**Goal:** An `apps.steam` record can omit repeated command/Gamescope boilerplate and still resolve as a Steam integration with a minimum Gamescope baseline.

**Requirements:** R1, R2, R3, R5, R6, R9, R10, R13

**Files:**
- Modify: `product/platform/library/config/app-integrations.ts`
- Modify: `product/platform/library/config/app-integrations.test.ts`

**Approach:**
- Add an internal capability concept to app descriptors for the baseline-defaults contribution. Keep it private to the built-in app integration layer unless implementation discovers an existing equivalent.
- Add a Steam built-in descriptor that supplies Steam identity, command default, empty args, and the minimum Gamescope baseline.
- Give Steam an explicit activation rule: the built-in descriptor contributes only when an `apps.steam` record exists or another existing app-resolution input explicitly configures Steam. Do not make a Steam app appear from thin air in configs that never opted into Steam.
- Preserve existing built-in behavior for RetroArch/MAME/Dolphin/Solarus.

**Test scenarios:**
- Happy path: resolving `steam` with an `apps.steam` record that supplies Steam state but no command returns a Steam integration descriptor with the built-in command and baseline Gamescope policy.
- Happy path: the descriptor declares the baseline-defaults capability.
- Override: an app-scoped `apps.steam` command override still replaces the built-in command.
- Override: an app-scoped `apps.steam` Gamescope override with Gamescope disabled replaces the built-in Steam Gamescope baseline.
- Edge case: resolving `steam` with no `apps.steam` record still fails or stays inactive according to the explicit activation rule, so merely having code support for Steam does not silently activate it.
- Regression: existing built-in app resolution tests for RetroArch and other built-ins continue to pass.

---

### U2. Prove Steam baseline defaults flow through the readable cascade

**Goal:** The resolved readable launch context carries Steam's integration-provided Gamescope default through the same cascade path as every other app-level policy.

**Requirements:** R2, R3, R4, R5, R6, R7, R9, R10, R12

**Files:**
- Modify: `product/platform/library/config/readable-cascade-resolver.test.ts`
- Modify only if required by tests: `product/platform/library/config/cascade-resolver.ts`

**Approach:**
- Add focused readable-cascade tests around Steam, using the existing snapshot fixture style.
- Keep the production cascade code unchanged if the built-in app descriptor seam already produces the desired result.
- If the current app-record merge is not enough, make the smallest localized change in app resolution rather than adding a new cascade layer.
- Document through tests that the explicit Steam override path is app-scoped user/image config.

**Test scenarios:**
- Happy path: a Steam release using an active `apps.steam` app record resolves with Gamescope enabled and Steam integration enabled.
- Minimum-default path: the resolved Steam Gamescope policy contains no default resolution, scaling filter, FSR, MangoHud, or detailed tuning from the integration baseline.
- Override: `apps.steam` with Gamescope disabled resolves to disabled Gamescope for Steam.
- Precedence: an app-scoped Steam Gamescope override wins over the integration baseline.
- Known cascade behavior: a generic user-level Gamescope setting does not act as the Steam-specific override because app-level defaults are more specific; the test should make this behavior explicit so future implementers do not infer the wrong override lane.
- Regression: existing readable cascade order tests still pass for RetroArch and non-Steam releases.

---

### U3. Guard the Steam-inside-Gamescope launch shape and parked-wrapper boundary

**Goal:** Prove the Phase 1 default produces a normal Steam app launch that is wrapped by Gamescope outside Steam, not a per-game Steam LaunchOptions wrapper.

**Requirements:** R7, R8, R9, R10

**Files:**
- Modify: `product/platform/stream/gamescope-launch-spec.test.ts`
- Modify: `product/platform/library/config/app-materializer.test.ts`
- Modify only if required by tests: `product/platform/stream/gamescope-launch-spec.ts`
- Modify only if required by tests: `product/platform/library/config/app-materializer.ts`

**Approach:**
- Add a focused Gamescope launch-spec test for the minimal Steam policy: Gamescope wraps the Steam command and renders the Steam integration flag before the child-command separator.
- Add an app-materializer regression test showing Steam materialization still returns a normal Steam `-applaunch` spec and does not synthesize a per-game LaunchOptions wrapper when the only new input is the integration Gamescope baseline.
- Keep Steam LaunchOptions materialization behavior unchanged unless a user or release explicitly supplies LaunchOptions.

**Test scenarios:**
- Happy path: composing a Steam launch with the Steam Gamescope baseline returns a Gamescope command whose child command is Steam with `-applaunch <appid>`.
- Happy path: the Steam integration flag is present in the Gamescope args for the Steam session.
- Boundary: no argument or materialized VDF value contains `korri-steam-gamescope-launch` solely because the integration baseline is active.
- Boundary: no default resolution, FSR, or MangoHud args are emitted by the Phase 1 Steam baseline.
- Regression: existing structured Gamescope flag rendering and disabled-Gamescope behavior still pass.

---

### U4. Keep image/runtime integration out of Phase 1 while preserving the runway

**Goal:** Make the Phase 1 implementation safe to ship without solving runtime inclusion, while leaving a clear follow-up seam.

**Requirements:** R5, R10, R11, R12, R13

**Files:**
- Modify only if required by implementation: `product/platform/library/config/app-integrations.ts`
- No expected changes: `product/systems/nixos/modules/korri-steam.nix`
- No expected changes: `tools/device/steam/korri-steam-gamescope-launch.sh`

**Approach:**
- Do not add a NixOS runtime-inclusion option in this slice.
- Do not change `services.korri.steam.enable` semantics.
- Do not change the parked per-game wrapper option.
- If code comments are added, keep them in source near the built-in Steam descriptor and describe only the Phase 1 activation and defaulting boundary.

**Test scenarios:**
- Regression: `korri-steam-gamescope-launch` remains parked/experimental and is not referenced by the new Steam baseline tests.
- Regression: existing Steam module checks still pass without changing bare module defaults.
- Follow-up readiness: the internal capability declaration is narrow enough that a future runtime-inclusion capability can be added without changing the meaning of baseline-defaults.

---

## Verification Plan

Targeted unit tests:

```bash
bun test product/platform/library/config/app-integrations.test.ts \
  product/platform/library/config/readable-cascade-resolver.test.ts \
  product/platform/library/config/app-materializer.test.ts \
  product/platform/stream/gamescope-launch-spec.test.ts
```

Optional module regression if any Nix files are touched unexpectedly:

```bash
nix build .#checks.x86_64-linux.korri-steam-module
```

Known baseline: whole-repo `just typecheck`, `just test-unit`, and `just lint` may be red on unrelated pre-existing issues. Use targeted tests as the primary gate for this slice unless implementation touches broader surfaces.

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Steam becomes active merely because it exists in the built-in registry | Add an explicit activation rule and a test proving no `apps.steam` record means no active Steam integration. |
| User override semantics are misunderstood | Add tests for app-scoped Steam override and document that as the explicit disable lane for Phase 1. |
| A new public `gamescope.mode`-style field sneaks in | Keep implementation on existing `GamescopePolicy` fields and add no public mode field in this slice. |
| Per-game wrapper code gets reintroduced through LaunchOptions materialization | Add materializer/launch-spec tests proving the baseline does not reference `korri-steam-gamescope-launch`. |
| Phase 1 overreaches into runtime inclusion | Keep Nix module changes out of scope unless tests reveal a strictly necessary regression fix. |
| Future plugin architecture becomes harder because Phase 1 is too one-off | Add a tiny internal capability declaration now, but do not implement plugin loading or marketplace behavior. |

---

## Outstanding Questions

### Resolved During Planning

- **Where should Phase 1 defaults enter the cascade?** Through the existing built-in app descriptor/app-record merge seam, not a new public cascade layer.
- **How is Steam integration active in Phase 1?** Presence of an `apps.steam` app record from user, image, or profile-provided config activates the Steam built-in baseline.
- **Which launch path consumes the baseline?** The normal resolved launch intent carries Gamescope policy, and the existing Gamescope composer wraps the Steam app/session outside Steam.
- **Should Phase 1 define runtime inclusion?** No; it remains a deferred capability.

### Deferred to Implementation

- [Affects U1][Technical] Whether the internal activation rule is best represented as a descriptor property, helper function, or small local predicate in the existing app-integration resolver.
- [Affects U2][Technical] Whether any existing tests need fixture updates once Steam can resolve command defaults from the built-in descriptor.

### Deferred to Follow-Up Planning

- [Affects Phase 2][Technical/Product] What exact runtime-inclusion capability should own for Steam packages, services, uinput preparation, and image/profile composition.
- [Affects RetroArch follow-up][Technical/Product] Whether RetroArch should use the same activation rule or a different one because it already exists as an always-available built-in descriptor.
