/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * Update-available panel: current → new version, a changelog card, and
 * update/skip actions.
 */
import type { PicoGame } from "../../fixtures"
import { Btn, Card, Stat, Sub } from "../../screens/kit"
import { Icon } from "../atoms/Icon"
import { Title } from "../atoms/Title"

export function UpdatePanel({ target }: { readonly target: PicoGame }) {
  return (
    <div className="pcAcq-update">
      <Title size={1}>UPDATE AVAILABLE</Title>
      <Sub>{target.title}</Sub>
      <div className="pcAcq-versions">
        <Stat label="CURRENT" value="v1.3.0" />
        <span className="pcAcq-arrow">▸</span>
        <Stat label="NEW" value="v1.4.0" />
      </div>
      <Card title="CHANGELOG" className="pcAcq-changelog">
        <ul className="pcAcq-notes">
          <li>Fixed FEX crash on level 3 boss</li>
          <li>Added 60 Hz mode + rebindable pause</li>
          <li>Smaller install footprint</li>
        </ul>
      </Card>
      <div className="pc-hero-actions">
        <Btn kind="primary" sel>
          <Icon name="download" /> UPDATE
        </Btn>
        <Btn>SKIP</Btn>
      </div>
    </div>
  )
}
