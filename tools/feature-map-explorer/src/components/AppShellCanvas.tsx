import { GitBranch } from "lucide-react"

/*
 * Canvas placeholder. Unit 5 mounts React Flow + dagre here; Unit 4 wires
 * a non-graph fallback (rail-driven node selection) before the graph
 * lands.
 */
export function AppShellCanvas() {
  return (
    <section className="col-start-2 row-start-2 grid min-w-0 place-items-center bg-bg">
      <div className="flex max-w-sm flex-col items-center gap-3 px-6 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface text-accent-muted">
          <GitBranch size={18} aria-hidden="true" />
        </span>
        <h2 className="font-semibold text-base">Graph canvas</h2>
        <p className="text-text-muted text-sm">
          Job → Brief → Feature → Scenario flows render here once the
          feature-map fetch and React Flow layout land.
        </p>
      </div>
    </section>
  )
}
