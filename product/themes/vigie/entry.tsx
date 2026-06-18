import type { KorriThemeEntrypoint } from "@platform/theme/bridge"
import { createRoot } from "react-dom/client"
import { vigieCockpitFixture } from "./fixtures/cockpit-fixtures"
import { VigieCockpitPage } from "./pages/VigieCockpitPage"

// vigie — the developer mission-control cockpit. Successor to evier: it absorbs
// the stream/device control surface and adds observability tiers (unified
// session, device metrics + governors, subsystem health). The entrypoint uses
// live RPC data with fixtures as the loading/fallback shape.

export const vigieTheme: KorriThemeEntrypoint = {
  id: "vigie",
  mount(host, { bridge }) {
    const root = createRoot(host)
    root.render(
      <VigieCockpitPage bridge={bridge} fixture={vigieCockpitFixture} live />,
    )
    return () => root.unmount()
  },
}

export default vigieTheme
