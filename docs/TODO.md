# TODO

Maintenance debt captured during the 2026-05-24 game-assets pipeline rollout.
Items are grouped by urgency. Each one names the underlying problem, the cost
of the workaround that's currently in place, and a sketch of the right fix.

## Must fix soon

### Drop the `system == "nix"` filter from the SteamGridDB importer

- **Where:** `tools/importers/steamgriddb/fetch-korri-steamgriddb-art`
  (the `yq` selector near the bottom of the script).
- **Problem:** the importer silently skips every game whose system is not
  `nix`. During the aka rollout this meant 16 console/homebrew games
  (NES/GBA/GBC/SMS/Genesis/N64) were never even queried; we had to back-fill
  them with a one-off `fetch-missing.ts`.
- **Workaround in place:** none committed — the hardcoded filter is still
  there and will skip new homebrew games on the next run.
- **Right fix:** remove the filter (default to all systems) and optionally
  add a `--systems` flag for callers that want to scope a run.

### Build a real "bulk assign" path for game assets

- **Where it should live:** new CLI subcommand (e.g. `korri game-assets
  bulk-assign --strategy=top-score`) wrapping
  `@shared/library/game-assets/game-assets-service`, or a
  `app.game-assets.assign-many` batch RPC.
- **Problem:** `app.game-assets.assign` is one-at-a-time and assumes an
  interactive picker UI that does not exist yet. Seeding aka required
  bypassing the RPC entirely with a `/tmp/aka-art/assign.ts` one-shot,
  which skipped:
  - the trusted-writes env gate,
  - magic-byte / max-byte / max-dimension / max-pixel validation,
  - atomic mkdtemp → wx → rename promotion,
  - candidate-cache path-traversal/symlink/MIME invariants.
- **Workaround in place:** `/tmp/aka-art/assign.ts` (uncommitted) plus
  direct rsync of blobs to aka. Will be re-hacked the next time we need
  to seed art.
- **Right fix:** a CLI that runs the same `GameAssetsService` in-process
  with a picking strategy (e.g. highest `score`, tiebreak by pixel count)
  so promotion still goes through the audited code path. This also
  eliminates the hardcoded paths in the one-off scripts and the
  hardcoded target lists in `fetch-missing.ts`.

## Worth fixing when nearby

### Tighten SteamGridDB matching + support per-game overrides

- **Where:** `tools/importers/steamgriddb/fetch-korri-steamgriddb-art`
  (the `choose_game_id` jq pipeline that falls back to first/contains
  matches), and a new override surface alongside it.
- **Problem:** when no exact-normalized match exists, the importer
  accepts SteamGridDB's first autocomplete result. During the aka
  rollout this gave us:
  - `nix/xmoto` → an NSFW Japanese game,
  - `nix/torus-trooper` → "Torus",
  - `nix/garden-of-coloured-lights` → "Garden of Oblivion",
  - several others that looked plausible from the slug but were wrong.
- **Workaround in place:** post-hoc human-curated `goodMatches` set; YARG
  fetched via a separate inline `bun -e` that hardcoded its sgdbId.
- **Right fix:**
  - require exact-normalized match (drop the `contains` and
    "first result" fallbacks),
  - support an override file (e.g. `tools/importers/steamgriddb/overrides.yaml`
    or a per-game `metadata.steamgriddb.id` in `library.yaml`) so titles
    like YARG, Tobu Tobu Girl Deluxe, lincity-ng, vdrift become
    one-line overrides instead of hand edits.

### Surface `gameAssets.root` as a real nix option

- **Where:** `nix/modules/korri-server.nix`.
- **Problem:** durable blob lookup falls back to `dirname(KORRI_LIBRARY_ROOT)
  /game-assets` when `KORRI_GAME_ASSETS_ROOT` is unset. This works (and is
  what aka relies on), but it's implicit: there is no nix option for it,
  no documentation, and operators who customize `library.root` to an
  unusual path can land blobs somewhere unexpected.
- **Workaround in place:** the runtime fallback chain. Functional but
  invisible.
- **Right fix:** add `services.korri.server.gameAssets.root` (`types.str`),
  default it to a Nix-side `dirname cfg.library.root + "/game-assets"`,
  and set `KORRI_GAME_ASSETS_ROOT` from it. Also document the
  precedence in the option description.

## Notes

- The 2026-05-24 game-assets plan
  (`docs/plans/2026-05-24-001-feat-game-assets-pipeline-plan.md`) is
  marked complete and intentionally did not include any of the above —
  these are gaps surfaced by the real rollout, not regressions against
  the plan.
- Items explicitly classified as "leave alone" during the rollout audit
  (YAML reflow, `.local`/`.lan` URL trust, one-shot rsync) are not
  listed here.
