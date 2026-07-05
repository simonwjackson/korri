// Exploration (not final): Rail segmentation header · Icon.
//
// A small lucide glyph before each caption gives every section a recognizable
// motif you can catch pre-attentively (clock = Continue, star = Favorites,
// sparkles = Fresh) — the label becomes secondary confirmation. Delete this file
// to drop the study.
import { Clock, type LucideIcon, Sparkles, Star } from "lucide-react"
import { RailSegmentsScene } from "./shift-rail-segments-exploration"

const ICONS: Record<string, LucideIcon> = {
  continue: Clock,
  favorites: Star,
  fresh: Sparkles,
}

const headerCss = `
[data-proto="rail-seg-icon"] .rail-seg-label {
  display: flex;
  align-items: center;
  gap: var(--shift-space-2);
  padding-left: var(--shift-space-1);
  font-size: var(--shift-text-fine);
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--shift-ink-dim);
}
[data-proto="rail-seg-icon"] .rail-seg-icon {
  width: 1.1em;
  height: 1.1em;
  stroke-width: 2;
}
[data-proto="rail-seg-icon"] .rail-seg[data-active] .rail-seg-label {
  color: var(--shift-accent);
}
`

export default {
  name: "Rail seg · Icon",
  note: "exploration · per-section glyph",
  render: () => (
    <RailSegmentsScene
      proto="rail-seg-icon"
      headerCss={headerCss}
      renderHeader={segment => {
        const Icon = ICONS[segment.id] ?? Clock
        return (
          <div className="rail-seg-label">
            <Icon className="rail-seg-icon" aria-hidden />
            {segment.label}
          </div>
        )
      }}
    />
  ),
}
