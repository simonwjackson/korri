/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 * Cloud save conflict (static).
 */
import { Badge, Btn, Card } from "../../screens/kit"
import { Title } from "../../ui/atoms/Title"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function CloudSaveConflict() {
  return (
    <ScreenShell
      tone="alert"
      title="PICO ▸ SYNC"
      hints={[
        { key: "a", label: "KEEP LOCAL" },
        { key: "y", label: "KEEP CLOUD" },
        { key: "b", label: "CANCEL" },
      ]}
    >
      <div className="pcFut-conf-head">
        <Title size={0}>SAVE CONFLICT</Title>
        <p className="pcFut-conf-note">
          Two saves, one truth — which do we keep? The other gets tidied away.
        </p>
      </div>
      <div className="pcFut-conf-grid">
        <Card title="THIS DEVICE" className="pcFut-conf-card">
          <Badge tone="info">LOCAL</Badge>
          <div className="pcFut-conf-line">
            <span className="pc-dim">SAVED</span>
            <b>2m ago</b>
          </div>
          <div className="pcFut-conf-line">
            <span className="pc-dim">PLAYTIME</span>
            <b>12h 40m</b>
          </div>
          <div className="pcFut-conf-line">
            <span className="pc-dim">SPOT</span>
            <b>WORLD 3-2</b>
          </div>
          <Btn kind="primary" sel>
            KEEP LOCAL
          </Btn>
        </Card>
        <Card title="CLOUD" className="pcFut-conf-card">
          <Badge tone="accent">CLOUD</Badge>
          <div className="pcFut-conf-line">
            <span className="pc-dim">SAVED</span>
            <b>3h ago</b>
          </div>
          <div className="pcFut-conf-line">
            <span className="pc-dim">PLAYTIME</span>
            <b>13h 05m</b>
          </div>
          <div className="pcFut-conf-line">
            <span className="pc-dim">SPOT</span>
            <b>BOSS RUSH</b>
          </div>
          <Btn>KEEP CLOUD</Btn>
        </Card>
      </div>
    </ScreenShell>
  )
}
