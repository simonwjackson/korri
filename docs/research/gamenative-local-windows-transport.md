# GameNative as a Local-Windows Transport for Korri Android

**Date:** 2026-07-31 (research), repo state as of GameNative master pushed 2026-07-29
**Status:** Research complete — no integration built yet
**Context:** Sizing done alongside the Artemis one-APK spike (`~/code/sandbox/artemis`, branch `custom`). GameNative would be the fourth Korri transport on Android.

## TL;DR

GameNative (github.com/utkarshdalal/GameNative — GPL-3.0, Kotlin, 9.4k★, active) runs
Windows/Steam/Epic/GOG/Amazon games on-device via Winlator tech (Wine + Box64/FEXCore +
DXVK), and ships an **exported frontend intent API built for external launchers**. From
korrid's seat:

- **Launch + per-game config control: ~100% today** for the classic Winlator core
  (~40 fields), ephemeral per-launch, disk state never touched.
- **Session tracking + the modern config half (FEX, FSR, LSFG): one mechanical PR away.**
- **Install/library control: primitives exist internally, nothing exported — a
  negotiation-tier PR with a graceful blind-launch fallback.**
- **Identity (Steam Guard), Steam one-session policy, Mali vs Adreno gap: not PR-shaped.**

Recommended boundary: **separate APK driven by intent** (like RetroArch-by-intent), never
embedded. GameNative moves fast; embedding buys a fork treadmill — the opposite situation
from Artemis, which we embed precisely because upstream is frozen.

## Transport symmetry (the Korri architecture frame)

| Transport | Mechanism | Catalog owner | Presentation tuning |
|---|---|---|---|
| Sunshine stream (Artemis) | embedded runtime, typed JS bridge | korrid | SGSR1 + live edge sharpness |
| libretrodroid (8/16-bit, GBA/DS) | in-process library | korrid | shader upscale |
| RetroArch (PS1/N64/PSP) | intent + generated CONFIGFILE + UDP :55355 | korrid | shader upscale |
| **GameNative (local Windows)** | **intent + container_config JSON** | korrid | FSR1 EASU+RCAS, LSFG framegen |

Every transport takes the same shaped launch ticket: *render resolution + upscaler +
sharpness + frame-tech*. One korrid `presentation` block, per-transport translation.

## The intent API (verified from source)

```
Action:   app.gamenative.LAUNCH_GAME        (exported, MainActivity)
Extras:
  app_id            int     Steam appid (required, >0)
  game_source       string  STEAM | EPIC | GOG | AMAZON... (defaults STEAM)
  container_config  string  JSON ContainerData override, max 50KB
```

Source: `app/src/main/java/app/gamenative/utils/IntentLaunchManager.kt`,
`MainActivity.kt` (`handleLaunchIntent`).

Verified semantics:

- Override applied **in-memory only** (`applyToContainer(..., saveToDisk = false)`);
  original config snapshotted first and restored after the session. korrid cannot
  corrupt on-device state.
- **On game exit with external launch: `activity.finish()`** — returns straight to the
  caller (`PluviaMain.kt` ~line 1518, `wasLaunchedViaExternalIntent`). Update dialogs are
  suppressed in this mode. The visible hop is GameNative's XServer loading screen, not
  its library UI.
- Validation (screenSize regex, cpuList, videoMemorySize, drives) is **warn-only** —
  logs, never rejects.
- If the container doesn't exist yet, the override is stored and used at container
  creation on that launch.

## Per-game config control: exact coverage

`ContainerData` has ~80 fields. The intent parser (`parseContainerConfig`) handles ~40:

**Intent-settable today:** `screenSize` (internal render resolution — the big lever),
`envVars`, `graphicsDriver` + `graphicsDriverVersion`, `dxwrapper` + `dxwrapperConfig`
(DXVK version only — parser forces `version=` prefix), `audioDriver`, `wincomponents`,
`drives`, `execArgs`, `executablePath`, `installPath`, `showFPS`,
`launchRealSteam`/`launchBionicSteam`, `cpuList`/`cpuListWoW64` (core pinning),
`wow64Mode`, `startupSelection`, `box86Version`/`box64Version` + presets,
`desktopTheme`, `csmt`, `videoPciDeviceID`, `offScreenRenderingMode`,
`strictShaderMath`, `videoMemorySize`, `mouseWarpOverride`, `sdlControllerAPI`,
`enableXInput`, `enableDInput`, `dinputMapperType`, `disableMouseInput`,
`suspendPolicy`, `shaderBackend`, `useGLSL`.

**Not intent-settable (UI-only today):** all FEXCore knobs (TSO/X87/MultiBlock/preset —
matters on arm64ec, i.e. the Fold's path), `wineVersion`, `containerVariant`,
`emulator` (Box64 vs FEXCore), LSFG fields, sharpness fields, `useSteamInput`,
touchscreen/shooter gesture configs, `externalDisplayMode`, game `language`,
`forceDlc`, offline modes, `useLegacyDRM`, `allowSteamUpdates`, `steamType`,
`rendererPresentMode`, `displayRenderer`, `pulseaudioLowLatency`, `portraitMode`.

### Footgun: sentinel-based merge

`mergeConfigurations` compares override values against **hardcoded parse defaults**, not
field presence (`if (override.csmt != true) override.csmt else base.csmt`). Consequences:

- You cannot set a field **back to its default** if the saved container customized it.
- `suspendPolicy` override is silently ignored when a container already exists.

**Escape hatch = adopt as policy: keep saved containers vanilla; korrid ships the full
tuning profile in every launch ticket.** Base-at-defaults means every non-default
override lands and omissions correctly fall back. Imposes: users don't hand-tune inside
GameNative's UI (Korri surfaces own settings anyway).

## Scaling / FSR / frame generation

GameNative has a presentation-layer `EffectComposer` (direct sibling of Artemis' SGSR
pipeline), plus lsfg-vk:

- **Scaling modes** (`ScreenEffectsConfig.kt`): none / nearest / linear / fill /
  stretch / **FSR** / FSR-aspect / DLS / natural; FSR sharpness 1–5
  (FSR1 EASU upscale + RCAS sharpen — `com/winlator/renderer/effects/FSR1EasuEffect.java`,
  `FSR1RcasEffect.java`).
- **Post effects:** brightness/contrast/gamma, FXAA, Toon, Vivid, CRT, NTSC.
- **Frame gen:** `lsfg-vk` Vulkan implicit layer (multiplier, flow scale, performance
  mode) — **requires user owns Lossless Scaling on Steam (appid 993090)**; the app
  extracts `Lossless.dll` from it (`LsfgVkManager.kt`). Plus `bionicFg` AI frame gen.
- In-session live tuning exists (`ScreenEffectsPanel`, `LsfgQuickMenuHelper`).

**External control:** `screenSize` ✅ via intent; scaling mode/FSR sharpness/effects ❌ —
stored as **container extras** (`screenEffectsScalingMode`, `screenEffectsFsrSharpness`,
…), a separate mechanism from `ContainerData`, absent from the parser. So today korrid
can say "render at 1280x720" but not "…and FSR-upscale at sharpness 4".

## Install / library / identity control planes

| korrid wants | Today | After PR |
|---|---|---|
| launch appid X with tuning Y | ✅ full | ✅ |
| is X installed? | ❌ | ✅ query |
| install/update/verify X + progress | ❌ (blind-launch fallback: GameNative shows its own download UI once) | ✅ with progress events |
| uninstall X | ❌ | ✅ |
| session started/ended | infer from activity lifecycle | ✅ broadcasts + setResult |
| log in (Steam/Epic/GOG/Amazon) | manual, one-time per device | same forever (2FA is the point) |

Internal primitives already exist as clean companion functions in `SteamService.kt`:
`isAppInstalled(appId)`, `downloadApp(appId, dlcAppIds, branch, isUpdateOrVerify):
DownloadInfo` (has progress), `deleteApp(appId)`. Nothing exported: all services
`exported="false"`, no receivers, no content provider.

## PR plan (ranked by mergeability)

**Tier A — table extensions, ~a day each, high merge odds.** Finishing their own
frontend feature, not proposing a new one:
1. Complete the intent parser: one `if (json.has(...))` line per missing ContainerData
   field (FEX knobs, wineVersion, emulator, language, DRM/offline, lsfgEnabled…).
2. `container_extras` passthrough for screen-effects/LSFG keys; extend
   `TemporaryConfigStore` to snapshot/restore extras (<150 lines).
3. Session lifecycle: `setResult` at the external-launch `finish()` site + start/exit
   broadcasts.

Tier A alone = total per-game config control incl. FSR/LSFG + reliable session
tracking ≈ 90% of what korrid needs. Fallback if upstream stalls: carry Tier A as a
~3-commit patch-set fork — additive table rows, near-zero rebase treadmill.

**Tier B — new exported surface, needs maintainer buy-in, medium odds:**
- Install/library control (~300–500 lines). Security conversation: frame as opt-in
  "frontend control" settings toggle (off by default), possibly caller allowlist.
  Blind launch is a livable interim.
- Launcher icon suppression: activity-alias machinery already exists
  (`MainActivityAliasDefault`/`Alt`); product-opinion PR, coin flip, livable without.

**Tier C — not PR-shaped:**
- Steam Guard login ceremony (one-time manual per device).
- Steam one-session-per-account: local play + aka streaming another Steam title
  conflicts — korrid must arbitrate.
- Lossless.dll ownership for LSFG ($7 Steam app; licensing).
- Mali vs Adreno: Winlator tech is Adreno-first (Turnip/DXVK). Z Fold7
  (Adreno 830) first-class; Tab S10 Ultra (Immortalis/Mali) wrapper-driver
  second-class. Device matrix: Fold = stream + local-windows + emus;
  Tab = stream + emus.
- Separate process/APK is structural. Do not embed (fast-moving upstream = fork
  treadmill; opposite of the frozen-Artemis situation).

## Integration sizing

- **Tier-1 spike (a weekend):** korrid catalog tag for local-windows entries
  (`@korri:steam` plugin already knows the library → appid matching free), shell bridge
  `launchLocalWindows()`, intent builder with container_config from launch ticket.
  Result: catalog → GameNative XServer screen → game → exit → back to Korri shell.
  ~80% of the one-app illusion.
- **Tier-2 (a week + Tier A PRs):** full config incl. FSR/LSFG, session events.
- **Tier-3 (embed): rejected.**

## Related findings from the same session (Artemis client)

Recorded here so the whole picture lives in one place:

- **Apollo-only features gutted from the Korri settings schema** (Korri targets
  sunshine-korri exclusively; upstream strings confirm each): virtual display,
  resolution scale factor, custom refresh rate, clipboard sync (~30 call sites),
  server commands, OTP pairing, Sunshine launcher export. Code-level demolition
  deferred to the big UI gut. Loss: Apollo's client-resolution auto-match — replaced
  better by korrid launch overrides + sunshine-korri config.
- **Artemis live-settings ceiling: 14 of 38 schema settings** can apply mid-stream
  (read per-event from in-memory `prefConfig`): SGSR sharpness/threshold, scale mode,
  mouse/touch modes, flip face buttons, rumble, device rumble, PiP, back-menu enable,
  floating button, mouse emulation, touchpad-as-mouse, back-as-guide/meta, warning
  toasts. Everything else is connection-baked (no mid-stream renegotiation in any
  Moonlight descendant). Schema marks these `live: true`.
- **Full PreferenceConfiguration audit:** 113 pref keys; 38 in schema post-audit;
  remaining 73 = OSC/virtual-controller layout, clipboard, legacy migrations, niche
  hardware quirks, text-input types (schema lacks a `"text"` type — custom resolution
  is the one real future need, e.g. Fold square inner display).
- **Overlay parity:** web overlay is a superset of native GameMenu except send-keys
  and per-controller device options (both optional); server-cmds and clipboard became
  deletions when Apollo support was dropped.

## Key upstream files (for future reference)

- `app/src/main/java/app/gamenative/utils/IntentLaunchManager.kt` — parser, merge,
  temporary override store
- `app/src/main/java/app/gamenative/MainActivity.kt` — intent entry, external-launch flag
- `app/src/main/java/app/gamenative/ui/PluviaMain.kt` — finish-on-exit (~line 1518)
- `app/src/main/java/com/winlator/container/ContainerData.kt` — full config vocabulary
- `app/src/main/java/app/gamenative/ui/util/ScreenEffectsConfig.kt` — scaling modes,
  extras keys
- `app/src/main/java/app/gamenative/utils/LsfgVkManager.kt` — frame gen plumbing
- `app/src/main/java/app/gamenative/service/SteamService.kt` — install primitives
  (~lines 717, 1319, 1369)
