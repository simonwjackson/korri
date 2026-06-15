import { VigieLiveCockpitRoot } from "../cockpit/live/VigieLiveCockpitRoot"
import { VigieShell } from "../cockpit/shell/VigieShell"
import type { CockpitFixture } from "../cockpit/VigieCockpit.context"
import { VigieCockpitRoot } from "../cockpit/VigieCockpitRoot"
import { VigieSectionRouter } from "../cockpit/views/VigieSectionRouter"

// Composition root for the spike. The shadcn-admin shell owns navigation and
// chrome; the section router renders the active observability page.

export function VigieCockpitPage({
  fixture,
  live = false,
}: {
  readonly fixture: CockpitFixture
  readonly live?: boolean
}) {
  const content = (
    <VigieShell>
      <VigieSectionRouter />
    </VigieShell>
  )

  return live ? (
    <VigieLiveCockpitRoot fixture={fixture}>{content}</VigieLiveCockpitRoot>
  ) : (
    <VigieCockpitRoot fixture={fixture}>{content}</VigieCockpitRoot>
  )
}
