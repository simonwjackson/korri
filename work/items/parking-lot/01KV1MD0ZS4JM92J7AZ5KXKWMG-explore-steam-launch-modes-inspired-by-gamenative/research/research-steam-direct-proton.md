# Research: Direct launching Steam games through Proton/Wine without Steam UI on Linux

## Summary
Direct Proton launch is technically possible, but it is not equivalent to a Steam launch. Korri should treat it as an opportunistic per-title capability: provide the Steam/Proton identity and prefix environment, run a bounded probe, and fall back to Steam-managed launch when Steamworks, DRM, Steam Input/overlay, or Steam Runtime setup is required.

## Findings
1. **Minimum Proton direct-launch shape is AppID + compat prefix + Steam client path.** Common working invocations set `SteamAppId=<appid>`, `SteamGameId=<appid>`, `STEAM_COMPAT_APP_ID=<appid>`, `STEAM_COMPAT_DATA_PATH=<steam-library>/steamapps/compatdata/<appid>`, and `STEAM_COMPAT_CLIENT_INSTALL_PATH=<steam-root>`, then call `<Proton>/proton run|waitforexitandrun <exe>`. Steam normally supplies these values; `STEAM_COMPAT_DATA_PATH` is the prefix/compatdata root, not the inner `pfx` directory. [Valve issue example](https://github.com/ValveSoftware/steam-for-linux/issues/8103), [Protontricks README](https://github.com/Matoking/protontricks/blob/master/README.md), [ESO direct Proton example](https://steamcommunity.com/app/221410/discussions/0/3102389184720125374/?l=italian)

2. **`steam_appid.txt` solves only AppID discovery, not Steam ownership/UI dependencies.** Valve documents that direct executable/debugger launches need `steam_appid.txt` next to the executable containing only the AppID; Steam launches provide the AppID automatically. This can fix `SteamAPI_Init() failed; no appID found`, but a running Steam client is still required for Steamworks interfaces and license/account behavior. [Steamworks API overview](https://partner.steamgames.com/doc/sdk/api), [steam_api.h docs](https://partner.steamgames.com/doc/api/steam_api), [Proton issue #9556](https://github.com/ValveSoftware/Proton/issues/9556)

3. **`lsteamclient` is a bridge to Steam, not a replacement Steam service.** Proton includes `lsteamclient`, a Wine/Proton component that exposes Windows Steam client APIs and bridges toward the native Steam client library/IPC. If Steam is not running, the AppID is missing, or `steamclient.so` is not discoverable from the expected Steam install path, Steamworks-heavy games can fail even though Wine/Proton itself starts. [Proton lsteamclient tree](https://github.com/ValveSoftware/Proton/tree/proton_3.7/lsteamclient), [Proton `steamclient` path issue](https://github.com/ValveSoftware/Proton/issues/9068), [Steamworks init requirements](https://partner.steamgames.com/doc/api/steam_api)

4. **Modern launchers increasingly emulate Steam’s launch envelope instead of invoking Proton bare.** Heroic’s Proton mode uses `STEAM_COMPAT_DATA_PATH` for the configured prefix and logs launches with `STEAM_COMPAT_CLIENT_INSTALL_PATH`, `STEAM_COMPAT_APP_ID`, `SteamAppId`, and `SteamGameId`. `umu-launcher` goes further by preparing a Steam Linux Runtime/pressure-vessel-like environment and records `GAMEID`, `PROTONPATH`, `STEAM_COMPAT_TOOL_PATHS`, library paths, and Proton log behavior. [Heroic Wine/Proton wiki](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/wiki/How-To:-Wine-and-Proton), [Heroic issue launch log](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/issues/1767), [umu-launcher README](https://github.com/Open-Wine-Components/umu-launcher/blob/main/README.md), [umu FAQ](https://github.com/Open-Wine-Components/umu-launcher/wiki/Frequently-asked-questions-(FAQ))

5. **Common failure modes are recognizable in logs.** Useful signatures include `Proton: No compat data path`, `SteamAPI_Init() failed; no appID found`, `The Steam client isn't running`, `Mismatch: SteamAppId=..., STEAM_COMPAT_APP_ID=...`, missing/hardcoded `steamclient.so`, ELF-class `LD_PRELOAD` overlay errors, Steam Runtime/host library symbol mismatches, DRM/ownership failures, and short-lived processes after Wine prefix setup. [No compat path examples](https://github.com/ValveSoftware/steam-for-linux/issues/8103), [AppID failure](https://github.com/ValveSoftware/Proton/issues/9556), [Steam Runtime non-Steam failure](https://github.com/ValveSoftware/steam-runtime/issues/287)

6. **There is no reliable static test for “direct launch works.”** Tools infer viability from configured prefix/AppID/proton path and then execute the game or helper with logging (`PROTON_LOG=1`, `UMU_LOG=1`) and observe process lifetime/exit/log signatures. Protontricks can locate Steam AppID prefixes; Heroic/umu can assemble non-Steam Proton environments; neither proves a Steam store game can bypass Steam UI without actually trying it under the user’s account/runtime. [Protontricks README](https://github.com/Matoking/protontricks/blob/master/README.md), [umu README logging](https://github.com/Open-Wine-Components/umu-launcher/blob/main/README.md), [Heroic issue launch log](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/issues/1767)

## Practical implications for Korri
- Model direct Proton as a launch mode with a probe result (`Unsupported`, `Starts`, `RequiresSteamClient`, `MissingCompatData`, `SteamApiAppIdFailure`, `RuntimeFailure`, `ExitedEarly`), not as a universal replacement for Steam UI.
- Prefer the real Steam compatdata path for installed Steam games: `<library>/steamapps/compatdata/<appid>`. Do not point `STEAM_COMPAT_DATA_PATH` at `.../pfx`.
- Set AppID consistently across `SteamAppId`, `SteamGameId`, and `STEAM_COMPAT_APP_ID`; optionally create temporary `steam_appid.txt` beside the executable only during the probe/launch if Korri owns cleanup.
- Keep Steam running in the background for Steamworks-heavy titles if avoiding only the visible Steam UI is the goal. Fully Steam-less launch is likely limited to titles without Steamworks/DRM requirements.
- Strip Steam overlay `LD_PRELOAD` for host-side wrappers when invoking native gamescope/mangoapp/proton envelopes; reintroduce only what Proton/Steam Runtime expects inside its own launch environment.
- Consider delegating non-Steam direct Proton semantics to `umu-run` where available; it exists to reproduce the Steam Runtime envelope more accurately than a bare `proton run`.

## Sources
- Kept: Steamworks API Overview (https://partner.steamgames.com/doc/sdk/api) — primary source for AppID discovery and `steam_appid.txt`.
- Kept: steam_api.h documentation (https://partner.steamgames.com/doc/api/steam_api) — primary source for `SteamAPI_Init` requirements.
- Kept: ValveSoftware/steam-for-linux #8103 (https://github.com/ValveSoftware/steam-for-linux/issues/8103) — real compat env failure and fix pattern.
- Kept: ValveSoftware/Proton #9556 (https://github.com/ValveSoftware/Proton/issues/9556) — concrete no-AppID failure signature.
- Kept: ValveSoftware/Proton #9068 (https://github.com/ValveSoftware/Proton/issues/9068) — direct-launch `steamclient.so` discovery edge.
- Kept: ValveSoftware/steam-runtime #287 (https://github.com/ValveSoftware/steam-runtime/issues/287) — Steam Runtime/overlay/env mismatch example.
- Kept: Protontricks README (https://github.com/Matoking/protontricks/blob/master/README.md) — established prefix/AppID tooling behavior.
- Kept: Heroic Wine/Proton wiki and issue logs (https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/wiki/How-To:-Wine-and-Proton, https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/issues/1767) — launcher implementation evidence.
- Kept: umu-launcher README/FAQ (https://github.com/Open-Wine-Components/umu-launcher/blob/main/README.md, https://github.com/Open-Wine-Components/umu-launcher/wiki/Frequently-asked-questions-(FAQ)) — current direct Proton envelope and logging practice.
- Dropped: Reddit/Linux forum troubleshooting threads — useful corroboration but less authoritative than Valve docs/issues and launcher docs.
- Dropped: piracy/crack-oriented guides — excluded for legal/security posture and unreliable technical assumptions.
- Dropped: SEO “how to fix Proton” pages — redundant and less precise than primary issues/docs.

## Gaps
- Valve does not publish a stable, supported “launch Steam game outside Steam UI” contract; behavior may change with Steam client, Proton, and Steam Linux Runtime updates.
- Per-title DRM/Steamworks dependency cannot be known confidently from manifests alone. Next step for Korri is an executable probe harness with `PROTON_LOG=1`, bounded timeout, process observation, and log classifier for the failure signatures above.
