# Research: Steam-on-Linux compatibility catalogs and evidence sources

## Summary
Korri should treat Steam launch compatibility as an evidence-weighted catalog rather than a single truth source. The strongest small cache starts with Steam AppID identity plus launch metadata, then layers Valve Deck Verified status, ProtonDB community outcomes, and optional per-game runner/config recipes from Lutris, Heroic, and Bottles.

## Findings
1. **Use AppID as the primary key, but keep source-specific identifiers.** Steam-native evidence, Deck Verified metadata, ProtonDB summaries, and local appinfo all key naturally by Steam AppID; Lutris/Heroic/Bottles often key by slug, store id, executable, or prefix path. Korri should store `steamAppId` as the canonical key when present, plus `sourceIds` for `lutrisSlug`, `heroicAppName`, `gogId`, `egsNamespace`, and local executable fingerprints. [Steamworks Steam Deck compatibility docs](https://partner.steamgames.com/doc/steamdeck/compat), [ProtonDB](https://www.protondb.com/)

2. **Deck Verified is the best first-party compatibility signal, but it is not a launch recipe.** Valve classifies titles as `Verified`, `Playable`, `Unsupported`, or `Unknown`; review checks include input, display, seamlessness, and system support. The result is useful for confidence and warnings, but does not expose the exact Proton version, environment, or command-line needed to launch a game. Korri should cache category, test timestamp if available, human-facing notes/issues, and the raw source payload for later re-interpretation. [Steam Deck compatibility process](https://partner.steamgames.com/doc/steamdeck/compat), [Steam Deck Verified overview](https://www.steamdeck.com/en/verified)

3. **ProtonDB is the strongest community outcome signal.** ProtonDB ranks games by tiers such as Platinum/Gold/Silver/Bronze/Borked based on user reports, with report details often including Proton version, distribution, GPU/driver, kernel, launch options, and workarounds. Korri should cache both the rolled-up tier and a reduced report summary: most recent successful Proton versions, common launch options, reported regressions, sample size, and last report date. Treat the public API/endpoints as unofficial unless Korri has explicit permission or consumes a documented export. [ProtonDB](https://www.protondb.com/), [ProtonDB game example](https://www.protondb.com/app/620)

4. **Steam local appinfo is the authoritative installed-app launch metadata.** Steam appinfo contains per-app `common`, `config`, `depots`, and `launch` sections, including launch executables, arguments, operating-system filters, branches, and compatibility-tool-relevant metadata. It is not a compatibility rating, but it tells Korri what Steam believes it can launch and which OS-specific launch entries exist. Korri should cache normalized launch entries: `executable`, `arguments`, `oslist`, `type`, `workingDir`, branch/depot context, and the local appinfo change number/hash. [SteamKit2 SteamApps/PICS APIs](https://github.com/SteamRE/SteamKit), [Valve KeyValues format](https://developer.valvesoftware.com/wiki/KeyValues), [DepotDownloader app/depot tooling](https://github.com/SteamRE/DepotDownloader)

5. **Lutris contributes install/runner recipes, not universal rankings.** Lutris installer scripts describe runner choice, files, installer tasks, Wine configuration, dependencies, environment variables, DLL overrides, and launch command shape. For Steam games this can identify known prerequisites or workarounds, but recipes may target non-Steam installers or stale runners. Korri should ingest only explicit, structured recipe facts and keep source timestamps/version ids so stale recipes do not override newer Deck/ProtonDB evidence. [Lutris installer documentation](https://github.com/lutris/lutris/blob/master/docs/installers.rst), [Lutris website/API source](https://github.com/lutris/website)

6. **Heroic and Bottles are useful models for per-game/per-prefix overrides.** Heroic exposes per-game settings for Wine/Proton version, prefix, launch arguments, environment variables, DXVK/VKD3D toggles, wrappers, and store-specific launch behavior. Bottles models a bottle as an environment with runner/components/dependencies plus program entries and installers. Korri can copy the shape, not the storage: separate immutable game evidence from user-selected local overrides like preferred Proton, prefix path, Gamescope options, MangoHud, env vars, and wrapper command. [Heroic Games Launcher repository](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher), [Heroic Game Settings wiki](https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/wiki/Game-Settings), [Bottles documentation](https://docs.usebottles.com/), [Bottles programs repository](https://github.com/bottlesdevs/programs)

7. **Rank compatibility as source-weighted evidence with recency and locality.** A practical Korri rank can be derived from: first-party Deck category, ProtonDB tier and sample count, local successful launches, local failed launches, known workarounds, and appinfo launch availability. Suggested internal states: `KnownGood`, `LikelyGood`, `NeedsTweak`, `Unknown`, `KnownBad`, plus separate `confidence` and `reasons`. Do not collapse user overrides into global compatibility; a game may be globally `NeedsTweak` but locally `KnownGood` with a recorded Proton version and launch options.

8. **Store raw evidence separately from normalized summaries.** Every source changes format and meaning over time. Keep `rawPayload`, `fetchedAt`, `sourceVersion`/ETag where available, and `normalizerVersion`; expose only a small normalized view to the launcher. This lets Korri rebuild rankings when its scoring changes without refetching every source.

## Recommended Korri compatibility cache fields
- Identity: `steamAppId`, `name`, `sourceIds`, `installedPath`, executable fingerprints when available.
- Steam launch metadata: launch entries, OS filters, args, working directory, branch/depot/appinfo version/hash.
- First-party compatibility: Deck category, notes/issues, test timestamp, source payload.
- Community outcome: ProtonDB tier, score/confidence, report count, last report date, recent successful Proton versions, common launch options/workarounds.
- Recipe evidence: Lutris/Heroic/Bottles runner, prefix, dependencies, env vars, DLL overrides, DXVK/VKD3D settings, command wrappers, recipe version/date.
- Local observed outcomes: last launch status, exit code/signal, wrapper used, Proton version, Gamescope mode, duration-to-ready, error class, log pointers.
- User override layer: selected compatibility tool, env, args, Gamescope/MangoHud options, prefix path, controller/profile notes.
- Ranking summary: `compatibilityState`, `confidence`, `reasons[]`, `warnings[]`, `lastEvaluatedAt`, `normalizerVersion`.

## Sources
- Kept: Steamworks Steam Deck compatibility docs (https://partner.steamgames.com/doc/steamdeck/compat) — primary Valve source for Deck Verified categories and review criteria.
- Kept: Steam Deck Verified overview (https://www.steamdeck.com/en/verified) — user-facing explanation of Verified/Playable/Unsupported/Unknown states.
- Kept: ProtonDB (https://www.protondb.com/) — primary community compatibility catalog for Proton outcomes.
- Kept: ProtonDB Portal 2 example (https://www.protondb.com/app/620) — concrete AppID-keyed report page showing the shape of community evidence.
- Kept: SteamKit2 (https://github.com/SteamRE/SteamKit) — widely used Steam protocol/library source for PICS/appinfo-style product metadata access.
- Kept: Valve KeyValues wiki (https://developer.valvesoftware.com/wiki/KeyValues) — format reference relevant to VDF/appinfo parsing.
- Kept: DepotDownloader (https://github.com/SteamRE/DepotDownloader) — practical tooling around Steam app/depot metadata.
- Kept: Lutris installer docs (https://github.com/lutris/lutris/blob/master/docs/installers.rst) — primary structured description of Lutris installer script fields.
- Kept: Lutris website/API source (https://github.com/lutris/website) — source for Lutris catalog/API behavior.
- Kept: Heroic Games Launcher repository (https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher) — implementation source for Heroic game settings and launch config storage.
- Kept: Heroic Game Settings wiki (https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/wiki/Game-Settings) — practical per-game setting surface.
- Kept: Bottles documentation (https://docs.usebottles.com/) — primary docs for Bottles concepts and configuration.
- Kept: Bottles programs repository (https://github.com/bottlesdevs/programs) — structured program/install recipe source.
- Dropped: SEO articles and forum posts about individual Proton fixes — too game-specific and stale for catalog design.
- Dropped: SteamDB pages as primary evidence — useful manually, but not an official redistributable API for Korri.

## Gaps
- Web search rate limiting prevented full live verification of current undocumented endpoint behavior. Before implementation, verify whether Korri may legally/cacheably consume ProtonDB and Steam Deck compatibility endpoints, and prefer documented APIs or locally user-owned Steam metadata.
- Steam Deck compatibility payload details can change; build the importer as best-effort raw evidence capture plus versioned normalization.
- Need a follow-up prototype against a small AppID set to compare Deck category, ProtonDB tier, appinfo launch entries, and real local launch outcomes.
