export type ShiftDesignPartLayer =
  | "page"
  | "template"
  | "organism"
  | "molecule"
  | "atom"

export interface ShiftDesignPart {
  readonly id: string
  readonly layer: ShiftDesignPartLayer
  readonly name: string
}

export const SHIFT_DESIGN_PARTS = {
  home: { id: "shift.home", layer: "page", name: "Home" },
  backdrop: {
    id: "shift.cine-backdrop",
    layer: "molecule",
    name: "Backdrop",
  },
  statusBar: {
    id: "shift.status-bar",
    layer: "molecule",
    name: "Status Bar",
  },
  battery: { id: "shift.battery", layer: "atom", name: "Battery" },
  hero: { id: "shift.cine-hero", layer: "organism", name: "Hero" },
  legend: {
    id: "shift.cine-legend",
    layer: "molecule",
    name: "Legend",
  },
  rail: { id: "shift.cine-rail", layer: "organism", name: "Rail" },
  tile: { id: "shift.cine-tile", layer: "molecule", name: "Tile" },
  detailActions: {
    id: "shift.detail-actions",
    layer: "molecule",
    name: "Detail Actions",
  },
  detailHints: {
    id: "shift.detail-hints",
    layer: "molecule",
    name: "Detail Hints",
  },
  libraryTile: {
    id: "shift.library-tile",
    layer: "molecule",
    name: "Library Tile",
  },
  libraryGrid: {
    id: "shift.library-grid",
    layer: "page",
    name: "Library — Grid",
  },
  libraryShelves: {
    id: "shift.library-shelves",
    layer: "page",
    name: "Library — Shelves",
  },
  libraryLens: {
    id: "shift.library-lens",
    layer: "page",
    name: "Library — Lens",
  },
  libraryFilterBar: {
    id: "shift.library-filterbar",
    layer: "page",
    name: "Library — Filter Bar",
  },
  libraryDeck: {
    id: "shift.library-deck",
    layer: "page",
    name: "Library — Deck",
  },
  libraryReel: {
    id: "shift.library-reel",
    layer: "page",
    name: "Library — Reel",
  },
  // Shared library scaffolding inlined across the variants.
  libraryHeader: {
    id: "shift.library-header",
    layer: "molecule",
    name: "Library Header",
  },
  libraryEmpty: {
    id: "shift.library-empty",
    layer: "atom",
    name: "Library Empty",
  },
  libraryGridView: {
    id: "shift.library-grid-view",
    layer: "organism",
    name: "Library Grid View",
  },
  libraryShelf: {
    id: "shift.library-shelf",
    layer: "organism",
    name: "Library Shelf",
  },
  libraryShelfStack: {
    id: "shift.library-shelf-stack",
    layer: "organism",
    name: "Library Shelf Stack",
  },
  // Reel internals.
  reelCover: {
    id: "shift.reel-cover",
    layer: "molecule",
    name: "Reel Cover",
  },
  reelStage: {
    id: "shift.reel-stage",
    layer: "organism",
    name: "Reel Stage",
  },
  reelHero: { id: "shift.reel-hero", layer: "molecule", name: "Reel Hero" },
  reelActions: {
    id: "shift.reel-actions",
    layer: "molecule",
    name: "Reel Actions",
  },
  // Deck internals.
  deckBleed: {
    id: "shift.deck-bleed",
    layer: "molecule",
    name: "Deck Bleed",
  },
  deckCounter: {
    id: "shift.deck-counter",
    layer: "atom",
    name: "Deck Counter",
  },
  deckCard: { id: "shift.deck-card", layer: "molecule", name: "Deck Card" },
  deckHero: { id: "shift.deck-hero", layer: "molecule", name: "Deck Hero" },
  deckActions: {
    id: "shift.deck-actions",
    layer: "molecule",
    name: "Deck Actions",
  },
  // Lens internals.
  lensRow: { id: "shift.lens-row", layer: "molecule", name: "Lens Row" },
  lensSortButton: {
    id: "shift.lens-sort-button",
    layer: "atom",
    name: "Lens Sort Button",
  },
  lensSortOverlay: {
    id: "shift.lens-sort-overlay",
    layer: "molecule",
    name: "Lens Sort Overlay",
  },
  // Filter-bar internals.
  filterChip: {
    id: "shift.filter-chip",
    layer: "atom",
    name: "Filter Chip",
  },
  filterToolbar: {
    id: "shift.filter-toolbar",
    layer: "molecule",
    name: "Filter Toolbar",
  },
  // Detail internals.
  detailArt: { id: "shift.detail-art", layer: "atom", name: "Detail Art" },
  detailStats: {
    id: "shift.detail-stats",
    layer: "molecule",
    name: "Detail Stats",
  },
  // Home body states (the Home page's non-Ready Data states; tagged so
  // pick-mode can select the body inside the Home page).
  homeLoading: {
    id: "shift.home-loading",
    layer: "organism",
    name: "Home Loading",
  },
  homeEmpty: {
    id: "shift.home-empty",
    layer: "organism",
    name: "Home Empty",
  },
  homeLoadError: {
    id: "shift.home-load-error",
    layer: "organism",
    name: "Home Load Error",
  },
  homeDefect: {
    id: "shift.home-defect",
    layer: "organism",
    name: "Home Defect",
  },
} as const satisfies Record<string, ShiftDesignPart>

export function shiftDesignPartAttrs(
  part: ShiftDesignPart,
  instanceId?: string,
): Record<string, string> {
  return {
    "data-korri-part": part.id,
    "data-korri-layer": part.layer,
    "data-korri-name": part.name,
    ...(instanceId ? { "data-korri-instance-id": instanceId } : {}),
  }
}
