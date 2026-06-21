import { VigieLogDrawer } from "../components/VigieLogDrawer"
import { VigieMetricsPanel } from "../components/VigieMetricsPanel"
import { VigieSessionPanel } from "../components/VigieSessionPanel"
import { VigieSubsystemPanel } from "../components/VigieSubsystemPanel"

// Overview — the at-a-glance health page: telemetry strip, the unified session
// beside subsystem health, and the docked raw-log hatch.

export function VigieOverviewView() {
  return (
    <main className="vigie-view">
      <VigieMetricsPanel />
      <div className="vigie-main">
        <VigieSessionPanel />
        <div className="vigie-stack">
          <VigieSubsystemPanel />
          <VigieLogDrawer />
        </div>
      </div>
    </main>
  )
}
