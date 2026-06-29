/**
 * Shift library — Variant E: the Concierge (intent-first).
 *
 * The library as a question, not a collection. The front door is a column of
 * intents — Jump back in, My favorites, Most played, Never played, Surprise me —
 * never the wall. Pick one and a small handful of covers answers; `back` returns
 * to the prompts. Sorting and filtering stop being chrome and become things you
 * say. Intent resolution is the shared pure intents core; this page only owns
 * which intent is open. Anti-dumping-ground by construction: "everything" is
 * never the default view.
 */
import { useInputAction } from "@platform/react/input/use-input-action"
import { useMemo, useState } from "react"
import { ShiftLibraryTile } from "./ShiftLibraryTile"
import type { ShiftLibraryGame } from "./shift-library-game"
import {
  resolveShiftLibraryIntent,
  SHIFT_LIBRARY_INTENTS,
  type ShiftLibraryIntent,
} from "./shift-library-intents"

export interface ShiftLibraryConciergeProps {
  readonly games: readonly ShiftLibraryGame[]
  readonly title?: string
  readonly onSelect?: (id: string) => void
  readonly onBack?: () => void
}

export function ShiftLibraryConcierge({
  games,
  title = "What do you feel like?",
  onSelect,
  onBack,
}: ShiftLibraryConciergeProps) {
  const [intent, setIntent] = useState<ShiftLibraryIntent | null>(null)

  const results = useMemo(
    () => (intent ? resolveShiftLibraryIntent(games, intent.id) : []),
    [games, intent],
  )

  // `back` steps out of an answer to the prompts first, then leaves entirely.
  useInputAction("back", () => {
    if (intent) setIntent(null)
    else onBack?.()
  })

  return (
    <div data-shift-library className="shift-lib shift-lib-concierge intrinsic">
      {intent ? (
        <>
          <header className="shift-lib-top">
            <button
              type="button"
              className="shift-lib-options-btn"
              onClick={() => setIntent(null)}
            >
              ‹ Ask again
            </button>
            <h1 className="shift-lib-heading">{intent.label}</h1>
          </header>

          {results.length > 0 ? (
            <div className="shift-lib-grid">
              {results.map(game => (
                <ShiftLibraryTile
                  key={game.id}
                  game={game}
                  onSelect={onSelect}
                />
              ))}
            </div>
          ) : (
            <p className="shift-lib-empty">Nothing here yet — try another.</p>
          )}
        </>
      ) : (
        <>
          <header className="shift-lib-top">
            <h1 className="shift-lib-heading">{title}</h1>
          </header>

          <div className="shift-lib-intents">
            {SHIFT_LIBRARY_INTENTS.map(option => (
              <button
                type="button"
                key={option.id}
                className="shift-lib-intent"
                onClick={() => setIntent(option)}
              >
                <span className="shift-lib-intent-label">{option.label}</span>
                <span className="shift-lib-intent-blurb">{option.blurb}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
