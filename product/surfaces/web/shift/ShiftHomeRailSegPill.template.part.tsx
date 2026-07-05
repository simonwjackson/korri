// Exploration (not final): Rail segmentation header · Pill.
//
// The caption becomes a small pill/chip: the active section is a filled accent
// pill, the rest are quiet ghost pills. Reads more like a set of section
// "tabs" and gives the header more presence than plain text. Delete this file to
// drop the study.
import { RailSegmentsScene } from "./shift-rail-segments-exploration"

const headerCss = `
[data-proto="rail-seg-pill"] .rail-seg-label {
  width: fit-content;
  padding: 0.15em 0.7em;
  border-radius: 999px;
  font-size: var(--shift-text-fine);
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--shift-ink-dim);
  background: var(--shift-pill-bg);
}
[data-proto="rail-seg-pill"] .rail-seg[data-active] .rail-seg-label {
  color: var(--shift-on-accent);
  background: var(--shift-accent);
}
`

export default {
  name: "Rail seg · Pill",
  note: "exploration · chip-style headers",
  render: () => (
    <RailSegmentsScene
      proto="rail-seg-pill"
      headerCss={headerCss}
      renderHeader={segment => (
        <div className="rail-seg-label">{segment.label}</div>
      )}
    />
  ),
}
