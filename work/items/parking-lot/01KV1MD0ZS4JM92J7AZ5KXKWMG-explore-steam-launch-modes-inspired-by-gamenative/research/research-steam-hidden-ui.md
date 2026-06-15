# Research: launching Steam games on Linux without showing the full Steam UI

## Summary
Steam does support direct game launch entrypoints on Linux (`steam -applaunch <appid>` and `steam://run/<appid>`), and Steam Launch Options can wrap the game command with `%command%`. These mechanisms can reduce Korri's visible Steam surface, but they do **not** make Steam headless: the Steam client still owns login, DRM, compatibility-tool setup, updates, cloud/conflict prompts, overlays, and may show UI when user action is required.

## Findings
1. **The official direct-launch primitive is `steam -applaunch <appid>`** — Valve's Steam command-line options document lists `-applaunch <appID> [launch parameters]` as the way to launch an installed app through the Steam client. This is applicable to Korri as the simplest “ask Steam to start AppID N” path, but it still starts/uses the Steam client and can surface login/update/error UI. [Source](https://developer.valvesoftware.com/wiki/Command_line_options_(Steam))

2. **Steam browser protocol is a common equivalent for app starts** — Valve documents `steam://` protocol commands as system-wide commands that interact with Steam and open Steam if it is not already open. `steam://run/<appid>` is commonly used by launchers/desktop files as a direct game start trigger. For Korri this is an alternative IPC-style entrypoint, not a hidden/headless mode. [Source](https://developer.valvesoftware.com/wiki/Steam_browser_protocol)

3. **`-silent` can reduce startup visibility, but it is not enough for kiosk launches** — The Steam CLI page documents startup/UI flags such as `-silent`; community reports and Valve beta notes show UI-suppression flags have changed over time. Treat `steam -silent -applaunch <appid>` as a best-effort convenience only, not a contract that the full UI will never appear. [Source](https://developer.valvesoftware.com/wiki/Command_line_options_(Steam))

4. **`-no-browser` / `-noreactlogin` are no longer reliable options** — Valve announced in the Steam Client Beta forum that support for `-no-browser` and `-noreactlogin` was ending and expected to roll out to all users in January 2023. Korri should not build around disabling Steam's CEF/browser UI. [Source](https://steamcommunity.com/groups/SteamClientBeta/discussions/3/3710433479207750727/)

5. **Launch Options wrappers are the strongest fit for Korri's current approach** — Steam Launch Options support prepending environment variables or wrapper tools and using `%command%` as the placeholder for Steam's resolved game command. Valve's Proton README points users to Steam's “Set Launch Options” field for per-game runtime configuration; SteamTinkerLaunch documents the same wrapper pattern (`tool %command%`) for native Linux games. This matches Korri's `korri-steam-gamescope-launch.sh` strategy: reconcile an AppID's LaunchOptions to call a Korri-owned wrapper, then let Steam expand and execute the real game command. [Source](https://github.com/ValveSoftware/Proton) [Source](https://github.com/sonic2kk/steamtinkerlaunch/wiki/Steam-Launch-Option)

6. **Steam Deck/Game Mode hides desktop Steam by making Steam the shell, not by launching games headlessly** — Deck-like Linux setups run Steam in a Gamescope embedded session / SteamOS-style gamepad UI. ArchWiki and community guides describe Gamescope embedded mode and SteamOS-like sessions. This pattern is useful to understand compositor/session ownership, but for Korri it is different from “launch a Steam game without Steam UI”; it replaces the desktop with Steam's UI and game session. [Source](https://wiki.archlinux.org/title/Gamescope) [Source](https://github.com/shahnawazshahin/steam-using-gamescope-guide)

7. **Constraints that matter for Korri** — Steam must be installed, logged in, entitled to the game, and usually running or startable under the target user/session. Launches may be interrupted by Steam Guard/login, first-run redistributables, EULAs, shader/precache/update work, cloud conflicts, compatibility-tool downloads, or Proton prefix creation. Localconfig/LaunchOptions edits should be done while Steam is closed because Steam owns and rewrites its VDF config.

## Applicable to Korri
- Prefer the existing **LaunchOptions wrapper** path for per-game control of Gamescope/MangoHud and host environment normalization.
- Use `steam -applaunch <appid>` or `steam://run/<appid>` as a launcher trigger when Steam should own compatibility setup and entitlement checks.
- Do not depend on `-no-browser`; treat `-silent` as best effort only.
- Keep reconciliation conservative: account-specific `userdata/*/config/localconfig.vdf`, no writes while Steam is running, careful quoting, and logging around Steam-expanded `%command%`.

## Sources
- Kept: Valve Developer Community — Command line options (Steam) (https://developer.valvesoftware.com/wiki/Command_line_options_(Steam)) — official list for `-applaunch`, `-silent`, and other Steam flags.
- Kept: Valve Developer Community — Steam browser protocol (https://developer.valvesoftware.com/wiki/Steam_browser_protocol) — official source for `steam://` protocol behavior.
- Kept: Steam Client Beta — Ending support for `-no-browser` and `-noreactlogin` (https://steamcommunity.com/groups/SteamClientBeta/discussions/3/3710433479207750727/) — Valve-hosted notice that browser-disabling flags are deprecated/removed.
- Kept: ValveSoftware/Proton README (https://github.com/ValveSoftware/Proton) — primary Proton source noting per-game runtime configuration through Steam Launch Options.
- Kept: SteamTinkerLaunch Steam Launch Option wiki (https://github.com/sonic2kk/steamtinkerlaunch/wiki/Steam-Launch-Option) — widely used Linux wrapper pattern using `%command%`.
- Kept: ArchWiki Gamescope (https://wiki.archlinux.org/title/Gamescope) — practical reference for Gamescope embedded/session constraints.
- Kept: steam-using-gamescope-guide (https://github.com/shahnawazshahin/steam-using-gamescope-guide) — Deck-like Steam-in-Gamescope pattern, useful but secondary.
- Dropped: Reddit/SEO setup posts — anecdotal or duplicative; useful only as signals that UI flags are brittle.

## Gaps
- Valve does not appear to publish a stable “hidden Steam UI” contract for Linux game launches.
- Exact `-silent` behavior may vary by Steam client version, login state, desktop environment, and whether Steam is already running.
- Steam Deck internals are only partially documented publicly; Deck/Game Mode should be treated as an observed session pattern, not a portable API.
- Next step: validate on Korri's target device with three scenarios: Steam already logged in/running, Steam closed but logged in, and Steam logged out/update-required.