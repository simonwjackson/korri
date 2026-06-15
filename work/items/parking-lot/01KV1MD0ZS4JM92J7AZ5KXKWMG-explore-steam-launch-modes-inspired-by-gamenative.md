---
id: 01KV1MD0ZS4JM92J7AZ5KXKWMG
slug: explore-steam-launch-modes-inspired-by-gamenative
title: Explore Steam launch modes inspired by GameNative
origin: parked
status: To Do
priority: medium
labels:
  - steam
  - launch
  - compatibility
  - research
created: 2026-06-13
source: user
context:
  cwd: /home/simonwjackson/code/sandbox/korri
  branch: trunk
  repo: korri
  invoked_by: user
---

# Explore Steam launch modes inspired by GameNative

## Why it matters

Korri's Steam launch research has narrowed the real work: keep the proven Steam-owned + LaunchOptions path as the default, avoid re-testing dead ends, and only add the missing product seams for mode/source modeling, diagnostics, and bounded direct-launch probing. This keeps risky Steamworks-shim work out of Korri core while turning the useful GameNative/SteamTinkerLaunch lessons into small, typed Korri follow-ups.

## Acceptance Criteria

- [ ] Treat the already-proven Steam-owned path as the default baseline, not another experiment: `steam -applaunch <appid>` / `steam://rungameid/<appid>`, D-Bus readiness, and Steam `LaunchOptions` `%command%` wrapping remain the canonical route for Steamworks-heavy games.
- [ ] Add only the missing explicit launch-mode/source model: `SteamOwnedAppLaunch`, `SteamLaunchOptionsWrapper`, future `SteamCompatibilityToolWrapper`, `DirectProbe`, and user-provided advanced wrapper/standalone modes.
- [ ] Add per-AppID identity + diagnostics around that model: AppID/env/compatdata/source provenance, generated command or command segments, config source, log pointers, and a user/agent-readable explanation of why Korri chose that launch mode.
- [ ] Add bounded direct Proton/exe probing only as an opportunistic fallback path: set the known AppID/compat env, optionally create temporary `steam_appid.txt`, observe Proton/Steam logs and process lifetime, classify failure/success, and fall back to Steam-owned launch on unknown/failure.
- [ ] Persist local per-AppID launch outcomes keyed by runtime/Proton/FEX/client versions; only then consider a tiny repo-local compatibility catalog or external evidence hints.
- [ ] Keep GameNative's source-withheld `libsteambootstrap` path and Steamworks emulator/DRM-bypass tooling out of Korri core unless a future, separately approved legal/product review reopens them.

## Related

- `tools/device/steam/korri-steam-gamescope-launch.sh`
- `work/items/parking-lot/01KV1MD0ZS4JM92J7AZ5KXKWMG-explore-steam-launch-modes-inspired-by-gamenative/research/research-steam-hidden-ui.md`
- `work/items/parking-lot/01KV1MD0ZS4JM92J7AZ5KXKWMG-explore-steam-launch-modes-inspired-by-gamenative/research/research-steam-direct-proton.md`
- `work/items/parking-lot/01KV1MD0ZS4JM92J7AZ5KXKWMG-explore-steam-launch-modes-inspired-by-gamenative/research/research-compat-catalogs.md`
- `work/items/parking-lot/01KV1MD0ZS4JM92J7AZ5KXKWMG-explore-steam-launch-modes-inspired-by-gamenative/research/research-steamworks-shims-risk.md`
- `work/items/parking-lot/01KV1MD0ZS4JM92J7AZ5KXKWMG-explore-steam-launch-modes-inspired-by-gamenative/research/research-steamtinkerlaunch-wrapper-model.md`
- `work/items/parking-lot/01KV1MD0ZS4JM92J7AZ5KXKWMG-explore-steam-launch-modes-inspired-by-gamenative/research/research-steamtinkerlaunch-launch-flow.md`
- `work/items/parking-lot/01KV1MD0ZS4JM92J7AZ5KXKWMG-explore-steam-launch-modes-inspired-by-gamenative/research/research-steamtinkerlaunch-config-concepts.md`
- `work/items/parking-lot/01KV1MD0ZS4JM92J7AZ5KXKWMG-explore-steam-launch-modes-inspired-by-gamenative/research/research-steamtinkerlaunch-risks.md`
- `/tmp/steamtinkerlaunch/steamtinkerlaunch`
- `/tmp/GameNative/app/src/main/java/app/gamenative/SteamBootstrap.kt`
- `/tmp/GameNative/app/src/main/java/com/winlator/xenvironment/components/BionicProgramLauncherComponent.java`
- `/tmp/GameNative/app/src/main/java/app/gamenative/utils/BestConfigService.kt`
- `/tmp/GameNative/app/src/main/java/app/gamenative/utils/GameCompatibilityService.kt`
- `/tmp/GameNative/app/src/main/java/app/gamenative/service/SteamService.kt`

## Notes

Current Korri state / already-tried comparison:

| Technique | Korri state | Evidence / outcome |
|---|---|---|
| Steam-owned launch (`steam -applaunch <appid>` / `steam://rungameid/<appid>`) | First-class in active Steam readable-library work; empirically validated on x86/AKA; historically unreliable on ROCKNIX ARM64 desktop mode. | `steam-launch-spec.ts` parses `steam://rungameid/<appid>` and renders `steam -applaunch <appid>`; active plan `01KTWFJX...` materializes Steam desired state around this; AKA doc validates Balatro and Sonic Mania via silent Steam + LaunchOptions; ARM64 desktop doc records `steam://rungameid/2379780` accepted but not launching from desktop UI. |
| Hidden/background Steam (`-silent`, no GamepadUI) | Tried and useful on x86/AKA; partially used in manual launchers; ARM64 still needs caution. | AKA doc: `steam -silent -nofriendsui -noverifyfiles` stayed unmapped under Sway and acquired runtime-launcher D-Bus in ~1.7s. Manual launcher can auto-start Steam with `steam -silent`. Fixture currently includes `extra.args: [-silent, -gamepadui]`, which is not the hidden-desktop shape and should be platform/profile-specific. |
| Steam-as-shell / GamepadUI inside Gamescope | Already tried as a reliable-but-visible fallback/session architecture, not a hidden-launch solution. | Session history found Thor spike scripts such as `start_steam_gamescope_guest.sh` documenting `sway -> gamescope --backend wayland -> steam -gamepadui` to bypass desktop X11 init crashes. This aligns with the ROCKNIX docs: reliable for Steam, but Steam owns the visible shell. |
| Per-app `LaunchOptions` `%command%` wrapper | Already modeled in v1 and validated as the safest Gamescope seam. | Fixture uses `launch-options: "gamescope --fullscreen -- %command%"`; materializer writes `localconfig.vdf`; AKA doc validated Gamescope wrapping Sonic Mania/Balatro via LaunchOptions. Korri treats `%command%` as literal Steam syntax and rejects Korri `{...}` tokens. |
| Steam compat-tool mapping | Implemented as desired state, but fresh ARM64 payload/mapping is still an open backlog item. | `steam-state-materializer.ts` writes `config.vdf` `CompatToolMapping`; `01KTYM51...` tracks fresh-install Proton 11 ARM64 payload and 30XX mapping failures. |
| Manual direct Runtime → Proton → game executable | Already tried extensively; works for IPC-light cases, but not a universal replacement for Steam-owned launch. | `tools/scripts/steam-manual-launch/launch-steam-game.sh` sets AppID/compat env, Steam Runtime, Proton, optional Gamescope, and D-Bus Steam readiness. ARM64 doc validates Balatro; x86 doc validates repeated Balatro. AKA doc shows Sonic Mania exits after ~2s through this path because Steamworks IPC is missing/insufficient. |
| Mirroring Steam's injected env / synthetic reaper wrapper | Already tried and found insufficient for Steamworks-heavy games. | AKA doc records mirroring 30+ Steam variables, `steam_appid.txt`, synthesized `steam-launch-wrapper`/`reaper SteamLaunch AppId=...`, overlay preload attempts, and Xalia disabling; none made Sonic Mania survive. |
| Steam readiness via process grep / fixed sleep | Tried and replaced, with one nuance preserved from session history. | x86 manual-launch doc shows `pgrep` was too early; current script uses `com.steampowered.PressureVessel.LaunchAlongsideSteam` D-Bus readiness. A 2026-05-26 session also recorded that the D-Bus name can be necessary but not sufficient for cold direct/manual launches: Steam's runtime launcher may be up before app API endpoints are ready, so validation should still watch Steam `content_log.txt` / `App Running` transitions and log/process outcomes. |
| SteamTinkerLaunch-style wrapper architecture | Researched; reuse narrow patterns, not STL wholesale. | Research confirms `%command%` wrapper, AppID derivation, structured command segments, per-AppID logs/config, and source-mode distinctions are useful; Korri should keep typed LaunchSpec/materializer boundaries instead of a Bash monolith. |
| GameNative Bionic/native Steam bootstrap and Steamworks shims | Researched only; excluded from Korri core. | GameNative `libsteambootstrap.so` is source-withheld/proprietary and relies on undocumented `libsteamclient.so` behavior; Goldberg/Steamless-style shims raise legal/DRM/product risks. |
| Compatibility catalog / external evidence import | Not implemented; backlog only. | GameNative-style best-config catalogs and Deck Verified/ProtonDB/Lutris/Heroic/STL hints can seed expectations, but Korri should prefer local probe outcomes and keep any catalog tiny/curated first. |
| Structured LaunchSpec segments / direct-probe cache / failure classification | Mostly not implemented yet. | Existing `LaunchSpec` is command/args/env/cwd only; STL/GameNative research motivates segment modeling, AppID identity resolver, per-AppID diagnostics, classification, and durable probe cache. |

Reduced actionable ranking after comparing against proven Korri work: 1 finish/productize the canonical Steam-owned + `%command%` LaunchOptions baseline already in active Steam readable-library work, including platform/profile-specific hidden-vs-GamepadUI args; 2 add explicit launch mode/source + structured command/diagnostic metadata around that baseline; 3 add AppID identity resolution and per-AppID diagnostics; 4 add bounded direct Proton/exe probe + failure classification + Steam-owned fallback; 5 persist local probe outcomes and only then add a tiny curated compatibility catalog/external evidence hints; 6 keep user-provided advanced wrappers behind explicit opt-in; 7 keep Steamworks shim/native bootstrap research excluded from Korri core.

Deferred but preserved details from the larger research list and `~/.pi` session-history pass:

- **Readiness/validation beyond a single signal:** D-Bus runtime-launcher ownership is the floor and replaces `pgrep`, but session history captured cold-start cases where it was not enough by itself. Use Steam `content_log.txt` app-state transitions, process/log observation, and bounded settle/probe logic for direct/manual launches and smoke tests.
- **Richer structured LaunchSpec segments:** keep the SteamTinkerLaunch lesson that a useful explanation may need original argv/env, Steam Runtime/reaper, compatibility-tool runtime, Proton/Wine/native adapter, executable, game args, host wrappers, sidecars, and diagnostics/log targets. The reduced list does not require all of these immediately, but it should not collapse back into opaque shell strings.
- **Typed capability/conflict graph:** preserve the future need to model Gamescope, MangoHud/MangoApp, Steam Runtime, ReShade/vkBasalt-style overlays, sidecars, and Steam Deck/Game Mode foreground constraints as composable capabilities with conflicts, not ad-hoc wrapper ordering.
- **Direct-launch failure taxonomy:** when direct probing lands, classify outcomes into actionable buckets such as missing executable, missing compatdata, missing AppID, launcher-only, Steam client required, license/DRM failure, Proton/FEX/runtime crash, instant exit, and live game process.
- **External evidence policy:** Deck Verified, ProtonDB, Lutris, Heroic, Bottles, SteamTinkerLaunch, and GameNative-style catalogs are hints only. Local Korri observations should dominate compatibility decisions.

Research findings: Valve documents `steam -applaunch <appid>` and `steam://run/<appid>`, but there is no stable headless-Steam contract. `-silent` is best effort; `-no-browser` and `-noreactlogin` are deprecated/removed. LaunchOptions `%command%` wrappers are a strong fit for Korri because Steam still resolves entitlement, Proton, and the game command while Korri owns Gamescope/session wrapping. Direct Proton launch should be treated as opportunistic and probed, not assumed; minimum envelope includes consistent AppID env, compatdata path, client install path, Proton invocation, and optional temporary `steam_appid.txt`. Proton `lsteamclient` bridges to Steam; it does not replace Steam services. No reliable static detector exists, so Korri should resolve metadata, run bounded probes, classify logs/process outcomes, cache evidence, and fall back to Steam-owned launch. GameNative appears to rely on a server-side best-config/game-runs catalog plus Steam metadata heuristics and user/container flags; it does not robustly auto-detect whether no-Steam launch works. Steamworks emulators, DLL replacement, Steamless, and GameNative's source-withheld `libsteambootstrap.so` should stay out of Korri core.

SteamTinkerLaunch findings: STL confirms the narrow `%command%` wrapper contract is legitimate prior art: Steam expands the real game command, the wrapper records original argv/env, derives AppID, composes host tools like Gamescope/MangoHud/Steam Linux Runtime, then execs/waits with per-AppID logs. STL also distinguishes native LaunchOptions mode from Proton compatibility-tool mode; Korri should keep launch source/mode explicit rather than treating all launch strings equally. Useful concepts to reuse are per-AppID launch profiles, typed capability/conflict rules, structured command segments, config provenance, and diagnostics. Do not mimic STL wholesale: it is a large Bash monolith with dependency downloads, GUI waiters, mod-manager/tool sprawl, Steam VDF heuristics, brittle `%command%` parsing, Steam Deck/Game Mode issues, and Steam Runtime/container assumptions. Korri should remain a small deterministic wrapper plus typed LaunchSpec/probe/cache machinery.
