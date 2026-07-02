/**
 * pico surface.
 *
 * The one boilerplate seam every data-backed gallery screen mounts through, so
 * the Effect plumbing (isolated registry + AsyncResult conversion) lives in ONE
 * place instead of being re-spelled on ~40 screens:
 *
 *  - `<RegistryProvider>` gives each screen its own registry, so a per-screen
 *    layer swap / behavior seed is isolated (DataEffectScreens demonstrates the
 *    swap; the Library demo states seed a behavior layer).
 *  - `useAtomInitialValues(seed)` seeds behavior layers (loading-forever /
 *    fail-list / empty / defect) the way the real app seeds route layers
 *    (HomeRuntimeLayersRoot.tsx:56) — no bespoke loading/error props.
 *  - `PicoDataState.fromResult` converts runtime state into a domain ADT before
 *    any rendering; the state-specific components below self-select from it.
 *
 * A screen reads ONE atom; multi-domain screens combine their atoms upstream
 * with `AsyncResult.all(...)` so the value handed to `children` is a plain bag.
 */
import {
  RegistryProvider,
  useAtomInitialValues,
  useAtomValue,
} from "@effect/atom-react"
import { Option } from "effect"
import type * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import type * as Atom from "effect/unstable/reactivity/Atom"
import { createContext, type ReactNode, useContext } from "react"
import { PicoIcon } from "../PicoIcon"
import { Spinner } from "../ui/atoms/Spinner"
import { Hero } from "../ui/organisms/Hero"
import { ScreenShell as Screen } from "../ui/templates/ScreenShell"
import {
  PicoDataState,
  type PicoDataState as PicoDataStateValue,
} from "./PicoDataState"

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

type PicoDataContextValue = PicoDataStateValue<unknown, unknown>

const PicoDataContext = createContext<PicoDataContextValue | null>(null)

function usePicoDataState(): PicoDataContextValue {
  const value = useContext(PicoDataContext)
  if (value === null) {
    throw new Error("usePicoDataState must be used within PicoData")
  }
  return value
}

function usePicoDataCase<Tag extends PicoDataContextValue["_tag"]>(tag: Tag) {
  return PicoDataState.select<unknown, unknown, Tag>(tag)(usePicoDataState())
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
  const state = PicoDataState.fromResult(useAtomValue(atom))

  return (
    <PicoDataContext.Provider value={state as PicoDataContextValue}>
      <PicoDataLoading title={title} waiting={waiting} />
      <PicoDataLoadError title={title} error={error} />
      <PicoDataDefect title={title} defect={defect} />
      <PicoDataReady>{children as (value: unknown) => ReactNode}</PicoDataReady>
    </PicoDataContext.Provider>
  )
}

function PicoDataLoading({
  title,
  waiting,
}: {
  readonly title?: string
  readonly waiting?: () => ReactNode
}) {
  return Option.match(usePicoDataCase("Loading"), {
    onNone: () => null,
    onSome: () =>
      waiting?.() ?? (
        <Screen title={title} className="center">
          <Hero adornment={<Spinner />} title="LOADING…" />
        </Screen>
      ),
  })
}

function PicoDataLoadError({
  title,
  error,
}: {
  readonly title?: string
  readonly error?: (error: unknown) => ReactNode
}) {
  return Option.match(usePicoDataCase("LoadError"), {
    onNone: () => null,
    onSome: state =>
      error?.(state.error) ?? (
        <Screen tone="alert" title={title} className="center">
          <Hero
            glyph={<PicoIcon name="close" />}
            glyphTone="bad"
            title="LOAD FAILED"
            message={String(state.error)}
          />
        </Screen>
      ),
  })
}

function PicoDataDefect({
  title,
  defect,
}: {
  readonly title?: string
  readonly defect?: (defect: unknown) => ReactNode
}) {
  return Option.match(usePicoDataCase("Defect"), {
    onNone: () => null,
    onSome: state =>
      defect?.(state.defect) ?? (
        <Screen tone="alert" title={title} className="center">
          <Hero
            glyph={<PicoIcon name="close" />}
            glyphTone="bad"
            title="DEFECT"
            message={String(state.defect)}
          />
        </Screen>
      ),
  })
}

function PicoDataReady({
  children,
}: {
  readonly children: (value: unknown) => ReactNode
}) {
  return Option.match(usePicoDataCase("Ready"), {
    onNone: () => null,
    onSome: state => children(state.value),
  })
}
