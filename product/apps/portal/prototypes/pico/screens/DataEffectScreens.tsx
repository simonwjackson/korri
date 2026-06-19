/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 * Gallery group: DATA — the Effect v4 "mount-without-mocking" shape in action.
 * The SAME component reads `picoGamesAtom` and renders whatever the provided
 * layer yields. The SWAP button flips `picoLibraryLayerAtom` between
 * `PicoLibrary.Fixtures` (instant static data) and `PicoLibrary.Live` (simulated
 * RPC latency) — no mocks, no conditional imports, no component changes.
 */
import {
  RegistryProvider,
  useAtomRefresh,
  useAtomSet,
  useAtomValue,
} from "@effect/atom-react"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { useState } from "react"
import {
  picoGamesAtom,
  picoLibraryLayerAtom,
} from "../data/pico-library-atoms"
import { PicoLibrary } from "../data/pico-library-service"
import { Dim, Hero, PicoCart, PicoIcon, Screen, Spinner } from "./kit"

export function DataEffectScreen() {
  // Fresh registry per mount so the layer swap is isolated to this screen.
  return (
    <RegistryProvider>
      <DataEffectBody />
    </RegistryProvider>
  )
}

function DataEffectBody() {
  const result = useAtomValue(picoGamesAtom)
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
    <Screen
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
            <PicoIcon name="restart" /> SWAP
          </button>
        </div>

        {AsyncResult.matchWithWaiting(result, {
          onWaiting: () => (
            <div className="pcData-state">
              <Spinner /> <Dim>running list() through the provided layer…</Dim>
            </div>
          ),
          onError: error => (
            <Hero
              glyph={<PicoIcon name="close" />}
              glyphTone="bad"
              title="LOAD FAILED"
              message={String(error)}
            />
          ),
          onDefect: defect => (
            <Hero
              glyph={<PicoIcon name="close" />}
              glyphTone="bad"
              title="DEFECT"
              message={String(defect)}
            />
          ),
          onSuccess: success => (
            <div className="pcData-grid">
              {success.value.slice(0, 12).map(game => (
                <div className="pcData-cart" key={game.id}>
                  <PicoCart game={game} showFav={false} />
                </div>
              ))}
            </div>
          ),
        })}

        <p className="pcData-note">
          Same component, no mocks. <b>FIXTURES</b> resolves instantly from static
          data; <b>LIVE</b> simulates the RPC layer (~700ms). The screen only
          reads an atom — the layer is swapped at the boundary.
        </p>
      </div>
    </Screen>
  )
}
