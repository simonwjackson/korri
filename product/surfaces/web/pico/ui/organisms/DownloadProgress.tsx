/**
 * pico surface. ATOMIC LAYER: organism.
 *
 * Active download readout: spinner, title, the game, a progress bar, and
 * done/speed/eta stats.
 */
import type { PicoGame } from "../../fixtures"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Btn } from "../atoms/Btn"
import { Progress } from "../atoms/Progress"
import { Spinner } from "../atoms/Spinner"
import { Stat } from "../atoms/Stat"
import { Sub } from "../atoms/Sub"
import { Title } from "../atoms/Title"

export function DownloadProgress({ target }: { readonly target: PicoGame }) {
  return (
    <div
      className="pcAcq-progress"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.downloadProgress)}
    >
      <Spinner />
      <Title size={1}>DOWNLOADING</Title>
      <Sub>{target.title}</Sub>
      <Progress pct={62} />
      <div
        className="pcAcq-stats"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcAcqStats)}
      >
        <Stat label="DONE" value="154 / 248 MB" />
        <Stat label="SPEED" value="6.4 MB/s" />
        <Stat label="ETA" value="0:15" />
      </div>
      <Btn>CANCEL</Btn>
    </div>
  )
}
