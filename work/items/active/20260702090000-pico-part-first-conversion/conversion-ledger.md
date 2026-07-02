# Pico part-first conversion ledger

Every pico part, its layer, and its part-first status. "tagged" = its DOM root
carries `data-korri-part/layer/name`; "edges" = it declares/inherits device-fact
edges; "story-identified" = catalogued but no DOM tag (fragment/mapper roots).

## Atoms (13) — all tagged

Badge, BlockBar, Btn, Chip, Dim, Glyph, Icon (via PicoIcon), Progress, Spinner,
Stat, Sub, Title, Toggle.

## Molecules (16) — all tagged; + Status Bar

Card, DetailHead, GameCart (via PicoCart), GameCartUnmarked (via
PicoCartUnmarked), GameLogo (h1 + PicoArtImage via `partAttrs`), HostBadge
(offline span; other branches surface the Badge atom), KeyArtBackdrop (via
PicoArtImage `partAttrs`), List (accepts `partAttrs` override), Opt, PlayCta,
Player, QualityBar, Row, SearchQuery, SettingRow, Tabs.

**Status Bar** — new molecule part (`pico.status-bar`). Prop-driven
(`PicoStatusBar`); the live host `PicoStatusBarLive` derives battery/network/
clock from the shared atoms. Declares battery + network events + a clock input;
has a live mount spec.

## Organisms (62) — 61 tagged, 1 story-identified

All tagged except **FilterSortPanel** (returns a fragment of three sibling
sections → no single root → story-identified). Composed-root organisms claim
their shared root via `partAttrs`: CollectionList / ContinueList / ReleaseList /
SearchResults / SeatList (`List`), LastPlayedHero / SpotlightHero
(`KeyArtBackdrop`), MomentHero (`ScreenShell`).

## Templates (3) — all tagged

GameOverlay, PanelScreen, ScreenShell (accepts `partAttrs` override; renders the
live status bar).

## Pages

Surfaced in the lab as page-layer stories via `config.tsx` / `screen-catalog`.
Two carry a stable design-part id for device-as-composition:

- **Home** (`pico.home`, `PicoHome.page.part.tsx`) → routed `VariantCartridgeShelf`.
- **Game Detail** (`pico.game-detail`, `PicoGameDetail.page.part.tsx`) → routed
  `VariantGameDetail`.

Both embed the status bar, so they declare + live-mount the battery/network/
clock edges and are the page parts the adapter's device screens (`/`,
`/game/$id`) inherit edges from.

## Not tagged (by design)

- **FilterSortPanel** — fragment root (story-identified).
- **Gallery pages** — layout instances identified by story/`pagePartId`
  (mirrors the Shift precedent: only routed pages get a distinct page tag).

## Infra added

- `pico-design-parts.ts` (registry + attrs).
- `mount-pico-part.tsx` (`PicoPartSurface`) + `PicoRegistryBridge` in
  `mount-pico.tsx`.
- `pico-{power,network,clock}-state.ts` (device-fact derivations, 8 tests in
  `pico-device-facts.test.ts`).
- `tools/theme-workshop/lab/adapters/pico-edges.ts` +
  `pico-surface-part.tsx`; part-first fields wired into `pico.ts`.
- `tools/theme-workshop/lab/pico-part-first-invariants.test.ts` (6 invariants).
- Playbook: `docs/solutions/architecture-patterns/pico-parts-are-the-app-2026-07-02.md`.
