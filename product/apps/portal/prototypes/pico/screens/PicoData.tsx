/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 *
 * The one boilerplate seam every data-backed gallery screen mounts through, so
 * the Effect plumbing (isolated registry + AsyncResult branching) lives in ONE
 * place instead of being re-spelled on ~40 screens:
 *
 *  - `<RegistryProvider>` gives each screen its own registry, so a per-screen
 *    layer swap / behavior seed is isolated (DataEffectScreens demonstrates the
 *    swap; the Library demo states seed a behavior layer).
 *  - `useAtomInitialValues(seed)` seeds behavior layers (loading-forever /
 *    fail-list / empty / defect) the way the real app seeds route layers
 *    (HomeRuntimeLayersRoot.tsx:56) — no bespoke loading/error props.
 *  - `AsyncResult.matchWithWaiting` renders waiting → data, with sensible 8-bit
 *    defaults a screen can override per-state.
 *
 * A screen reads ONE atom; multi-domain screens combine their atoms upstream
 * with `AsyncResult.all(...)` so the value handed to `children` is a plain bag.
 */
import {
  RegistryProvider,
  useAtomInitialValues,
  useAtomValue,
} from "@effect/atom-react"
import type * as Atom from "effect/unstable/reactivity/Atom"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import type { ReactNode } from "react"
import { Hero, PicoIcon, Screen } from "./kit"

/** Initial-value pairs, e.g. `[[picoLibraryLayerAtom, PicoLibrary.FailList]]`. */
export type LayerSeed = Iterable<readonly [Atom.Atom<unknown>, unknown]>

interface PicoDataProps<A> {
  readonly atom: Atom.Atom<AsyncResult.AsyncResult<A, unknown>>
  /** Status-bar title for the default waiting / error / defect shells. */
  readonly title?: string
  /** Behavior layers to seed for this screen's registry. */
  readonly seed?: LayerSeed
  readonly waiting?: () => ReactNode
  readonly error?: (error: unknown) => ReactNode
  readonly defect?: (defect: unknown) => ReactNode
  readonly children: (value: A) => ReactNode
}

export function PicoData<A>(props: PicoDataProps<A>) {
  // Fresh registry per mount so a layer swap / seed is isolated to this screen.
  return (
    <RegistryProvider>
      <PicoDataInner {...props} />
    </RegistryProvider>
  )
}

function PicoDataInner<A>({
  atom,
  title,
  seed,
  waiting,
  error,
  defect,
  children,
}: PicoDataProps<A>) {
  useAtomInitialValues(seed ?? [])
  const result = useAtomValue(atom)
  return AsyncResult.matchWithWaiting(result, {
    onWaiting: () =>
      waiting?.() ?? (
        <Screen title={title} className="center">
          <Hero spinner title="LOADING…" />
        </Screen>
      ),
    onError: cause =>
      error?.(cause) ?? (
        <Screen tone="alert" title={title} className="center">
          <Hero
            glyph={<PicoIcon name="close" />}
            glyphTone="bad"
            title="LOAD FAILED"
            message={String(cause)}
          />
        </Screen>
      ),
    onDefect: cause =>
      defect?.(cause) ?? (
        <Screen tone="alert" title={title} className="center">
          <Hero
            glyph={<PicoIcon name="close" />}
            glyphTone="bad"
            title="DEFECT"
            message={String(cause)}
          />
        </Screen>
      ),
    onSuccess: success => children(success.value),
  })
}
