/**
 * pico surface. ATOMIC LAYER: organism.
 *
 * The streaming session overlay body: session name, live transport stats, a
 * quality bar, and pause/resume/quit controls.
 */
import type { PicoGame } from "../../fixtures"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Badge } from "../atoms/Badge"
import { Btn } from "../atoms/Btn"
import { Icon } from "../atoms/Icon"
import { Stat } from "../atoms/Stat"
import { QualityBar } from "../molecules/QualityBar"

export function StreamPanel({ hero }: { readonly hero: PicoGame | undefined }) {
  return (
    <>
      <div
        className="pcIg-stream-head"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.streamPanel)}
      >
        <span className="pcIg-stream-name">{hero?.title ?? "SESSION"}</span>
        <Badge tone="info">STREAM</Badge>
      </div>
      <div className="pcIg-stream-stats">
        <Stat label="BITRATE" value="18 Mbps" />
        <Stat label="LATENCY" value="7 ms" />
        <Stat label="FPS" value="59" />
        <Stat label="CODEC" value="H.265" />
        <Stat label="RES" value="1080p" />
      </div>
      <QualityBar level={4} tone="good" tag="GOOD" />
      <div className="pcIg-stream-ctl">
        <Btn kind="primary">
          <Icon name="pause" /> PAUSE
        </Btn>
        <Btn>
          <Icon name="play" /> RESUME
        </Btn>
        <Btn kind="danger">
          <Icon name="close" /> QUIT
        </Btn>
      </div>
    </>
  )
}
