/**
 * pico surface. ATOMIC LAYER: page. Storage (static).
 */
import { Btn } from "../../ui/atoms/Btn"
import { Progress } from "../../ui/atoms/Progress"
import { Card } from "../../ui/molecules/Card"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function StorageSettings() {
  return (
    <ScreenShell
      title="PICO ▸ STORAGE"
      hints={[
        { key: "a", label: "MANAGE" },
        { key: "y", label: "CLEAR" },
        { key: "b", label: "BACK" },
      ]}
    >
      <Card title="DEVICE STORAGE — WHERE YOUR CARTS LIVE">
        <Progress pct={41} />
        <div className="pcSet-usage">
          <span className="pcSet-used">26 GB USED</span>
          <span className="pcSet-free">64 GB TOTAL</span>
        </div>
      </Card>
      <div className="pcSet-list">
        <div className="pcSet-row sel">
          <span className="pcSet-swatch games" />
          <span className="pcSet-label">Games</span>
          <span className="pcSet-info">18.4 GB</span>
        </div>
        <div className="pcSet-row">
          <span className="pcSet-swatch saves" />
          <span className="pcSet-label">Saves</span>
          <span className="pcSet-info">2.1 GB</span>
        </div>
        <div className="pcSet-row">
          <span className="pcSet-swatch system" />
          <span className="pcSet-label">System</span>
          <span className="pcSet-info">5.5 GB</span>
        </div>
        <div className="pcSet-row">
          <span className="pcSet-swatch free" />
          <span className="pcSet-label">Free</span>
          <span className="pcSet-info">38.0 GB</span>
        </div>
      </div>
      <div className="pcSet-actions">
        <Btn kind="primary">▸ MANAGE</Btn>
        <Btn>CLEAR CACHE · 1.2 GB</Btn>
      </div>
    </ScreenShell>
  )
}
