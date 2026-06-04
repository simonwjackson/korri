# Code Context

## Files Retrieved
1. `old-ui/src/components/FeaturedGameGrid.tsx` (lines 19-240) - old responsive paged/featured library grid behavior.
2. `old-ui/src/components/GridView.tsx` (lines 16-110, 130-287, 326-366) - old generic grid schema, flow, paging, animation, and focus ideas.
3. `old-ui/src/components/FilterBar.tsx` (lines 1-121) - old full search/platform/genre/view-mode bar.
4. `old-ui/src/components/GameFilterBar.tsx` (lines 122-212 in combined output) - old compact filter-chip/game-count/view toggle bar.
5. `old-ui/src/routes/library.tsx` (lines 227-240) - old route-level genre filtering state/data flow.
6. `old-ui/src/utils/game-utils.ts` (lines 21-137) - old pure library utility ideas: playtime, last-played, unique facets, search, sorting.
7. `old-ui/src/hooks/useGamepadPaging.ts` (lines 1-96) - old shoulder-trigger page navigation behavior.
8. `old-ui/src/hooks/useGamepadNavigation.ts` (lines 99-245) - old gamepad-to-keyboard navigation; mostly superseded by current semantic input.
9. `old-ui/src/components/FooterActions.tsx` (lines 1-41) - old bottom action legend layout.
10. `old-ui/src/contexts/ScaleContext.tsx` (lines 1-41) - old discrete tile size presets; mostly superseded by current Shift UI scale.
11. `product/platform/react/primitives/components/Tilegrid/TilegridPagedRoot.tsx` (lines 88-185) - current paged Tilegrid comparison: has container measurement, bin-packing, page API, no cycling.
12. `product/themes/shift/organisms/ShiftHomeRail.tsx` (lines 82-107) - current Shift rail comparison: one featured/resume span only, no full paged featured grid.
13. `product/platform/input/gamepad-adapter.ts` (lines 1-180) - current semantic gamepad adapter comparison: d-pad/stick/confirm/back/options/menu implemented.
14. `product/themes/shift/organisms/ShiftHomeTopBar.tsx` (lines 24-55) - current search pill comparison: search affordance exists, but no library search/filter flow.

## Key Code

### Salvage candidates not already implemented

1. **Full library search/filter/sort facet model, not just a search pill** — **High confidence**
   - Old UI had concrete search text, platform select, genre select, and view-mode state in `old-ui/src/components/FilterBar.tsx` lines 1-121, plus route-level genre filtering in `old-ui/src/routes/library.tsx` lines 227-240.
   - `old-ui/src/utils/game-utils.ts` lines 55-137 adds reusable pure helpers for unique genres/tags, full-text search over name/description/developer/publisher/tags, and sort criteria (`name`, `lastPlayed`, `playtime`, `releaseDate`).
   - Current Shift has only an inert/search-affordance top-bar API (`product/themes/shift/organisms/ShiftHomeTopBar.tsx` lines 24-55). I did not find an implemented current search/filter state flow in portal/Shift/library.
   - Salvage as an Effect/atom-backed domain ADT or pure `LibraryViewModel` helper, not as old route-local booleans/Zustand.

2. **Compact filter-chip rail with game count and view toggle** — **Medium confidence**
   - `old-ui/src/components/GameFilterBar.tsx` lines 122-212 shows a console-friendly compact horizontal chip strip, explicit active filter title, `N games` count, search/filter buttons, and grid/list toggle.
   - Current Shift top bar includes search and status, but no visible filter chips/count/view toggle. This could become a Shift organism for a future library/search drawer rather than main home chrome.
   - Risk: old implementation uses tiny dense controls and direct props; adapt to current theme tokens and semantic input.

3. **Full-screen paged featured grid mode distinct from the current horizontal rail** — **High confidence**
   - `old-ui/src/components/FeaturedGameGrid.tsx` lines 19-164 computes page size from container width/height, reserves a 2x2 featured tile on page 0, then lays out the rest in a dense grid. Lines 177-240 render the featured tile, hover title/last-played overlay, and pagination dots.
   - Current `ShiftHomeRail` only uses a single-row rail and gives the resume target span 2 (`product/themes/shift/organisms/ShiftHomeRail.tsx` lines 82-107). Current `TilegridPagedRoot` already has the primitive mechanics (`product/platform/react/primitives/components/Tilegrid/TilegridPagedRoot.tsx` lines 122-164), but not a Shift/full-library composition with page dots, first-page featured tile, and vertical grid browsing.
   - Salvage idea: build a theme-level `ShiftLibraryGrid`/search results page using current `TilegridPagedRoot` + `TilegridCells`; avoid copying old inline layout math unless a “reserve first page hero cells” helper is needed.

4. **Page indicators for TilegridPagedRoot compositions** — **Medium confidence**
   - Old `FeaturedGameGrid` renders clickable pagination dots at `old-ui/src/components/FeaturedGameGrid.tsx` lines 228-240.
   - Current `TilegridPagedRoot` exposes `currentPage`, `totalPages`, and `goToPage` (`product/platform/react/primitives/components/Tilegrid/TilegridPagedRoot.tsx` lines 151-164), but I did not see a reusable Shift/page-dot component in the searched areas.
   - Salvage as a small theme molecule reading Tilegrid paged context; useful once paged grids enter the UI.

5. **Shoulder-trigger page navigation semantic action** — **Medium confidence**
   - Old `useGamepadPaging` maps L1/L2 to previous page and R1/R2 to next page (`old-ui/src/hooks/useGamepadPaging.ts` lines 36-66).
   - Current `product/platform/input/gamepad-adapter.ts` maps confirm/back/options/menu and directions (lines 18-27, 121-180), but not shoulder page actions. Current Tilegrid has explicit `next/prev` page APIs.
   - Salvage as platform semantic actions such as `pagePrevious`/`pageNext` (or a documented `options` chord), not component-level polling. Needs supervisor/product decision on action vocabulary and physical button mapping.

6. **Optional cyclic page navigation** — **Low/Medium confidence**
   - Old `GridView` includes `cycle` defaulting true and wraps first/last pages (`old-ui/src/components/GridView.tsx` lines 16-27, 280-287).
   - Current `TilegridPagedRoot` explicitly documents no cycling (`product/platform/react/primitives/components/Tilegrid/TilegridPagedRoot.tsx` lines 95-99) and implements no-op at edges (lines 151-157).
   - This is worth considering only as a composition-level option for carousel-like surfaces, not a change to current Tilegrid default. Confidence lower because current no-cycle behavior appears intentional for focus boundaries.

7. **Directional page transition animations/staggered cell entrance** — **Medium confidence**
   - Old `FeaturedGameGrid` tracks previous/current page to choose slide direction (`old-ui/src/components/FeaturedGameGrid.tsx` lines 19-20, 125-131). Old `GridView` had fade/slide variants and per-index stagger (`old-ui/src/components/GridView.tsx` lines 64-94, 352-366).
   - Current Shift has launch-transition stories, but Tilegrid paged compositions do not appear to expose page-transition direction/stagger. Salvage as theme CSS/View Transition composition, not in the primitive if avoidable.

8. **Library metadata display helpers: playtime and relative last played** — **Medium confidence**
   - Old helpers in `old-ui/src/utils/game-utils.ts` lines 21-50 format playtime and last-played copy; old featured overlay uses last-played display (`old-ui/src/components/FeaturedGameGrid.tsx` lines 196-202).
   - Current library source sorts by last played in its contract, but current Shift rail/caption primarily displays names/art and launch state. A detail panel/search result card could reuse the idea.
   - Risk: old `formatLastPlayed` uses local `toLocaleDateString()` and date math; if salvaged, implement with project time rules/UTC-safe tests.

## Architecture

Old UI was route/local-state oriented: `LibraryRoute` owned `viewMode` and selected genre, delegated query/search/platform filtering to an external `useQuery`, and rendered `FilterBar` + `GameGrid`. Grid behavior was embedded in React components and gamepad hooks polled browser APIs directly.

Current Korri has the better seams already: library data comes through `product/platform/library` and Effect atoms; spatial/device input is normalized in `product/platform/input`; UI uses autonomous themes (`product/themes/shift`) and platform primitives (`Tilegrid`). Therefore salvage should be behavioral/design extraction, not code copy:

- Put search/filter/sort as pure domain helpers or atom-derived view models near the current library/Shift feature seam.
- Use `TilegridPagedRoot`/`TilegridCells` for any paged grid; add only the missing composition pieces (featured first item, page dots, transitions).
- Add paging buttons through semantic input action vocabulary in `product/platform/input` and consume with `useInputAction`, never with component-level `navigator.getGamepads()` polling.

## Start Here

Start with `product/themes/shift/pages/ShiftHomeReadyBody.tsx` and `product/themes/shift/organisms/ShiftHomeRail.tsx` to understand current home composition, then open `product/platform/react/primitives/components/Tilegrid/TilegridPagedRoot.tsx` for the existing paged-grid API. The highest-value salvage is a new search/filter/library browsing surface, not changes to the existing rail.

## Supervisor coordination

No blocker. The main decision needed before implementation is product vocabulary: whether Korri wants a separate library/search page or a search drawer, and whether shoulder buttons should become first-class `pagePrevious`/`pageNext` input actions.
