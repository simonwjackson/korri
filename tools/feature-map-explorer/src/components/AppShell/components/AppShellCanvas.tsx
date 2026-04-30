import { GitBranch, Loader2, TriangleAlert } from "lucide-react"
import { useAppShell } from "../AppShell.context"

/*
 * Canvas placeholder. Until Unit 5 lands the React Flow + dagre graph,
 * this surface shows the current map status and (when ready) a brief
 * summary of the loaded data. Selection still happens through the rail
 * — this is the read-only window onto where the graph will be.
 */
export function AppShellCanvas() {
  const { status, map, error } = useAppShell()

  return (
    <section className="col-start-2 row-start-2 grid min-w-0 place-items-center bg-bg">
      {status === "loading" && (
        <CanvasMessage icon={<Loader2 size={18} className="animate-spin" />}>
          <Heading>Loading feature map…</Heading>
        </CanvasMessage>
      )}

      {status === "missing" && (
        <CanvasMessage icon={<TriangleAlert size={18} />}>
          <Heading>Feature map not generated</Heading>
          <Body>
            Run <Mono>just generate-feature-map</Mono>, or wait for the top-bar
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

      {status === "ready" && map && (
        <CanvasMessage icon={<GitBranch size={18} />}>
          <Heading>Graph canvas</Heading>
          <Body>
            {map.jobs.length} job{map.jobs.length === 1 ? "" : "s"} ·{" "}
            {map.briefs.length} brief{map.briefs.length === 1 ? "" : "s"} ·{" "}
            {map.features.length} feature{map.features.length === 1 ? "" : "s"}{" "}
            · {map.bdd.length} scenario file{map.bdd.length === 1 ? "" : "s"} ·{" "}
            {map.edges.length} edge{map.edges.length === 1 ? "" : "s"}
          </Body>
          <Body>
            React Flow + dagre layout lands in Unit 5. Use the rail on the left
            to select a node and inspect it on the right.
          </Body>
        </CanvasMessage>
      )}
    </section>
  )
}

function CanvasMessage({
  icon,
  children,
}: {
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex max-w-md flex-col items-center gap-3 px-6 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface text-accent-muted">
        {icon}
      </span>
      {children}
    </div>
  )
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="font-semibold text-base">{children}</h2>
}

function Body({ children }: { children: React.ReactNode }) {
  return <p className="text-text-muted text-sm">{children}</p>
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-surface px-1 py-0.5 font-mono text-text text-xs">
      {children}
    </code>
  )
}
