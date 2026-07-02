/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: molecule.
 *
 * A streaming-quality segmented bar with a tone + tag. Shared by the stream
 * overlay (GOOD) and the reconnecting screen (DROPPING).
 */
const SEGMENTS = ["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7"] as const

import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"

export function QualityBar({
  level,
  max = 5,
  tone,
  tag,
}: {
  readonly level: number
  readonly max?: number
  readonly tone: string
  readonly tag: string
}) {
  return (
    <div
      className="pcIg-quality"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.qualityBar)}
    >
      <span className="pcIg-quality-label">QUALITY</span>
      <span className={`pcIg-quality-bar ${tone}`}>
        {SEGMENTS.slice(0, max).map((seg, index) => (
          <i key={seg} className={index < level ? "on" : ""} />
        ))}
      </span>
      <span className="pcIg-quality-tag">{tag}</span>
    </div>
  )
}
