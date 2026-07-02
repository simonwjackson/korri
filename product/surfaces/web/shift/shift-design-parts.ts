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
