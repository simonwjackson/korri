/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * Download confirmation: cart art beside a body with title/genre, the size /
 * source / runtime stats, and download/cancel actions.
 */
import type { PicoGame } from "../../fixtures"
import { Btn } from "../atoms/Btn"
import { Icon } from "../atoms/Icon"
import { Stat } from "../atoms/Stat"
import { Sub } from "../atoms/Sub"
import { Title } from "../atoms/Title"
import { GameCart } from "../molecules/GameCart"

export function DownloadConfirmCard({
  target,
  size,
  runtime,
}: {
  readonly target: PicoGame
  readonly size: string
  readonly runtime: string
}) {
  return (
    <div className="pcAcq-confirm">
      <div className="pc-art">
        <GameCart game={target} showFav={false} />
      </div>
      <div className="pcAcq-confirm-body">
        <Title size={1}>{target.title}</Title>
        <Sub>{target.genre}</Sub>
        <div className="pcAcq-meta">
          <Stat label="SIZE" value={size} />
          <Stat label="SOURCE" value="PORTMASTER" />
          <Stat label="RUNTIME" value={runtime} />
        </div>
        <div className="pc-hero-actions">
          <Btn kind="primary" sel>
            <Icon name="download" /> DOWNLOAD
          </Btn>
          <Btn>CANCEL</Btn>
        </div>
      </div>
    </div>
  )
}
