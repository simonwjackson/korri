import { SHIFT_DESIGN_PARTS } from "@product/surfaces/web/shift/shift-design-parts"
import type { LabDesignPass } from "./design-pass-model"
import { CalmerStatusBarTake } from "./takes/CalmerStatusBarTake"

export const activeDesignPass = {
  id: "shift-status-bar-ideas",
  name: "Status bar ideas",
  entries: [
    {
      id: "calmer-status-bar",
      role: "take",
      surfaceId: "shift",
      layer: "molecule",
      part: CalmerStatusBarTake,
      basedOnDesignPartId: SHIFT_DESIGN_PARTS.statusBar.id,
      prompt: "Make this feel calmer and more premium.",
    },
  ],
} satisfies LabDesignPass
