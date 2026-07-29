import type { LaunchablesState } from "./state"

interface LaunchablesListProps {
  readonly state: Extract<LaunchablesState, { _tag: "Ready" }>
}

/** Pure view of the Ready case. Selection arrives via the state ADT. */
export function LaunchablesList({ state }: LaunchablesListProps) {
  return (
    <div className="w-full max-w-xl space-y-6 p-8">
      <h1 className="text-3xl font-bold tracking-tight">Korri</h1>
      {state.notice !== null && (
        <p className="rounded-lg bg-red-950 px-4 py-3 text-red-300">
          {state.notice}
        </p>
      )}
      <ul className="space-y-2">
        {state.items.map((item, index) => (
          <li
            key={item.packageName}
            className={
              index === state.selectedIndex
                ? "rounded-xl bg-zinc-100 px-5 py-4 text-lg font-semibold text-zinc-950"
                : "rounded-xl bg-zinc-900 px-5 py-4 text-lg text-zinc-300"
            }
          >
            {item.label}
          </li>
        ))}
      </ul>
      {state.items.length === 0 && (
        <p className="text-zinc-400">No launchable apps found.</p>
      )}
    </div>
  )
}
