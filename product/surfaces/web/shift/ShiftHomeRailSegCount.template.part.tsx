// Exploration (not final): Rail segmentation header · Count.
//
// Caption plus a per-section count, so each group advertises how much is in it
// (e.g. "Continue 3") — useful when sections vary in size and you want to know
// how far a group runs before committing to scroll. Delete this file to drop it.
import { RailSegmentsScene } from "./shift-rail-segments-exploration"

const headerCss = `
[data-proto="rail-seg-count"] .rail-seg-label {
  display: flex;
  align-items: baseline;
  gap: var(--shift-space-2);
  padding-left: var(--shift-space-1);
  font-size: var(--shift-text-fine);
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--shift-ink-dim);
}
[data-proto="rail-seg-count"] .rail-seg[data-active] .rail-seg-label {
  color: var(--shift-accent);
}
[data-proto="rail-seg-count"] .rail-seg-count {
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--shift-ink-faint);
}
`

export default {
  name: "Rail seg · Count",
  note: "exploration · per-section count",
  render: () => (
    <RailSegmentsScene
      proto="rail-seg-count"
      headerCss={headerCss}
      renderHeader={segment => (
        <div className="rail-seg-label">
          {segment.label}
          <span className="rail-seg-count">{segment.tiles.length}</span>
        </div>
      )}
    />
  ),
}
