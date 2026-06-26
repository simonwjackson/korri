/**
 * Gallery part — a Pico data-backed screen across every PicoDataState case,
 * derived from `PicoDataState.tags`. Proves the derive-don't-author pattern is
 * not Shift-specific: a different surface, a different state machine, the same
 * primitive. Each entry seeds one AsyncResult into the real `PicoData` seam, so
 * the state machine (not a hand-mapped switch) picks the body. The producer is
 * exhaustive — a new data state can't be added without a sample here.
 */
import { stateVariants } from "@platform/state/state-variants"
import { Cause } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import type { Story } from "@tools/theme-workshop"
import { picoGames } from "../fixtures"
import { Hero } from "../ui/organisms/Hero"
import { ScreenShell as Screen } from "../ui/templates/ScreenShell"
import { PicoData, type LayerSeed } from "./PicoData"
import { PicoDataState } from "./PicoDataState"

type LibraryResult = AsyncResult.AsyncResult<number, unknown>

const previewAtom = Atom.make<LibraryResult>(AsyncResult.initial(true))

const picoDataSamples: {
  readonly [Tag in (typeof PicoDataState.tags)[number]]: () => LibraryResult
} = {
  Loading: () => AsyncResult.initial(true),
  Ready: () => AsyncResult.success(picoGames.length),
  LoadError: () => AsyncResult.fail(new Error("Library is offline")),
  Defect: () => AsyncResult.failure(Cause.die("Unexpected library defect")),
}

export const PicoDataStates = stateVariants(PicoDataState, picoDataSamples).map(
  variant => ({
    id: `pico-library-${variant.tag.toLowerCase()}`,
    layer: "page" as const,
    name: `Library · ${variant.label}`,
    note: "Data states",
    surface: true,
    render: () => (
      <PicoData
        atom={previewAtom}
        seed={[[previewAtom, variant.value]] as LayerSeed}
        title="LIBRARY"
      >
        {count => (
          <Screen title="LIBRARY" className="center">
            <Hero title={`${count} GAMES`} message="library ready" />
          </Screen>
        )}
      </PicoData>
    ),
  }),
) satisfies readonly Story[]
