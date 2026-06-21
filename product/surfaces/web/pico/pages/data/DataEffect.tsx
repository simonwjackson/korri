/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 *
 * The Effect v4 "mount-without-mocking" demo. The SAME page reads `picoGamesAtom`
 * and renders whatever the provided layer yields; SWAP flips `picoLibraryLayerAtom`
 * between PicoLibrary.Fixtures (instant) and .Live (simulated RPC) — no mocks, no
 * conditional imports. Owns its own registry so the swap is isolated to it.
 */
import {
  RegistryProvider,
  useAtomRefresh,
  useAtomSet,
  useAtomValue,
} from "@effect/atom-react"
import { Option } from "effect"
import { useState } from "react"
import {
  picoGamesAtom,
  picoLibraryLayerAtom,
} from "../../data/pico-library-atoms"
import { PicoLibrary } from "../../data/pico-library-service"
import type { PicoGame } from "../../fixtures"
import {
  PicoDataState,
  type PicoDataState as PicoDataStateValue,
} from "../../screens/PicoDataState"
import { Dim } from "../../ui/atoms/Dim"
import { Icon } from "../../ui/atoms/Icon"
import { Spinner } from "../../ui/atoms/Spinner"
import { GameCartUnmarked } from "../../ui/molecules/GameCartUnmarked"
import { Hero } from "../../ui/organisms/Hero"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function DataEffect() {
  return (
    <RegistryProvider>
      <DataEffectBody />
    </RegistryProvider>
  )
}

function DataEffectBody() {
  const state = PicoDataState.fromResult(useAtomValue(picoGamesAtom))
  const setLayer = useAtomSet(picoLibraryLayerAtom)
  const refresh = useAtomRefresh(picoGamesAtom)
  const [mode, setMode] = useState<"fixtures" | "live">("fixtures")

  const swap = () => {
    const next = mode === "fixtures" ? "live" : "fixtures"
    setMode(next)
    setLayer(next === "fixtures" ? PicoLibrary.Fixtures : PicoLibrary.Live)
    refresh()
  }

  return (
    <ScreenShell
      title="PICO ▸ DATA (EFFECT)"
      hints={[
        { key: "a", label: "SWAP LAYER" },
        { key: "b", label: "BACK" },
      ]}
    >
      <div className="pcData">
        <div className="pcData-bar">
          <span className="pcData-tag">
            LAYER&nbsp;
            <b>{mode === "fixtures" ? "FIXTURES" : "LIVE (sim)"}</b>
          </span>
          <button type="button" className="pcData-swap" onClick={swap}>
            <Icon name="restart" /> SWAP
          </button>
        </div>

        <DataEffectLoading state={state} />
        <DataEffectLoadError state={state} />
        <DataEffectDefect state={state} />
        <DataEffectReady state={state} />

        <p className="pcData-note">
          Same component, no mocks. <b>FIXTURES</b> resolves instantly from
          static data; <b>LIVE</b> simulates the RPC layer (~700ms). The screen
          only reads an atom — the layer is swapped at the boundary.
        </p>
      </div>
    </ScreenShell>
  )
}

type DataEffectState = PicoDataStateValue<readonly PicoGame[], unknown>

function DataEffectLoading({ state }: { readonly state: DataEffectState }) {
  return Option.match(
    PicoDataState.select<readonly PicoGame[], unknown, "Loading">("Loading")(
      state,
    ),
    {
      onNone: () => null,
      onSome: () => (
        <div className="pcData-state">
          <Spinner /> <Dim>running list() through the provided layer…</Dim>
        </div>
      ),
    },
  )
}

function DataEffectLoadError({ state }: { readonly state: DataEffectState }) {
  return Option.match(
    PicoDataState.select<readonly PicoGame[], unknown, "LoadError">(
      "LoadError",
    )(state),
    {
      onNone: () => null,
      onSome: ({ error }) => (
        <Hero
          glyph={<Icon name="close" />}
          glyphTone="bad"
          title="LOAD FAILED"
          message={String(error)}
        />
      ),
    },
  )
}

function DataEffectDefect({ state }: { readonly state: DataEffectState }) {
  return Option.match(
    PicoDataState.select<readonly PicoGame[], unknown, "Defect">("Defect")(
      state,
    ),
    {
      onNone: () => null,
      onSome: ({ defect }) => (
        <Hero
          glyph={<Icon name="close" />}
          glyphTone="bad"
          title="DEFECT"
          message={String(defect)}
        />
      ),
    },
  )
}

function DataEffectReady({ state }: { readonly state: DataEffectState }) {
  return Option.match(
    PicoDataState.select<readonly PicoGame[], unknown, "Ready">("Ready")(state),
    {
      onNone: () => null,
      onSome: ({ value }) => (
        <div className="pcData-grid">
          {value.slice(0, 12).map(game => (
            <div className="pcData-cart" key={game.id}>
              <GameCartUnmarked game={game} />
            </div>
          ))}
        </div>
      ),
    },
  )
}
