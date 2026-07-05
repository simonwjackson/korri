// Exploration (not final): Rail segmentation header · Underline tab.
//
// Same caption, but the active section gets a short accent underline beneath its
// label — a quiet "tab" cue for where you are, without adding chrome between the
// groups. Delete this file to drop the study.
import { RailSegmentsScene } from "./shift-rail-segments-exploration"

const headerCss = `
[data-proto="rail-seg-underline"] .rail-seg-label {
  width: fit-content;
  padding: 0 var(--shift-space-1) var(--shift-space-1);
  font-size: var(--shift-text-fine);
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--shift-ink-dim);
  border-bottom: 2px solid transparent;
}
[data-proto="rail-seg-underline"] .rail-seg[data-active] .rail-seg-label {
  color: var(--shift-ink);
  border-bottom-color: var(--shift-accent);
}
`

export default {
  name: "Rail seg · Underline",
  note: "exploration · active tab underline",
  render: () => (
    <RailSegmentsScene
      proto="rail-seg-underline"
      headerCss={headerCss}
      renderHeader={segment => (
        <div className="rail-seg-label">{segment.label}</div>
      )}
    />
  ),
}
