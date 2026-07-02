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
| Library screens (grid/shelves/lens/filterbar/deck/reel) | page | `games` component input (real composition-root projection) | done — dedicated state families replaced the `ShiftScreens` bridge | `pages/ShiftLibrary.page.part.tsx` |

## Home cinematic family

| Component | Layer | Real edges | Status | Part file |
|---|---|---|---|---|
| `pages/ShiftCinematicHome` | template | composed by Home page part | covered — decided (U7): a standalone template story would duplicate the Home design part (dedupe rule) | via `ShiftHome.page.part.tsx` |
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
| `pages/ShiftDetailSplit` | page composition | detail view data (fixture) | covered — rendered by the Game Detail page part; composes the Art/Stats/Actions/Hints parts below | via `ShiftGameDetail.page.part.tsx` |
| `pages/ShiftDetailArt` | atom | `artUrl` input | done (static) | `pages/ShiftDetailArt.atom.part.tsx` |
| `pages/ShiftDetailStats` | molecule | played/fresh state family | done (static) | `pages/ShiftDetailStats.molecule.part.tsx` |
| `pages/ShiftDetailActions` | molecule | action-state variant (Continue/Play from play history, favourite) | done (static) | `pages/ShiftDetailActions.molecule.part.tsx` |
| `pages/ShiftDetailHints` | molecule | action-state variant (verb follows play history) | done (static) | `pages/ShiftDetailHints.molecule.part.tsx` |

## Library family (U6)

The variants are competing full-screen design explorations (a page-level
control-model decision is still open), so each converts as a PAGE state
family, not organisms of one unified Library page. Their data edge is the
real `games` component input, fed by the composition-root projection
(`shiftLibraryGameFromCatalogEntry` / config's dev projection); placed parts
swap fixture libraries at that edge via the source binding. Interaction state
(filters, lens, sort, deck/reel index) stays local `useState` by design —
recorded here, revisit when one control model is committed as the route.

| Component | Layer | Real edges | Status | Part file |
|---|---|---|---|---|
| `pages/ShiftLibraryTile` | molecule | `game` input; favourite state family | done (static) | `pages/ShiftLibraryTile.molecule.part.tsx` |
| `pages/ShiftLibraryFilterBar` | page | `games` input; filters/sort local | done (static, Ready/Empty) | `pages/ShiftLibrary.page.part.tsx` |
| `pages/ShiftLibraryDeck` | page | `games` input; deck index local | done (static, Ready/Empty) | `pages/ShiftLibrary.page.part.tsx` |
| `pages/ShiftLibraryGrid` | page | `games` input | done (static, Ready/Empty) | `pages/ShiftLibrary.page.part.tsx` |
| `pages/ShiftLibraryLens` | page | `games` input; lens/sort local | done (static, Ready/Empty) | `pages/ShiftLibrary.page.part.tsx` |
| `pages/ShiftLibraryReel` | page | `games` input; reel index local | done (static, Ready/Empty) | `pages/ShiftLibrary.page.part.tsx` |
| `pages/ShiftLibraryShelves` | page | `sections` input (built from games) | done (static, Ready/Empty) | `pages/ShiftLibrary.page.part.tsx` |

### Shared library scaffolding (composed by the variants)

| Component | Layer | Real edges | Status | Part file |
|---|---|---|---|---|
| `pages/ShiftLibraryHeader` | molecule | `title`/`count` inputs + trailing slot | done (static) | `pages/ShiftLibraryHeader.molecule.part.tsx` |
| `pages/ShiftLibraryEmpty` | atom | `message` input | done (static) | `pages/ShiftLibraryEmpty.atom.part.tsx` |
| `pages/ShiftLibraryGridView` | organism | `games` input | done (static) | `pages/ShiftLibraryGridView.organism.part.tsx` |
| `pages/ShiftLibraryShelf` | organism | `title` + `games` inputs | done (static) | `pages/ShiftLibraryShelf.organism.part.tsx` |

### Reel internals

| Component | Layer | Real edges | Status | Part file |
|---|---|---|---|---|
| `pages/ShiftReelCover` | molecule | center/peek state family (offset) | done (static) | `pages/ShiftReelCover.molecule.part.tsx` |
| `pages/ShiftReelStage` | organism | `games` + `center` inputs; `reelWindow`/`reelOffsetFromCenter` core | done (static) | `pages/ShiftReelStage.organism.part.tsx` |
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
