/**
 * Status Bar molecule catalog entry. The live device-fact mount is provided by
 * the lab adapter (picoSurfacePartMount); this static render is the fallback.
 */

import { PicoStatusBar } from "./PicoStatusBar"
import { PICO_DESIGN_PARTS } from "./pico-design-parts"
import type { StorySpec } from "./story-spec"

export default {
  name: "Status Bar",
  note: "clock / wifi / battery",
  designPartId: PICO_DESIGN_PARTS.statusBar.id,
  render: () => (
    <PicoStatusBar
      label="PICO"
      batteryPercent={82}
      connected
      charging={false}
    />
  ),
} satisfies StorySpec
