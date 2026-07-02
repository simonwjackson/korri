# Shift conversion ledger

Every Shift product component, its target atomic layer, the real edges its
subtree consumes, and conversion status. "Done" means a `.part.tsx` renders
the REAL component at that layer; "live" additionally means it mounts through
the real scoped-registry path (`surfacePartMount`) so its edges drive real
atoms. Pure presentational parts with no real upstream are prop-driven by
design and marked **no device edge**.

Statuses: `done (live)` · `done (static)` · `covered` (represented through a
composing part's state family or bridge) · `to-do`.

## Pages

| Component | Layer | Real edges | Status | Part file |
|---|---|---|---|---|
| Home (`routes/ShiftHomeRoute` → `pages/ShiftCinematicHome`) | page | Data axis, Foreground axis, clock input, battery + network events | done (live) | `ShiftHome.page.part.tsx` |
| Game Detail (`routes/ShiftGameDetailRoute`) | page | action variant input | done (static) — live-mount spec pending (U7) | `ShiftGameDetail.page.part.tsx` |
| Companion (`routes/ShiftCompanionRoute`) | page | dual-screen session | to-do (U7 decision: part vs device-only screen) | — |
| Library screens (grid/shelves/lens/filterbar/deck/reel) | page | `games` component input (real composition-root projection) | done — dedicated state families replaced the `ShiftScreens` bridge | `pages/ShiftLibrary.page.part.tsx` |

## Home cinematic family

| Component | Layer | Real edges | Status | Part file |
|---|---|---|---|---|
| `pages/ShiftCinematicHome` | template | composed by Home page part | covered (standalone template part = U7 decision) | via `ShiftHome.page.part.tsx` |
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
| `pages/ShiftHomeLoadingBody` | organism | Data axis (Loading) | covered — Home page state family (`Loading`); standalone part = U7 decision | via `ShiftHome.page.part.tsx` |
| `pages/ShiftHomeEmptyBody` | organism | Data axis (Empty) | covered — Home page state family (`Empty`) | via `ShiftHome.page.part.tsx` |
| `pages/ShiftHomeLoadErrorBody` | organism | Data axis (LoadError) | covered — Home page state family (`LoadError`) | via `ShiftHome.page.part.tsx` |
| `pages/ShiftHomeDefectBody` | organism | Data axis (Defect) | covered — Home page state family (`Defect`) | via `ShiftHome.page.part.tsx` |

## Detail family (U5)

| Component | Layer | Real edges | Status | Part file |
|---|---|---|---|---|
| `pages/ShiftDetailSplit` | page composition | detail view data (fixture) | covered — rendered by the Game Detail page part; a separate organism story would duplicate the design part (dedupe rule) | via `ShiftGameDetail.page.part.tsx` |
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

## Not parts (helpers / infrastructure)

`ui/ShiftPartFrame` (part-preview frame), `ui/shift-part-fixtures`,
`shift-*-state.ts` (edge modules), `routes/route-tree`, `mount-shift(-part)`,
`config`, `surface`, `entry` — infrastructure, not design parts.
