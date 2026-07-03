---
id: 01KWMEQA5G7MV3RQWD0T16SV88
slug: stage-2-retire-nix-on-rocks-swaydeviceconfig-substrate-expos
title: "Stage 2: retire nix-on-rocks swayDeviceConfig; substrate exposes neutral display facts, Korri renders all Sway"
origin: parked
status: To Do
priority: medium
labels:
  - korri
  - nix-on-rocks
  - compositor
  - sway
  - display
  - architecture
  - cross-repo
created: 2026-07-03
source: se-work
---

# Stage 2: retire nix-on-rocks swayDeviceConfig; substrate exposes neutral display facts, Korri renders all Sway

## Why it matters

Architectural boundary: the ROCKNIX substrate (nix-on-rocks) must not know or care about Sway — Korri chose Sway and should own 100% of Sway rendering. Today nix-on-rocks violates this: each deviceProfile exposes `config.rocknix.<chip>.display.swayDeviceConfig`, a STRING of literal Sway directives (`output DSI-2 transform 90`, `input type:touch map_to_output DSI-2`, `output DSI-1 transform 270` on Odin, etc.), which Korri splices verbatim into its compositor config. This leaks a Korri implementation detail (that it runs Sway) into the substrate, and forces Korri to string-parse that blob to recover structured facts (see the `lib.hasInfix \"DSI-2\" swayDeviceConfig` inference that Stage 1 left as a transitional bridge). Video and audio already do this correctly: the substrate exposes NEUTRAL facts (`rocknix.sm8550.video.decodeBackend`, `...audio.api`) and Korri consumes them. Display is the odd one out. Fixing it removes the last Sway leak, lets Korri render transforms/outputs/touch-maps itself, and lets the by-compatible image drop the hasInfix inference.

## Acceptance Criteria

- [ ] nix-on-rocks deviceProfiles expose structured, Sway-free display facts (primary connector, per-connector rotation, touch mapping)
- [ ] Korri renders all Sway output/transform/touch/power directives from those neutral facts; no korri file consumes a Sway string from the substrate
- [ ] The resolvedHomeOutput hasInfix inference in rocknix-sm8550.nix is deleted; homeOutput derives from the neutral primaryConnector
- [ ] swayDeviceConfig is removed from nix-on-rocks
- [ ] by-compatible SM8550 image renders correct per-device Sway without string inference
- [ ] sm8550 config-check no longer asserts Thor's DSI-1 transform for Odin; per-device rotation is locked from the neutral facts

## Related

- `product/systems/nixos/modules/korri-compositor.nix`
- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`
- `product/systems/nixos/flake/products.nix`
- `product/systems/nixos/flake/rocknix-platform.nix`
- `tools/testing/nix/korri-rocknix-sm8550-config-check.nix`
- `nix-on-rocks:guest/modules/chipsets/sm8550/default.nix`
- `nix-on-rocks:guest/profiles/devices/odin2portal.nix`
- `01KVTQ7FRZXJT5G8T84911YYTJ`

## Notes

STAGE 1 (DONE, korri trunk commit c65487ba) — context a fresh reader needs:
- Introduced a Korri-owned 'home output' concept = the primary display's DRM/KMS connector name (Thor -> DSI-2, Odin 2 Portal -> DSI-1). It is NOT a Sway concept; it is a neutral connector name.
- Where it lives now (all in korri repo):
  * product/systems/nixos/flake/products.nix: each product declares `homeOutput` (thor=DSI-2, odin2portal=DSI-1; by-compatible omits it => null).
  * product/systems/nixos/flake/rocknix-platform.nix: `platformFor` passes `homeOutput = product.homeOutput or null` into the platform adapter.
  * product/systems/nixos/images/platforms/rocknix-sm8550.nix: outer arg `homeOutput ? null`; computes `resolvedHomeOutput` = homeOutput if set else `if lib.hasInfix \"DSI-2\" sm8550.display.swayDeviceConfig then \"DSI-2\" else \"DSI-1\"` (THE bridge to delete in Stage 2). Sets `services.korri.compositor.homeOutput`, and routes gamescope `preferredConnectors` + Steam `gamescopePreferOutput` through resolvedHomeOutput.
  * product/systems/nixos/modules/korri-compositor.nix: options `homeOutput` (nullable), `hubWorkspace` (default korri:hub), `gameWorkspace` (default korri:game:active). When homeOutput != null it appends `workspace <hub> output <homeOutput>` + `workspace <game> output <homeOutput>` to the generated sway config so the primary panel boots straight onto the hub lane.
  * product/systems/nixos/images/kiosk.nix: KORRI_SESSIOND_{HUB,GAME}_WORKSPACE now read compositorCfg.hubWorkspace/gameWorkspace (single source of truth shared with sessiond).
  * rk3566/rk3326 adapters accept `homeOutput ? null` (unused) for a uniform signature.
- Tests: tools/testing/nix/korri-rocknix-sm8550-config-check.nix locks Thor->DSI-2, Sobo(Odin)->DSI-1, the shared-lane-names invariant, and that Moonlight's gamescope preferredConnectors == compositor.homeOutput per device.

STAGE 2 WORK (cross-repo: nix-on-rocks + korri):
1. In nix-on-rocks, add NEUTRAL structured display facts to each sm8550 deviceProfile (and ideally the shared chipset default), e.g. `rocknix.sm8550.display.primaryConnector` (\"DSI-2\"/\"DSI-1\"), per-connector rotation as a value/enum (Thor DSI-2=90, Odin DSI-1=270), secondary/unused connectors, and touch->connector mapping as data. NONE of these may contain Sway syntax.
   - Substrate source lives at /home/simonwjackson/code/sandbox/nix-on-rocks (locked rev in korri flake.lock: node 'nix-on-rocks'). Relevant files: guest/modules/chipsets/sm8550/default.nix (Thor chipset default swayDeviceConfig), guest/profiles/devices/odin2portal.nix (Odin override), guest/modules/display.nix.
2. In korri, replace consumption of `sm8550.display.swayDeviceConfig` with rendering Sway FROM the neutral facts: korri-compositor (or the sm8550 platform adapter) generates the `output <c> transform <deg>` / `input type:touch map_to_output <c>` / power-off lines itself.
3. Delete the `resolvedHomeOutput` hasInfix bridge in rocknix-sm8550.nix; set homeOutput (and everything else) straight from the neutral `primaryConnector`. This finally makes the by-compatible image correct without string inference.
4. Remove `swayDeviceConfig` from the substrate once no korri consumer references it.
BONUS latent bug to fix along the way: the shared sm8550 platform file still hardcodes DSI-2/DSI-1 in the bottom-keyboard toggle script (rocknix-sm8550.nix ~lines 205-222) and the `hasInfix` power-off (~line 738); these are dual-panel(Thor)-specific and are wrong/luck-dependent on single-panel Odin. Route them through the neutral facts too.
TEST NOTE: korri-rocknix-sm8550-config-check.nix has a pre-existing mislabel — `checkSystem \"Odin 2 Portal\" thorSystem` actually runs against Thor, and `checkSystem \"Sobo\" soboSystem` runs against Odin; there are 3 pre-existing failures on trunk (2x tailnet MagicDNS, 1x \"Sobo: Bandai DSI panel keeps the known-good rotation\" which wrongly asserts DSI-1 transform 90 for Odin). Fix that DSI-rotation assertion as part of moving rotation into neutral facts.
