import type { CatalogSnapshotFacts } from "@platform/catalog/catalog-facts-source"
import {
  PICO_DATA_TAGS,
  type PicoCatalogResult,
  picoDataStateSamples,
  setPicoDataPreview,
} from "@product/surfaces/web/pico/pico-data-preview"
import {
  type LayerSeed,
  PicoData,
} from "@product/surfaces/web/pico/screens/PicoData"
import { Hero } from "@product/surfaces/web/pico/ui/organisms/Hero"
import { ScreenShell as Screen } from "@product/surfaces/web/pico/ui/templates/ScreenShell"
import * as Atom from "effect/unstable/reactivity/Atom"
import { axisOptionsFromTags, type LabStateAxis } from "../model/lab-state-axis"

type Tag = (typeof PICO_DATA_TAGS)[number]

const previewAtom = Atom.make<PicoCatalogResult>(picoDataStateSamples.Loading())

// Pico's catalog Data axis — the same model as Shift Home, minus Launch. The
// pin drives the pico-data preview singleton the live routes consult; the
// Matrix fan-out renders the seeded sample through the real PicoData seam.
const picoDataAxis: LabStateAxis = {
  id: "data",
  label: "Data",
  liveLabel: "Live",
  states: axisOptionsFromTags([...PICO_DATA_TAGS]),
  pin: tag => setPicoDataPreview(picoDataStateSamples[tag as Tag]()),
  release: () => setPicoDataPreview(null),
  renderSample: tag => (
    <PicoData
      atom={previewAtom}
      seed={[[previewAtom, picoDataStateSamples[tag as Tag]()]] as LayerSeed}
      title="LIBRARY"
    >
      {(facts: CatalogSnapshotFacts) =>
        facts.entries.length === 0 ? (
          // Match the live PicoHomeRoute, which maps a successful empty catalog
          // to the EMPTY fallback rather than a "0 GAMES" ready hero.
          <Screen title="LIBRARY" className="center">
            <Hero title="EMPTY" message="no games in library" />
          </Screen>
        ) : (
          <Screen title="LIBRARY" className="center">
            <Hero
              title={`${facts.entries.length} GAMES`}
              message="library ready"
            />
          </Screen>
        )
      }
    </PicoData>
  ),
}

export function picoAxesForScreen(screenPath: string): readonly LabStateAxis[] {
  return screenPath === "/" ? [picoDataAxis] : []
}
