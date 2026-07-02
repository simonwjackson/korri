# Shift conversion ledger

Every Shift product component, its target atomic layer, the real edges its
subtree consumes, and conversion status. "Done" means a `.part.tsx` renders
the REAL component at that layer; "live" additionally means it mounts through
the real scoped-registry path (`surfacePartMount`) so its edges drive real
atoms. Pure presentational parts with no real upstream are prop-driven by
design and marked **no device edge**.

Statuses: `done (live)` · `done (static)` · `covered` (represented through a
composing part's state family or bridge) · `to-do`.

> **Second-pass note (decomposition depth).** The first Library/Detail pass
> converted only at the variant/page grain (one page part per variant + the
> shared Tile). A follow-up pass extracted the chrome *inside* each variant
> into real components + catalog parts (Reel wheel/cover/hero/actions, Deck
> card/bleed/counter/hero/actions, Lens row/sort, Filter chip/toolbar) and the
> shared library scaffolding (Header/Empty/Grid View/Shelf), and tagged the
> Home body states for pick-mode. Those internals are enumerated below.

## Pages

| Component | Layer | Real edges | Status | Part file |
|---|---|---|---|---|
| Home (`routes/ShiftHomeRoute` → `pages/ShiftCinematicHome`) | page | Data axis, Foreground axis, clock input, battery + network events | done (live) | `ShiftHome.page.part.tsx` |
| Game Detail (`routes/ShiftGameDetailRoute`) | page | action variant input (detail view is prop-driven; its part subtree reads no atoms, so no live-mount spec applies) | done (static) | `ShiftGameDetail.page.part.tsx` |
| Companion (`routes/ShiftCompanionRoute`) | page | dual-screen broadcast session | decided (U7): device-mounted screen role, not a catalog part — it has no standalone design identity outside a multi-screen device's session (`secondaryScreenPath`) | — (by design) |

A **page** is a template bound to a source. The Library page (a committed
variant + route/source) is still pending the control-model decision, so
Library currently has templates (below) and no page.

## Templates (layouts with a data slot)

Source-agnostic layouts that arrange organisms around a `games`/`game` slot.
Bound to a source they become the pages above; rendered from fixtures they are
templates. The six Library variants are templates (so the **Reel is a
template**, not a page).

| Component | Layer | Real edges | Status | Part file |
|---|---|---|---|---|
| `pages/ShiftCinematicHome` | template | `games` slot (+ time/battery/network/launch props) | done (static) | `ShiftCinematicHome.template.part.tsx` |
| `pages/ShiftDetailSplit` | template | `game` slot | done (static) | `ShiftDetailSplit.template.part.tsx` |
| `pages/ShiftLibraryGrid` | template | `games` slot | done (static, Ready/Empty) | `pages/ShiftLibrary.template.part.tsx` |
| `pages/ShiftLibraryShelves` | template | `sections` slot | done (static, Ready/Empty) | `pages/ShiftLibrary.template.part.tsx` |
| `pages/ShiftLibraryLens` | template | `games` slot; lens/sort local | done (static, Ready/Empty) | `pages/ShiftLibrary.template.part.tsx` |
| `pages/ShiftLibraryFilterBar` | template | `games` slot; filters/sort local | done (static, Ready/Empty) | `pages/ShiftLibrary.template.part.tsx` |
| `pages/ShiftLibraryDeck` | template | `games` slot; deck index local | done (static, Ready/Empty) | `pages/ShiftLibrary.template.part.tsx` |
| `pages/ShiftLibraryReel` | template | `games` slot; reel physics local | done (static, Ready/Empty) | `pages/ShiftLibrary.template.part.tsx` |

## Home cinematic family

| Component | Layer | Real edges | Status | Part file |
|---|---|---|---|---|
| `pages/ShiftCinematicHome` | template | `games` slot | done (static) — see Templates section (`shift.home-template`); the Home page binds it to the live catalog | `ShiftCinematicHome.template.part.tsx` |
| `ui/organisms/ShiftCineHero` | organism | no device edge (fixture props) | done (static) | `ShiftCineHero.organism.part.tsx` |
| `ui/organisms/ShiftCineRail` | organism | no device edge (fixture props) | done (static) | `ShiftCineRail.organism.part.tsx` |
| `ui/molecules/ShiftCineBackdrop` | molecule | no device edge | done (static) | `ShiftCineBackdrop.molecule.part.tsx` |
| `ui/molecules/ShiftCineChips` | molecule | no device edge | done (static) | `ShiftCineChips.molecule.part.tsx` |
| `ui/molecules/ShiftCineLegend` | molecule | no device edge | done (static) | `ShiftCineLegend.molecule.part.tsx` |
| `ui/molecules/ShiftCineTile` | molecule | no device edge | done (static) | `ShiftCineTile.molecule.part.tsx` |
| `ui/molecules/ShiftStatusBar` | molecule | clock input, battery + network events | done (live) | `ShiftStatusBar.molecule.part.tsx` |
| `ui/atoms/ShiftBattery` | atom | battery event (via device-state derivation host) | done (live) | `ShiftBattery.atom.part.tsx` |
| `ui/atoms/ShiftCineChip` | atom | no device edge | done (static) | `ShiftCineChip.atom.part.tsx` |
| `ui/atoms/ShiftCineHint` | atom | no device edge | done (static) | `ShiftCineHint.atom.part.tsx` |
| `ui/atoms/ShiftCineKicker` | atom | no device edge | done (static) | `ShiftCineKicker.atom.part.tsx` |
| `ui/atoms/ShiftCineLoading` | atom | no device edge | done (static) | `ShiftCineLoading.atom.part.tsx` |
| `ui/atoms/ShiftCineTitle` | atom | no device edge | done (static) | `ShiftCineTitle.atom.part.tsx` |

## Home body states

| Component | Layer | Real edges | Status | Part file |
|---|---|---|---|---|
| `pages/ShiftHomeLoadingBody` | organism | Data axis (Loading) | covered + tagged (`shift.home-loading`) — pickable inside the Home page; catalog form is the Home Loading state | via `ShiftHome.page.part.tsx` |
| `pages/ShiftHomeEmptyBody` | organism | Data axis (Empty) | covered + tagged (`shift.home-empty`) | via `ShiftHome.page.part.tsx` |
| `pages/ShiftHomeLoadErrorBody` | organism | Data axis (LoadError) | covered + tagged (`shift.home-load-error`) | via `ShiftHome.page.part.tsx` |
| `pages/ShiftHomeDefectBody` | organism | Data axis (Defect) | covered + tagged (`shift.home-defect`) | via `ShiftHome.page.part.tsx` |

## Detail family (U5)

| Component | Layer | Real edges | Status | Part file |
|---|---|---|---|---|
| `pages/ShiftDetailSplit` | template | `game` slot | done (static) — see Templates section (`shift.detail-template`); the Game Detail page binds a game + action states; composes Art/Stats/Actions/Hints | `ShiftDetailSplit.template.part.tsx` |
| `pages/ShiftDetailArt` | atom | `artUrl` input | done (static) | `pages/ShiftDetailArt.atom.part.tsx` |
| `pages/ShiftDetailStats` | molecule | played/fresh state family | done (static) | `pages/ShiftDetailStats.molecule.part.tsx` |
| `pages/ShiftDetailActions` | molecule | action-state variant (Continue/Play from play history, favourite) | done (static) | `pages/ShiftDetailActions.molecule.part.tsx` |
| `pages/ShiftDetailHints` | molecule | action-state variant (verb follows play history) | done (static) | `pages/ShiftDetailHints.molecule.part.tsx` |

## Library family (U6)

The six variant **layouts** are catalogued as templates (see the Templates
section): they take the real `games` component input, fed by the
composition-root projection (`shiftLibraryGameFromCatalogEntry` / config's dev
projection), and placed parts swap fixture libraries at that edge via the
source binding. Interaction state (filters, lens, sort, deck/reel index) stays
local `useState` by design. The one shared focusable unit is the Tile:

| Component | Layer | Real edges | Status | Part file |
|---|---|---|---|---|
| `pages/ShiftLibraryTile` | molecule | `game` input; favourite state family | done (static) | `pages/ShiftLibraryTile.molecule.part.tsx` |

### Shared library scaffolding (composed by the variants)

| Component | Layer | Real edges | Status | Part file |
|---|---|---|---|---|
| `pages/ShiftLibraryHeader` | molecule | `title`/`count` inputs + trailing slot | done (static) | `pages/ShiftLibraryHeader.molecule.part.tsx` |
| `pages/ShiftLibraryEmpty` | atom | `message` input | done (static) | `pages/ShiftLibraryEmpty.atom.part.tsx` |
| `pages/ShiftLibraryGridView` | organism | `games` input | done (static) | `pages/ShiftLibraryGridView.organism.part.tsx` |
| `pages/ShiftLibraryShelf` | organism | `title` + `games` inputs | done (static) | `pages/ShiftLibraryShelf.organism.part.tsx` |
| `pages/ShiftLibraryShelfStack` | organism | `sections` input (shared by Shelves + Lens) | done (static) | `pages/ShiftLibraryShelfStack.organism.part.tsx` |

### Reel internals

| Component | Layer | Real edges | Status | Part file |
|---|---|---|---|---|
| `pages/ShiftReelCover` | molecule | center/peek state family (offset); composes Cover Art | done (static) | `pages/ShiftReelCover.molecule.part.tsx` |
| `pages/ShiftReelStage` | organism | `games` + `center` inputs; `reelWindow`/`reelOffsetFromCenter` core | done (static) | `pages/ShiftReelStage.organism.part.tsx` |
| `pages/ShiftCoverArt` | atom | `src` input (shared; also used by Deck Card) | done (static) | `pages/ShiftCoverArt.atom.part.tsx` |
| `pages/ShiftReelTitle` | atom | `title` input | done (static) | `pages/ShiftReelTitle.atom.part.tsx` |
| `pages/ShiftReelTags` | atom | `genre` input | done (static) | `pages/ShiftReelTags.atom.part.tsx` |
| `pages/ShiftReelSpinButton` | atom | no device edge | done (static) | `pages/ShiftReelSpinButton.atom.part.tsx` |
| `pages/ShiftReelPlayButton` | atom | no device edge | done (static) | `pages/ShiftReelPlayButton.atom.part.tsx` |
| `pages/ShiftReelHero` | molecule | `title`/`genre` inputs | done (static) | `pages/ShiftReelHero.molecule.part.tsx` |
| `pages/ShiftReelActions` | molecule | no device edge | done (static) | `pages/ShiftReelActions.molecule.part.tsx` |

### Deck internals

| Component | Layer | Real edges | Status | Part file |
|---|---|---|---|---|
| `pages/ShiftDeckBleed` | molecule | `artUrl` input | done (static) | `pages/ShiftDeckBleed.molecule.part.tsx` |
| `pages/ShiftDeckCounter` | atom | `position`/`total` inputs | done (static) | `pages/ShiftDeckCounter.atom.part.tsx` |
| `pages/ShiftDeckCard` | molecule | `game` input; flick gesture | done (static) | `pages/ShiftDeckCard.molecule.part.tsx` |
| `pages/ShiftDeckHero` | molecule | `title`/`tags` inputs | done (static) | `pages/ShiftDeckHero.molecule.part.tsx` |
| `pages/ShiftDeckActions` | molecule | unfavorited/favorited state family | done (static) | `pages/ShiftDeckActions.molecule.part.tsx` |

### Lens internals

| Component | Layer | Real edges | Status | Part file |
|---|---|---|---|---|
| `pages/ShiftLensRow` | molecule | lens state family (All/Favorites/By Genre) | done (static) | `pages/ShiftLensRow.molecule.part.tsx` |
| `pages/ShiftLensSortButton` | atom | closed/open state family | done (static) | `pages/ShiftLensSortButton.atom.part.tsx` |
| `pages/ShiftLensSortOverlay` | molecule | `sort`/`sorts` inputs | done (static) | `pages/ShiftLensSortOverlay.molecule.part.tsx` |

### Filter Bar internals

| Component | Layer | Real edges | Status | Part file |
|---|---|---|---|---|
| `pages/ShiftLibraryFilterChip` | atom | idle/active/genre/sort state family | done (static) | `pages/ShiftLibraryFilterChip.atom.part.tsx` |
| `pages/ShiftLibraryFilterToolbar` | molecule | `facets`/`sort` inputs | done (static) | `pages/ShiftLibraryFilterToolbar.molecule.part.tsx` |

## Not parts (helpers / infrastructure)

`ui/ShiftPartFrame` (part-preview frame), `ui/shift-part-fixtures`,
`shift-*-state.ts` (edge modules), `routes/route-tree`, `mount-shift(-part)`,
`config`, `surface`, `entry` — infrastructure, not design parts.
