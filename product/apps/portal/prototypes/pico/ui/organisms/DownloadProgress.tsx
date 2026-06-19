/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * Active download readout: spinner, title, the game, a progress bar, and
 * done/speed/eta stats.
 */
import type { PicoGame } from "../../fixtures"
import { Btn, Progress, Spinner, Stat, Sub } from "../../screens/kit"
import { Title } from "../atoms/Title"

export function DownloadProgress({ target }: { readonly target: PicoGame }) {
  return (
    <div className="pcAcq-progress">
      <Spinner />
      <Title size={1}>DOWNLOADING</Title>
      <Sub>{target.title}</Sub>
      <Progress pct={62} />
      <div className="pcAcq-stats">
        <Stat label="DONE" value="154 / 248 MB" />
        <Stat label="SPEED" value="6.4 MB/s" />
        <Stat label="ETA" value="0:15" />
      </div>
      <Btn>CANCEL</Btn>
    </div>
  )
}
