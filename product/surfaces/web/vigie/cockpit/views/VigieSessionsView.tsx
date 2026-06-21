import { VigieLifecycleTimeline } from "../components/VigieLifecycleTimeline"
import { VigieSessionHistory } from "../components/VigieSessionHistory"
import { VigieSessionPanel } from "../components/VigieSessionPanel"

// Sessions — the live session in depth (phase rail + readouts), its lifecycle
// event stream, and recent launch history.

export function VigieSessionsView() {
  return (
    <main className="vigie-view">
      <div className="vigie-two-col">
        <VigieSessionPanel />
        <VigieLifecycleTimeline />
      </div>
      <VigieSessionHistory />
    </main>
  )
}
