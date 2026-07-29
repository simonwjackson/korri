import { entryKey, entryLabel, LaunchablesState } from "./state"
import type { LaunchablesState as State } from "./state"

interface LaunchablesListProps {
  readonly state: Extract<State, { _tag: "Ready" }>
}

/** Pure view of the Ready case. Selection arrives via the state ADT. */
export function LaunchablesList({ state }: LaunchablesListProps) {
  const sections = LaunchablesState.sections(state)

  return (
    <div className="w-full max-w-xl space-y-6 p-8">
      <h1 className="text-3xl font-bold tracking-tight">Korri</h1>
      {state.notice !== null && (
        <p className="rounded-lg bg-red-950 px-4 py-3 text-red-300">
          {state.notice}
        </p>
      )}
      {sections.map(section => (
        <section key={section.title} className="space-y-2">
          <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase">
            {section.title}
          </h2>
          <ul className="space-y-2">
            {section.entries.map((entry, offset) => {
              const index = section.startIndex + offset
              return (
                <li
                  key={entryKey(entry)}
                  className={
                    index === state.selectedIndex
                      ? "rounded-xl bg-zinc-100 px-5 py-4 text-lg font-semibold text-zinc-950"
                      : "rounded-xl bg-zinc-900 px-5 py-4 text-lg text-zinc-300"
                  }
                >
                  {entryLabel(entry)}
                  {entry.kind === "now-playing" && (
                    <span className="mt-1 block text-sm font-normal opacity-60">
                      Confirm resumes · Select stops
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
      {state.entries.length === 0 && (
        <p className="text-zinc-400">Nothing to launch yet.</p>
      )}
      <p className="text-sm text-zinc-600">{__PORTAL_BUILD__}</p>
    </div>
  )
}
