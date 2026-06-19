/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 * Gallery group: SHOWCASE — the "more pop" iteration. Art-forward, content-first
 * (NO system picker, NO A–Z list).
 *
 * Migrated to the atomic-design layers: each screen now lives as a page under
 * pages/showcase/, composed from ui/{templates,organisms,molecules,atoms}. This
 * file is now a thin compatibility barrel so screen-catalog's `Showcase.*Screen`
 * names keep resolving — the first fully-migrated gallery group.
 */
export { SpotlightHome as SpotlightHomeScreen } from "../pages/showcase/SpotlightHome"
export { LastPlayed as LastPlayedScreen } from "../pages/showcase/LastPlayed"
export { ForYou as ForYouShelvesScreen } from "../pages/showcase/ForYou"
