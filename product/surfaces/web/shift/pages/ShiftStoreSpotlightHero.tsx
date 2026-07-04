/**
 * Shift store — the spotlight hero (organism).
 *
 * The art-forward feature the Spotlight variant leads with: the top result's
 * wide art fills the panel behind a scrim, with its source kicker, title, and
 * metadata laid over it. Following the browse-first model, the hero carries NO
 * acquire button — the whole panel is one navigation target that opens the
 * entry's detail page, where the acquire choice (and the grouped release's many
 * sources) lives. Because it is a native <button>, its children are phrasing
 * spans, not headings.
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"
import {
  type ShiftStoreEntry,
  shiftStoreSourcesLabel,
} from "./shift-store-entry"

export interface ShiftStoreSpotlightHeroProps {
  readonly entry: ShiftStoreEntry
  /** Open the featured entry's detail page. */
  readonly onOpen?: (id: string) => void
}

export function ShiftStoreSpotlightHero({
  entry,
  onOpen,
}: ShiftStoreSpotlightHeroProps) {
  const meta = [entry.genre, entry.developer, entry.platform]
    .filter(Boolean)
    .join(" · ")
  // The hero has room, so it names provenance — a single source, or a
  // "N sources" summary for a grouped release.
  const sourceLabel = shiftStoreSourcesLabel(entry.sources)
  return (
    <button
      type="button"
      className="shift-store-hero"
      aria-label={entry.title}
      onClick={() => onOpen?.(entry.id)}
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.storeSpotlightHero, entry.id)}
    >
      <span
        className="shift-store-hero-bleed"
        style={{ backgroundImage: `url(${entry.artUrl})` }}
      />
      <span className="shift-store-hero-scrim" />
      <span className="shift-store-hero-inner">
        {sourceLabel ? (
          <span className="shift-store-hero-kicker">{sourceLabel}</span>
        ) : null}
        <span className="shift-store-hero-title">{entry.title}</span>
        {meta ? <span className="shift-store-hero-meta">{meta}</span> : null}
      </span>
    </button>
  )
}
