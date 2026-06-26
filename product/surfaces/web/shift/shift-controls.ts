/**
 * Shift's design-tool live controls, declared as data (`WorkshopControl[]`) for
 * the lab/workshop to render with neutral chrome. The "Launch" selector previews
 * the cinematic home's launch-feedback states — its options are derived from
 * `LAUNCH_STATE_VARIANTS` (i.e. from LaunchState.tags), the same source the
 * gallery part reads, so the list can never drift from the state machine.
 */
import type { WorkshopControl } from "@tools/theme-workshop"
import { useState } from "react"
import {
  LAUNCH_LIVE_TAG,
  LAUNCH_STATE_VARIANTS,
  setShiftLaunchPreview,
} from "./shift-launch-preview"

export function useShiftControls(): readonly WorkshopControl[] {
  const [tag, setTag] = useState<string>(LAUNCH_LIVE_TAG)

  return [
    {
      kind: "select",
      id: "launch-preview",
      label: "Launch",
      value: tag,
      options: LAUNCH_STATE_VARIANTS.map(variant => ({
        value: variant.tag,
        label: variant.tag === LAUNCH_LIVE_TAG ? "Idle (live)" : variant.label,
      })),
      title: "preview the cinematic home's launch feedback states",
      onChange: next => {
        setTag(next)
        const variant = LAUNCH_STATE_VARIANTS.find(entry => entry.tag === next)
        // The live tag clears the override so the real controller drives.
        setShiftLaunchPreview(
          next === LAUNCH_LIVE_TAG || !variant ? null : variant.value,
        )
      },
    },
  ]
}
