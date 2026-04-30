import { Sparkles } from "lucide-react"

export function App() {
  return (
    <main className="grid min-h-screen place-items-center bg-bg text-text">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface text-accent">
          <Sparkles size={20} aria-hidden="true" />
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="font-semibold text-2xl tracking-tight">
            Feature Map Explorer
          </h1>
          <p className="text-text-muted text-sm">
            Scaffold ready. Visualization, inspector, and editor land in later
            units.
          </p>
        </div>
      </div>
    </main>
  )
}
