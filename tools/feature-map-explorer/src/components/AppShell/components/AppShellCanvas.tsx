import { Loader2, TriangleAlert } from "lucide-react"
import type { ReactNode } from "react"
import { Graph } from "../../graph/Graph"
import { useAppShell } from "../AppShell.context"

/*
 * Canvas surface. Hosts the React Flow + dagre graph when the map is
 * loaded; otherwise renders a state message (loading / missing /
 * error). The graph itself reads selection from the same AppShell
 * context, so clicking a node updates the rail and inspector with no
 * extra plumbing.
 */
export function AppShellCanvas() {
  const { status, map, error } = useAppShell()

  return (
    <section className="col-start-2 row-start-2 min-w-0 bg-bg">
      {status === "loading" && (
        <CanvasMessage icon={<Loader2 size={18} className="animate-spin" />}>
          <Heading>Loading feature map…</Heading>
        </CanvasMessage>
      )}

      {status === "missing" && (
        <CanvasMessage icon={<TriangleAlert size={18} />}>
          <Heading>Feature map not generated</Heading>
          <Body>
            Run <Mono>just generate-feature-map</Mono>, or use the top-bar
            Regenerate action (lands in Unit 7).
          </Body>
        </CanvasMessage>
      )}

      {status === "error" && (
        <CanvasMessage icon={<TriangleAlert size={18} />}>
          <Heading>Couldn't load the map</Heading>
          <Body>{error ?? "Check the dev API logs."}</Body>
        </CanvasMessage>
      )}

      {status === "ready" && map && <Graph map={map} />}
    </section>
  )
}

function CanvasMessage({
  icon,
  children,
}: {
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <div className="grid h-full place-items-center">
      <div className="flex max-w-md flex-col items-center gap-3 px-6 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface text-accent-muted">
          {icon}
        </span>
        {children}
      </div>
    </div>
  )
}

function Heading({ children }: { children: ReactNode }) {
  return <h2 className="font-semibold text-base">{children}</h2>
}

function Body({ children }: { children: ReactNode }) {
  return <p className="text-text-muted text-sm">{children}</p>
}

function Mono({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-surface px-1 py-0.5 font-mono text-text text-xs">
      {children}
    </code>
  )
}
