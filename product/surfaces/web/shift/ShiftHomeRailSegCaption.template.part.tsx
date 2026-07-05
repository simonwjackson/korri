// Exploration (not final): Rail segmentation header · Caption.
//
// The original Headers treatment: a plain uppercase caption above each group,
// the active section's caption in the accent. The neutral baseline the other
// header studies vary from. Delete this file to drop the study.
import { RailSegmentsScene } from "./shift-rail-segments-exploration"

const headerCss = `
[data-proto="rail-seg-caption"] .rail-seg-label {
  padding-left: var(--shift-space-1);
  font-size: var(--shift-text-fine);
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--shift-ink-dim);
}
[data-proto="rail-seg-caption"] .rail-seg[data-active] .rail-seg-label {
  color: var(--shift-accent);
}
`

export default {
  name: "Rail seg · Caption",
  note: "exploration · plain header (baseline)",
  render: () => (
    <RailSegmentsScene
      proto="rail-seg-caption"
      headerCss={headerCss}
      renderHeader={segment => (
        <div className="rail-seg-label">{segment.label}</div>
      )}
    />
  ),
}
