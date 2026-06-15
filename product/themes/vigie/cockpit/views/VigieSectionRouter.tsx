import { useVigieCockpit } from "../VigieCockpit.context"
import { VigieInputsView } from "./VigieInputsView"
import { VigieLibraryView } from "./VigieLibraryView"
import { VigieLogsView } from "./VigieLogsView"
import { VigieOverviewView } from "./VigieOverviewView"
import { VigieSessionsView } from "./VigieSessionsView"
import { VigieTelemetryView } from "./VigieTelemetryView"

// Picks the active page view. No router needed — vigie mounts standalone, so
// the sidebar drives a section in context and this swaps the content.

export function VigieSectionRouter() {
  const { section } = useVigieCockpit()

  switch (section) {
    case "sessions":
      return <VigieSessionsView />
    case "library":
      return <VigieLibraryView />
    case "telemetry":
      return <VigieTelemetryView />
    case "inputs":
      return <VigieInputsView />
    case "logs":
      return <VigieLogsView />
    default:
      return <VigieOverviewView />
  }
}
