# Deep doc review — feasibility / implementability

Plan reviewed: `../../../work/01KSBMG31W82JBVJBJ5TT15MZN-feat-default-gamescope-foreground-launch/plan.md`
Origin: `../../../work/01KSBMG31W82JBVJBJ5TT15MZN-feat-default-gamescope-foreground-launch/requirements.md`

## Findings

### P1 — Local Moonlight policy has no concrete local config source

**Issue:** U5 says local Moonlight policy should resolve on the local kiosk/client host, but the plan does not specify how the desktop/kiosk process loads that local `global`/launcher policy. The current desktop composition only wires connection state, remote prepare, input preflight, and `launchMoonlight`; it does not instantiate or inject a local library/config repository. An implementer would need to choose a new architecture for local policy storage/loading before U5 can be built.

**Evidence:**
- Plan: “Resolve local Moonlight Gamescope policy through a local foreground-client policy resolver… folds the local host's global policy, a named Moonlight/foreground-client launcher policy, and any local launch override.”
- Current desktop wiring in `korri/deploy/desktop/main.ts` passes only `prepareGame`, `preflightMoonlightInput`, and `launchMoonlight` into the launch bridge; there is no local config/library source dependency in that seam.
- `korri/deploy/desktop/create-desktop-app.ts` similarly defines `launchBridge?: LaunchBridgeOptions`, not a local policy/config source.

**Suggested fix:** Expand U5 (or add a prerequisite unit) to define the local foreground-client policy source explicitly:
- whether desktop/kiosk opens the local ProseQL config, reads a lightweight local config file, or receives policy from Nix/runtime env;
- what the canonical local foreground-client id is, e.g. `moonlight` / `foreground.moonlight`;
- what happens when no local config exists;
- which files own the loader/injection seam, likely including `korri/deploy/desktop/main.ts`, `korri/deploy/desktop/launch-bridge.ts`, and the shared library/config repository or a new policy-only config loader.

---

### P1 — Direct library launch promises preset opt-out, but its RPC cannot carry preset/user/override

**Issue:** U6 includes direct library launch in scope and tests preset opt-out, but the existing direct launch RPC payload only contains `id`. The U6 file list omits `korri/products/app/api/library/launch.rpc.ts`, so the plan does not tell the implementer to change the wire contract that would be required for preset/user/override policy resolution.

**Evidence:**
- Plan U6 test scenario: “Game or preset opt-out disables wrapping for direct launch.”
- `korri/products/app/api/library/launch.rpc.ts` currently defines `LaunchLibraryPayload` with only `{ id: Schema.String }`.
- U6 files include `launch.rpc-handler.ts`, `library-services.ts`, `session-launcher.ts`, and `sessiond.ts`, but not the RPC schema that callers use to send preset/user/override choices.

**Suggested fix:** Update U6 to make one explicit choice:
1. **If direct library launch supports presets/overrides:** add `korri/products/app/api/library/launch.rpc.ts` and relevant call sites to U6, and specify that the payload mirrors stream prepare’s `userId`, `presetId`, and `override` behavior.
2. **If direct library launch is default/game-only for this plan:** remove the preset opt-out test claim from U6 and state that direct launch only supports game/global/launcher policy until the deferred profile UI work lands.

---

### P1 — ROCKNIX library mode still lacks a path for cascade opt-outs

**Issue:** U1 says ROCKNIX library mode should return normalized Gamescope policy rather than spec-only launches, but the current ROCKNIX source does not load the cascade config at all. Simply adding a default enabled policy there would satisfy default-on, but not the origin’s opt-out requirement for host/global, launcher, game, profile/preset, or override layers when the active library source is `rocknix`.

**Evidence:**
- Plan U1 verification: “ROCKNIX and ProseQL library modes both produce policy-aware resolved launches.”
- `korri/shared/library/rocknix/rocknix-source.ts` implements `resolveLaunchForGame(id)` as: load cached specs, find the spec, and `return { spec }`.
- `korri/shared/library/library-source-layer-live.ts` routes `selectedLibrarySourceMode() === "rocknix"` directly to `source.resolveLaunchForGame(id, inputs)`, so the ProseQL `ConfigSnapshot` cascade is bypassed in ROCKNIX mode.

**Suggested fix:** Amend U1 to define how ROCKNIX mode participates in policy resolution:
- either add an overlay that combines ROCKNIX-discovered launch specs with the ProseQL/YAML config snapshot for global/launcher/game/preset/override policy;
- or explicitly scope ROCKNIX mode to default-on only and state that per-game/preset opt-outs require ProseQL mode or a follow-up overlay.

Given the origin requirement that “Any launch can opt out of Gamescope through normal resolved configuration,” the first option is the safer plan if ROCKNIX mode is expected on Sobo.

---

### P2 — Wayland exposure is acknowledged but not pinned to a deterministic rule

**Issue:** The plan correctly notes that native Wayland children may need Gamescope Wayland exposure, but it leaves detection/enablement ambiguous. Sobo Moonlight is configured with `SDL_VIDEODRIVER=wayland`, and the current Gamescope wrapper helper only adds `-f -b` plus configured args. Without a deterministic rule, implementers may either miss the required pass-through or make inconsistent per-call decisions.

**Evidence:**
- Plan decision: “When a child launch is configured for Wayland, expose Wayland through Gamescope as part of the wrapper baseline.”
- Plan U3 approach: “Wayland exposure when needed for Wayland children.”
- Existing wrapper in `tools/device/game-stream-fullscreen.ts` composes args as `['-f', '-b', ...(options.args ?? []), '--', game.command, ...game.args]`.
- Sobo platform env in `nix/images/platforms/rocknix-sm8550.nix` sets `SDL_VIDEODRIVER = "wayland"`.

**Suggested fix:** Add a small plan-time rule to U3/U4: either always include Gamescope’s Wayland exposure for local Moonlight/native-Wayland foreground launches, or define the exact policy signal that triggers it (for example launch env / local foreground-client policy). Add a test scenario that verifies the wrapper includes the Wayland exposure path for Sobo Moonlight.
