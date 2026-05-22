---
date: 2026-05-21
topic: korri-config-cascade
artifact: brief
---

# Korri Config Cascade

## Chosen Thing

A unified config model where games, users, systems, launchers, presets, and
collections live in one logical tree that can be split across arbitrarily-named
YAML files. A field-level inheritance cascade assembles each launch payload
from least-specific to most-specific layer. Per-layer `gamescope` policy is the
first concrete feature to ride on this model; CPU and hooks will follow with no
schema changes.

## Users and Context

Single-user-today, future multi-user. The Korri owner configures his game
library by hand-editing YAML alongside auto-generated entries (e.g. from the
ROCKNIX importer). The model serves two moments:

1. **Library curation** — adding games, launchers, presets, collections; declaring
   policy defaults at the appropriate layer.
2. **Launch time** — selecting a game, optionally a preset, optionally tweaking
   any field before pressing play.

## Goals

- Eliminate `KORRI_GAME_STREAM_USE_GAMESCOPE` and any other invisible,
  env-var-only policy knob.
- Give the user a single mental model: *the launch payload is assembled by
  walking layers; each layer contributes or stays silent.*
- Files are organizational tools, not contracts. Any layout works; the merged
  logical tree is the source of truth.
- Per-game gamescope policy (the original feature request) works as a special
  case of the general cascade.
- Schema shape supports CPU, hooks, and other future inheritable policy fields
  without breaking changes.
- Introduce `users` as a first-class layer now, even with only a `default`
  user, to avoid retrofitting later.

## Non-Goals

- Backwards compatibility with `KORRI_GAME_STREAM_USE_GAMESCOPE` or any
  other deprecated env-var. Hard cut.
- CPU policy v1 schema (coming soon; same cascade applies when ready).
- Hooks/lifecycle scripts v1 schema (coming soon; same cascade applies when
  ready).
- Romhack → base game relationship as a first-class field (`basedOn`).
  Romhacks are separate games; the relationship is expressed via `collections`
  membership.
- Smart/dynamic `collections` membership (auto-filter rules). Manual membership
  only in v1.
- Collection-level policy/preset contributions (collections as a cascade
  layer). Future, not v1.
- Save data, controller mapping, UI theme, auth, and other infrastructure
  concerns that may eventually be user-scoped but aren't config-shape concerns
  today.
- `SDL_VIDEODRIVER=x11` as an automatic default for streamed SDL games — the
  per-profile env workaround stands; the broader question is absorbed into the
  cascade and can be addressed via global or launcher-level defaults later.

## Constraints

- Proseql is the persistence layer; its object-keyed YAML pattern (`id`
  derived from key) is already established and reused. See
  `docs/solutions/best-practices/proseql-canonical-library-with-derived-yaml-ids-2026-05-06.md`.
- Proseql's `Collection` type-system terminology overlaps with the new domain
  `collections` concept. Overload is **accepted** and documented, not renamed.
- The nix module continues to own tool paths (`gamescope`, `swaymsg`) and
  runtime paths (intent, lock, status, runtime dir) as env-vars. These are not
  user-facing YAML.
- `KORRI_GAME_STREAM_SWAY_REPAIR` becomes **implicit** (true whenever resolved
  gamescope is enabled).
- "Files don't matter" — any `*.yaml` in the config directory contributes to
  the same logical tree, keyed by record id. May require proseql changes if
  not already supported (user owns proseql).
- Top-level collections use **map-keyed** records (id = YAML key, never
  duplicated in the payload). Lists of records are not used at the top level.
- Path aliases (`@shared/*`, `@app/*`) and Effect Schema for wire payloads
  remain in force.
- Brand-new app posture: no backwards-compat shims for the old launch-target
  shape.

## Success Criteria

- Per-game gamescope policy resolves correctly across `global → user → system
  → launcher → game → preset → ephemeral override`, with deep-merge semantics
  and `inherit: false` escape hatch.
- A game with zero presets and zero direct policy fields launches via pure
  inheritance from less-specific layers.
- The same user-editable YAML (one file or many — user's choice) declares
  games, policy, presets, users, systems, launchers, and collections. No
  separate "server config" file.
- `KORRI_GAME_STREAM_USE_GAMESCOPE` is deleted from the codebase and nix
  module.
- Adding CPU policy in a follow-up requires only a new schema field — no
  changes to inheritance/merge code.
- Romhacks (e.g. Kaizo Mario World) appear side-by-side with originals (e.g.
  Super Mario World) on the game grid; their relationship is expressed via
  shared `collections` membership.

## Candidate Shapes

### Shape A — three-bucket separation (library / server / host)

Three top-level config files or sections: library data (games, launchers,
etc.), server policy (gamescope, future cpu/hooks), host/client config.
**Rejected** because the boundaries are arbitrary, the user has to remember
which bucket each knob lives in, and "server policy" had no clear home today.

### Shape B — unified logical tree, files-don't-matter (CHOSEN)

One logical config tree. Any `*.yaml` file contributes. Top-level keys are
map-keyed collections (`games`, `users`, `systems`, `launchers`,
`collections`). Policy fields (`gamescope`, future `cpu`, `hooks`) and
`presets` can appear at every layer. Launches assemble a payload by walking
the cascade.

### Shape C — flat presets with explicit scope

A single global `presets:` collection where each preset declares its scope
(`scope: { system: snes }`, `scope: { game: super-mario-world }`, etc.).
**Rejected**: scope is metadata rather than structure, heterogeneous bag,
easier to write a preset that points at a non-existent owner.

## Chosen Shape

**Shape B.** Unified logical tree, files-don't-matter, map-keyed top-level
collections, presets nested under their owner, field-level inheritance cascade.

### Sketch

```yaml
# Any *.yaml in the config dir contributes. Filenames carry no meaning.

# Global defaults (root of the tree)
launcher: retroarch
gamescope: { enabled: false }
presets:
  max-quality:
    name: "Max Quality"
    gamescope: { enabled: true, args: ["-W", "1920", "-H", "1080", "-F", "fsr"] }

users:
  default:
    name: "Default"
    # user-level policy + presets (apply across all games for this user)

systems:
  snes:
    launcher: retroarch                # SNES's preferred launcher
    cores:                             # per-launcher core selection
      retroarch: snes9x_libretro.so
    presets:
      max-quality:                     # shadows global "max-quality" for SNES launches
        gamescope: { args: ["-W", "1920", "-H", "1080", "-F", "fsr"] }

launchers:
  retroarch:
    command: retroarch
    args: [-L, "{core}", "{contentPath}"]
    systems: [snes, psx, gba, nes]     # flat list — capability only
  snes9x:
    command: snes9x
    args: ["{contentPath}"]
    systems: [snes]

collections:
  mario:
    title: "Mario"
    description: "Mario series"
  smw-romhacks:
    title: "Super Mario World — Romhacks"

games:
  super-mario-world:
    title: Super Mario World
    system: snes                       # identity field; not preset-overridable
    contentPath: /games/snes/SMW.smc   # identity field; not preset-overridable
    collections: [mario]
    presets:
      speedrun:
        name: "Speedrun"
        gamescope: { args: ["-W", "320", "-H", "240"] }
  kaizo-mario-world:                   # separate game, same grid level as SMW
    title: Kaizo Mario World
    system: snes
    contentPath: /games/snes/Kaizo Mario World.smc
    collections: [mario, smw-romhacks]
```

## Key Decisions

### Schema / structure

- **Files don't matter; the logical tree does.** All `*.yaml` in the config
  dir merge into one tree by top-level key.
- **Map-keyed records throughout.** Top-level (`games`, `users`, `systems`,
  `launchers`, `collections`) and nested (`presets`, `cores`). Id = YAML key,
  never duplicated in the payload. Matches the existing proseql learning doc.
- **`server` as a top-level key is dead.** Policy fields live directly on each
  layer. No separate "server config" bucket.
- **Launchers declare supported systems as a flat list** (`systems: [snes,
  psx]`). Per-launcher core selection lives in the system record
  (`cores: { retroarch: snes9x_libretro.so }`), not in the launcher record.
  Avoids `psx: {}` placeholder noise.
- **`launch-target` is renamed to `preset`** and absorbed into the cascade.
  `LegacyLaunchTargetRecord` (the direct-LaunchSpec form) dies — no
  backwards-compat shim.

### Cascade

- **Six layers**, least → most specific:
  `global → user → system → launcher → game → preset → ephemeral override`.
- **Inheritable fields** include `launcher`, `gamescope`, `cpu` (future),
  `hooks` (future), and the existing launch-target fields (`argsAppend`,
  `env`, `cwd`, ...). Same field shapes work at every applicable layer.
- **Identity fields are NOT inheritable.** `system` and `contentPath` live
  only at the game layer; presets cannot override them. If they differ, it
  is a different game.
- **Merge semantics**: deep-merge objects; concat lists in inheritance order;
  map-merge maps key-by-key. "Absent" and `null` mean "no opinion"; explicit
  `false`/`0` overrides inherited values.
- **`inherit: false` escape hatch.** Available on any layer record (preset,
  user, system, launcher, game, or the root). Means: "ignore all less-specific
  layers; start clean from this point in the cascade."

### Presets

- **Presets are optional**, named saved deviations. A game with zero presets
  is still launchable, because less-specific layers contribute enough.
- **Presets live at any layer.** Same-name presets at more-specific layers
  shadow less-specific ones (deep-merged unless the more-specific preset sets
  `inherit: false`).
- **Preset resolution is two-pass.** Pass 1 collects the set of presets
  applicable to this game launch (walking outward from the game, with name
  shadowing). Pass 2 builds the launch payload by walking the field-level
  cascade with the chosen preset in place.

### Users

- **`users` ships as first-class now**, with `default` as the starter row.
  Structure is in place for multi-user.
- **`users` sits right after `global`** in the cascade — personal defaults that
  more-specific layers can deviate from.
- v1 user record carries policy fields and a `presets` map. Library
  visibility, save data, controller, theme, auth, achievements, time limits,
  etc. are explicitly *not* v1 even though they may live here eventually.

### Collections

- **`collections` ships v1 as first-class records** with title/description and
  manual membership (game side declares `collections: [...]`).
- **Many-to-many**, not has-one. A game can belong to many collections; each
  collection has many member games.
- **Not a cascade layer in v1.** Collections do not contribute policy or
  presets to their members today.
- **Future, deferred:** collection-level policy/presets, nested collections,
  smart membership (filter rules), `basedOn` for source-port-style "needs
  original assets" cases.
- **Proseql terminology overload accepted.** Proseql's `Collection*` types
  (table-like) and our domain `collections` (curated groupings) coexist;
  documented, not renamed.

### Transport

- **The ephemeral override is a one-shot field on the prepare-RPC payload.**
  No persistence. Enters the cascade as the most-specific layer with the
  same merge rules.
- **The RPC payload also carries selected user id and selected preset id**
  (or `null` for "no preset, use inherited defaults"); both default sensibly.

### Nix / env-vars

- **Hard cut on `KORRI_GAME_STREAM_USE_GAMESCOPE`.** Deleted from nix module
  and code.
- **Tool paths remain nix-managed env-vars.** `KORRI_GAME_STREAM_GAMESCOPE`,
  `KORRI_GAME_STREAM_SWAYMSG`, runtime/intent/lock/status paths stay where
  they are. Not user-facing config.
- **`KORRI_GAME_STREAM_SWAY_REPAIR` becomes implicit** (true whenever the
  resolved gamescope is enabled). Not a separate env-var.

## Open Questions

- Exact schema for `cpu` and `hooks` (deferred — coming soon, same cascade).
- Migration story for existing user library data (one-time importer
  invocation? on-the-fly transform on first read? clean reset?).
- Proseql changes (if any) needed to support cross-file merging into one
  logical tree — i.e. multiple files contributing to the same top-level
  collection by key. The user owns proseql and is willing to fix it if not
  already supported.
- Exact set of fields that move from launcher's existing `defaults:` block to
  per-system entries (`contentPath` and `emulator` candidates).
- Whether the per-launcher entries inside `systems.<id>.cores` are themselves
  inheritable (e.g. global → user → system contributing different cores), or
  whether they only live in the system record. Default assumption: system
  record only.
- Whether the prepare-RPC payload carries the resolved final payload from the
  client, or the chosen preset id + ephemeral override and the server
  re-resolves. Default assumption: server re-resolves.

## Plan Resolutions

> *Added after planning. The brief above is preserved as the day-one
> framing. This section maps each open question and stale assumption
> to the resolution captured in the plan. Plan is canonical going
> forward.*
>
> **Plan:** [`docs/plans/2026-05-21-001-feat-korri-config-cascade-plan.md`](../plans/2026-05-21-001-feat-korri-config-cascade-plan.md)

### Open Questions — resolutions

| Brief question | Resolution | Plan reference |
| --- | --- | --- |
| Exact schema for `cpu` and `hooks` | Deferred to follow-up. The cascade is built so adding them is schema-only — except hooks may need ordering / failure-policy concerns of their own (R7 softens the earlier "schema additions only" claim accordingly). | R7; Scope Boundaries |
| Migration story for existing library data | **Clean break.** No detection, no migration transform, no `LegacyFormatDetected` typed error. Schema-breaking changes mean wiping `~/.local/share/korri/library/` and re-importing. Brand-new app posture honored literally. | Key Technical Decisions “Brand-new-app hard cut”; Documentation / Operational Notes |
| Proseql changes for cross-file merge | **Shipped in ProseQL 0.13.2** as the `documents` source variant. A single source declaration globs `**/*.yaml` in the library root; each matching file's top-level collection keys route records into the declared collections. Duplicates fail loudly; unknown collection keys fail by default; origin-file attribution preserved on updates/deletes; new records go to a configurable outbox. U4 uses it directly. | U4 Phase A; Key Technical Decisions “ProseQL uses the `documents` source variant” |
| Fields moving from launcher `defaults:` to per-system entries | Deferred to U1 implementation. `core` clearly moves; `contentPath` and `system` are game-only; `emulator` may move per-system or be dropped if the placeholder uses the system record’s id directly. | U1 “Deferred to Implementation” list |
| Per-launcher inheritability inside `systems.<id>.cores` | Deferred. Default assumption stands: not inheritable in v1; lives in the system record only. | Open Questions “Deferred to Implementation” |
| RPC payload: server re-resolves vs client carries final payload | **Server re-resolves.** Default assumption from brief held. `prepare.rpc` accepts `{ id, userId?, presetId?, override? }`; handler loads the snapshot and runs the cascade per request. | R6; U5 |

### Decisions made during planning that the brief didn’t anticipate

- **Presets are the full behavior layer.** They can set every
  inheritable field including `launcher` and launcher-keyed config under
  `byLauncher.<launcherId>.*`. The only fields they cannot set are
  identity fields (`system`, `contentPath`) and nested presets. The
  brief’s preset examples were all behavior-tuning; the planning
  conversation confirmed presets should be “the final stop before
  override.” (R4, plan Key Technical Decisions.)
- **Same-name presets form a deep-merge chain across layers** with
  `inherit: false` truncation. The brief said “deep-merged unless
  `inherit: false`” but didn’t spell out chain semantics; the plan
  formalizes the pass-1 return shape as `Map<presetName,
  ResolvedPreset[]>`. (R5, U2.)
- **Cascade resolver has a skeleton pre-pass for `launcher`** because
  presets can set launcher and the launcher layer’s contributions
  depend on which launcher is resolved. The skeleton scans
  override → preset chain → game → system → user → global for the first
  non-null `launcher`, then full cascade walks with that locked in.
  (U2 Approach.)
- **Launcher-layer presets are menu-visible only when their launcher
  is the skeleton default.** Presets that switch launchers live at
  global / user / system / game where they’re always visible. (U2
  Approach.)
- **Identity-field boundary is enforced by strict-whitelist schemas,
  not convention.** Every record schema decodes in strict mode;
  unknown keys (including identity-field attempts in presets/overrides,
  and typos like `gamescpoe`) fail decode with file-and-path
  attribution. (R11, U1.)
- **Global-layer fields live in a singleton `config` collection.**
  The brief described a global layer but didn’t name its storage; the
  plan adds `config.yaml` with key `global` as the singleton record.
  This keeps the schema model symmetric (every cascade layer maps to
  a record). (R10, plan Module Layout.)
- **U4 is a single atomic integration unit.** The library swap
  (schemas + repository + importer + delete `launcher-config/`) lands
  in one commit with labeled phases A–E. Splitting it would have
  required either dual-shape transition plumbing or accepting broken
  `just typecheck` between units — both worse for atomic-commit norms.
  (U4.)

### Brief body assertions that the plan supersedes

*These statements appear earlier in the brief but no longer reflect
the chosen approach. Listed here so a future reader doesn’t mistake
them for current decisions.*

- **“`users` ships as a first-class top-level collection with a
  `default` row” (under Users / Key Decisions).** No `default` row.
  Omitted `userId` in RPC payload = user layer contributes nothing
  (no implicit user). Named `userId` that doesn’t exist returns
  `UserNotFound`. `users` collection can be legitimately empty on a
  fresh device. (R8.)
- **“Tool paths (`KORRI_GAME_STREAM_GAMESCOPE`, `KORRI_GAME_STREAM_SWAYMSG`)
  stay nix-managed env-vars” (under Nix / env-vars).** Deleted. Tool
  availability is provided by nix bundling `gamescope` and `swaymsg`
  into `systemPackages`; runner resolves them by name from PATH.
  (R12, U7.)
- **The env-var section implied keeping the broader
  `KORRI_GAME_STREAM_*` cluster intact.** Eight of nine env vars are
  deleted in U7; only `KORRI_GAME_STREAM_RUNTIME_DIR` survives. Intent
  path, lock path, status path, and intent max-age are derived inline
  from `RUNTIME_DIR` or live as constants. (R12, U7.)
- **`SWAY_REPAIR` becomes implicit (under Nix / env-vars).** Resolved
  by removing it as an env var entirely; the runner derives repair
  status from `intent.gamescope.enabled`. (U6 Approach.)
- **“May require proseql changes if not already supported” (under
  Constraints).** Resolved — ProseQL 0.13.2 ships the `documents`
  source variant that delivers "files don't matter" literally. Korri
  bumps `@proseql/node` to 0.13.2 (done in this planning session) and
  U4 declares the new source variant. Original handoff at
  `/tmp/handoff-wXVLGO.md` is no longer needed.
- **Migration story listed as open** (under Open Questions). Resolved
  to clean-break per above.

---

## Next Step

- Run `/se-plan` using this brief as the primary input to produce an
  atomic-commit plan.
- Suggested sequencing for the plan to consider (not prescriptive):
  1. Schemas / types for the new model (games, users, systems, launchers,
     collections, presets) in `korri/shared/library/`.
  2. Proseql adjustments for cross-file merge if needed; otherwise confirm
     existing behavior covers it.
  3. Cascade resolver in `korri/shared/library/` with unit tests at each
     layer.
  4. RPC payload changes (`prepare.rpc`) — add user id, preset id,
     ephemeral override.
  5. Gamescope feature implementation at `tools/device/game-stream-runner.ts`
     and `tools/device/game-stream-fullscreen.ts`.
  6. Delete `KORRI_GAME_STREAM_USE_GAMESCOPE` from the nix module and code.
  7. End-to-end test: per-game gamescope policy honored at each layer with
     `inherit: false` exercised.
