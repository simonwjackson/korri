/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * Repair / verify readout: progress plus a per-file checklist with OK/REPAIRING
 * badges.
 */
import type { PicoGame } from "../../fixtures"
import { Badge } from "../atoms/Badge"
import { Progress } from "../atoms/Progress"
import { Spinner } from "../atoms/Spinner"
import { Sub } from "../atoms/Sub"
import { Title } from "../atoms/Title"
import { Card } from "../molecules/Card"

const REPAIR_FILES: readonly {
  readonly name: string
  readonly state: string
}[] = [
  { name: "game.exe", state: "ok" },
  { name: "data/assets.pak", state: "ok" },
  { name: "data/audio.bank", state: "repairing" },
  { name: "config/default.ini", state: "ok" },
  { name: "runtime/fex.cfg", state: "ok" },
]

export function RepairProgress({ target }: { readonly target: PicoGame }) {
  return (
    <div className="pcAcq-progress">
      <Spinner />
      <Title size={1}>VERIFYING FILES</Title>
      <Sub>{target.title}</Sub>
      <Progress pct={80} />
      <div className="pc-dim">4 / 5 FILES VALIDATED</div>
      <Card title="FILES" className="pcAcq-checklist">
        {REPAIR_FILES.map(file => (
          <div key={file.name} className={`pcAcq-file ${file.state}`}>
            <span className="pcAcq-file-name">{file.name}</span>
            <Badge tone={file.state === "ok" ? "good" : "bad"}>
              {file.state === "ok" ? "OK" : "REPAIRING"}
            </Badge>
          </div>
        ))}
      </Card>
    </div>
  )
}
