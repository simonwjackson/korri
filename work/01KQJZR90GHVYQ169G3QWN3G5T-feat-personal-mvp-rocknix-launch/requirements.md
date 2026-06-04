---
date: 2026-05-02
topic: personal-mvp-scope
---

# Korri Personal MVP — Scope and Seams

## Problem Frame

Korri has one declared JTBD (`safe-game-resume`), two `planned` features (`home`, `resume`) tied to it, and substantial investment in theme, navigation, and layout primitives. **Nothing in the codebase actually launches a game.** The launcher is a beautifully decorated empty box.

The goal is "launch a game in the system as quickly as possible" for a **personal MVP** — single user (the developer), single device (AYN Odin 2 Portal handheld running ROCKNIX nightly). Eventual destination is **Korri OS** (a minimal Linux + Korri image owning the entire frontend stack), with a NixOS x86 PC as the next platform after Odin/ROCKNIX.

This brainstorm scopes the smallest shippable slice that closes the loop from "open Korri" to "game running" — and explicitly defers everything else, including additional JTBDs, until real friction demands them.

## Requirements

**Scope discipline**

- R1. **No new JTBD is authored in this MVP.** `safe-game-resume` is the only declared job. The MVP ships SGR end-to-end.
- R2. The "off-rail pick-and-play" moment (finding a game *not* in the player's recent activity; placeholder name `find-a-game-not-in-recents`) is acknowledged as a future job but not authored. Per `AGENTS.md`, only durable user jobs revealed by real work warrant a job doc; that friction has not yet been hit.
- R3. The MVP audience is **the developer alone, on the Odin 2 Portal**. Other devices, other users, and onboarding UX are deferred.

**Library source**

- R4. The MVP library data source is the existing **ROCKNIX gamelist.xml** files at `/storage/games-{internal,external}/roms/<system>/gamelist.xml`. The system catalog (paths, default emulator, default core, launch template) comes from `/storage/.config/emulationstation/es_systems.cfg`.
- R5. The adapter that reads these files is **thin, throwaway, and isolated**. It populates the existing `GameRecord` schema (`korri/shared/fixtures/games/game.ts`) plus a per-game launch spec. The rest of the codebase must not import or know about `gamelist.xml`, `es_systems.cfg`, or any ROCKNIX path.

**Launch mechanism**

- R6. Launch is performed by **shell-exec'ing ROCKNIX's existing `runemu.sh`**, using the same form ES uses:

    ```
    /usr/bin/runemu.sh <ROM> -P<SYSTEM> --core=<CORE> --emulator=<EMULATOR>
    ```

    Per-game `<CORE>` and `<EMULATOR>` come from the gamelist/system defaults the adapter resolves. `--controllers="..."` is omitted for MVP unless verification during planning shows it is required.
- R7. Korri must **not extend, patch, or improve `runemu.sh` or any ROCKNIX-owned config**. Per the "wrap, don't extend" discipline, Korri delegates strictly.
- R8. Launch success/failure is determined solely by `runemu.sh`'s exit code (matches SGR-O5). Process watching, log scraping, or detection of in-game state is out of scope.

**Architectural seams**

- R9. Two seams are introduced in product code, designed for the Korri OS / NixOS endpoint, not for ROCKNIX's quirks:
  - **`LibrarySource`** — produces `GameRecord[]` plus a per-game launch spec.
  - **`Launcher`** — accepts a launch spec, executes it, returns success/failure.
- R10. The ROCKNIX adapter implements both seams. No other product code references `gamelist.xml`, `es_systems.cfg`, `runemu.sh`, or any `/storage/` path.
- R11. The seams are deletable: when proseql lands, `LibrarySource` swaps; when Korri OS lands, `Launcher` swaps to a Korri-owned per-system invoker. Neither shape bends to accommodate ROCKNIX.

**Home surface**

- R12. The home is a **single horizontal rail of tiles, ordered by `lastplayed` descending** (Switch-style). The leftmost tile is SGR's "obvious continuation target."
- R13. The home does **not** show systems-as-categories, alphabetical lists, or any catalog-shaped grouping. (See *Strategic Positioning* below.)
- R14. Games not in the player's recent activity have **no path on the home** for MVP. Workaround: the player launches them once outside Korri (ES, SSH); they then appear in the rail. This gap is intentional and named as a future job.
- R15. The rail reuses the existing Shift atomic stack (`ShiftHomeRail`, `ShiftHomePosterTile`, `ShiftHomeFeatureTile`, `ShiftHomeRoot`, `ShiftHome.context`). No new molecules or organisms are introduced for MVP.

**Failure handling**

- R16. If `runemu.sh` exits non-zero, Korri shows a clear failure state on the same home surface and offers a retry affordance. The player remains anchored on the same tile (SGR-O5).
- R17. Korri logs the launch command and exit code via `@shared/logger`. In-emulator failure (the game ran but crashed internally) is not Korri's responsibility for MVP.

## Success Criteria

- On the Odin 2 Portal, opening Korri shows a single rail populated from real `gamelist.xml` data on the device — not fixtures.
- The leftmost tile is the most recently played real game.
- Pressing confirm on any tile invokes `runemu.sh`, the game runs to playable state, and Korri reports launch success.
- A failed launch (e.g., wrong path, missing emulator) leaves the player on the same tile with a retryable error.
- The full flow — open Korri → press confirm → game running — completes in under 5 seconds excluding emulator boot time.
- `rg` across `korri/products/**` and `korri/shared/**` finds no references to `gamelist.xml`, `es_systems.cfg`, `runemu.sh`, or `/storage/` outside the single ROCKNIX adapter module.

## Scope Boundaries

**In scope**

- ROCKNIX `gamelist.xml` + `es_systems.cfg` adapter (one module).
- `LibrarySource` and `Launcher` interfaces.
- Real data populating the existing Shift home rail.
- Shell-exec of `runemu.sh` per game.
- Launch failure surface + retry on the home.

**Out of scope (deferred to future jobs/features)**

- Off-rail pick-and-play (search, "all games" library view, browse-by-anything).
- `proseql` integration as a `LibrarySource`.
- NixOS x86 PC adapter.
- Korri OS / replacing `runemu.sh` / Korri-owned per-system launchers.
- First-run / onboarding UX (MVP assumes the library is already on the device).
- Cross-device awareness (already named in SGR's outcomes; not built yet).
- Source-aware launch (Steam, GOG, native; `runemu.sh` handles this today).
- Save sync / progress safety beyond what `runemu.sh` provides.
- Library editing, scraping, metadata correction, screenshot capture.
- Settings, store, profiles, friends, achievements, controller config.
- Public-grade error messaging and recovery flows.

## Key Decisions

- **No new JTBD for MVP.** The conversation surfaced "pick-and-play" as a candidate, but the single-rail home design collapses pick-and-play and SGR onto the same rendering, and the off-rail gap doesn't yet hurt enough to warrant a job doc. Per `AGENTS.md`, jobs are written when work reveals durable intent — not speculatively.
- **Wrap ROCKNIX, don't extend it.** The adapter is throwaway scaffolding. Korri inherits ROCKNIX's per-system emulator/core/controller knowledge for free, then walks away from it once Korri OS owns that layer.
- **Single recency rail (Switch-style).** The MVP home embodies Korri's organizing principle: one rail, ordered by player meaning (recency), with the leftmost tile as the resume target.
- **Two seams, designed for the endpoint.** `LibrarySource` and `Launcher` target the Korri OS / NixOS shape. The ROCKNIX adapter conforms to the seams; the seams never bend the other way.
- **Launch is a shell exec, not a structured operation.** `runemu.sh` is the universal entry point on ROCKNIX. Korri composes a command string and execs it. Structured launch info (`{ executable, args, cwd, env }`) is deferred until Korri OS owns launching directly.

## Interpretation of SGR Outcomes Under Personal MVP

SGR declares five outcomes; threshold outcomes are pass/fail. This MVP must state how each is satisfied (or vacuously satisfied) so "ship SGR end-to-end" is not a hand-wave.

- **SGR-O1 — Progress safety (threshold).** *Vacuously satisfied for personal MVP.* The supported pre-launch sync set is empty (single device, no other Korri instance); the launcher cannot be "unsure" about a device that doesn't exist. Korri does not make progress safety worse than ES does — it delegates to `runemu.sh`, which inherits the system's existing save behavior. The non-vacuous interpretation (multi-device sync, explicit confirmation when uncertain) lands when a second Korri-running device exists; that's a future job, not MVP.
- **SGR-O2 — No re-decision (threshold).** Satisfied by R12: leftmost tile of the recency rail is the continuation target.
- **SGR-O3 — Low-friction resume (optimizing).** Satisfied by R12 + R15: single rail, single confirm, reusing existing Shift atoms.
- **SGR-O4 — Explicit launch control (threshold).** Satisfied implicitly: Korri does not auto-launch; every launch requires confirm on the focused tile.
- **SGR-O5 — Retry failed handoff (threshold).** Satisfied by R16 + R17.

When the second device lands (NixOS x86), SGR-O1 stops being vacuous and the corresponding sync work becomes the natural next slice.

## Strategic Positioning (north star, not requirement)

> **Korri organizes games by player meaning, not by catalog metadata.** Not by system. Not alphabetically. By recency, affinity, session context, intent. Rejecting systems-first and A-Z mental models is the entire impetus for building Korri instead of using EmulationStation or Steam.

Future feature decisions should be skeptical of any framing that imports a catalog-shaped mental model (system rails, A-Z grids, source/provider selectors as primary navigation). Such framings may be reasonable for *importing* data, but never for *organizing* the player's view.

## Dependencies / Assumptions

- **Verified during this brainstorm:**
  - The Odin device responds at `root@192.168.1.104` and runs ROCKNIX nightly (`OS_BUILD="nightly"`, `BUILD_DATE="Tue Apr 28 10:53:20 UTC 2026"`).
  - `gamelist.xml` files exist with rich `lastplayed` / `playcount` / `gametime` / `favorite` data — the rail will not be empty on first Korri launch.
  - Every system in `es_systems.cfg` uses the *same* `runemu.sh` invocation template; Korri does not need per-system launch logic at MVP.
  - The existing `GameRecord` schema maps closely to `gamelist.xml`'s fields; only launch info is missing and needs to be added (likely as a sibling to `metadata` and `userData`).
- **Unverified, must be checked during planning:**
  - That `runemu.sh`'s exit code is a reliable signal of launch success across systems (needs at least one smoke test).
  - That Korri (built via Electrobun or otherwise) can be launched on the Odin while ES is not the active foreground, and behaves correctly when the game exits and Korri returns to the foreground.
  - Whether `--controllers="..."` can be omitted from the launch command without breaking certain emulators.
  - Whether games carry per-game emulator/core overrides in `gamelist.xml` (vs. only system defaults from `es_systems.cfg`).

## Future Job Candidates (named, not authored)

Placeholders so deferrals are explicit. These are *not* job docs and the names are deliberately unstable — actual job statements emerge when the work reveals them.

- `find-a-game-not-in-recents` — the off-rail pick-and-play moment.
- `tell-korri-about-my-games` — populating the library on platforms without ES (NixOS x86, future Korri OS).
- `set-up-korri-the-first-time` — first-run UX for non-developer users.
- `connect-a-source` — Steam, GOG, emulator-as-system integration.
- `manage-emulator-installs` — when Korri OS replaces ROCKNIX's emulator install layer.
