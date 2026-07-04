/**
 * Shift store — the spotlight hero (organism).
 *
 * The art-forward feature the Spotlight variant leads with: the top result's
 * wide art fills the panel behind a scrim, with its source kicker, title,
 * metadata, and the single Get/Play action laid over it. It is the store's
 * answer to a console storefront's featured banner — provenance and art, never
 * a price.
 */
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"
import { ShiftStoreGetButton } from "./ShiftStoreGetButton"
import {
  type ShiftStoreEntry,
  shiftStoreSourcesLabel,
} from "./shift-store-entry"

export interface ShiftStoreSpotlightHeroProps {
  readonly entry: ShiftStoreEntry
  readonly onGet?: (id: string) => void
}

export function ShiftStoreSpotlightHero({
  entry,
  onGet,
}: ShiftStoreSpotlightHeroProps) {
  const meta = [entry.genre, entry.developer, entry.platform]
    .filter(Boolean)
    .join(" · ")
  // The hero has room, so it names the provenance — a single source, or a
  // "N sources" summary for a grouped release.
  const sourceLabel = shiftStoreSourcesLabel(entry.sources)
  return (
    <section
      className="shift-store-hero"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.storeSpotlightHero, entry.id)}
    >
      <div
        className="shift-store-hero-bleed"
        style={{ backgroundImage: `url(${entry.artUrl})` }}
      />
      <div className="shift-store-hero-scrim" />
      <div className="shift-store-hero-inner">
        {sourceLabel ? (
          <span className="shift-store-hero-kicker">{sourceLabel}</span>
        ) : null}
        <h2 className="shift-store-hero-title">{entry.title}</h2>
        {meta ? <p className="shift-store-hero-meta">{meta}</p> : null}
        <div className="shift-store-hero-actions">
          <ShiftStoreGetButton
            status={entry.status}
            title={entry.title}
            onActivate={() => onGet?.(entry.id)}
          />
        </div>
      </div>
    </section>
  )
}
