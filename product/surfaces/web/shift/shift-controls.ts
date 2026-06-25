/**
 * Shift's design-tool live controls, declared as data (`WorkshopControl[]`) for
 * the lab/workshop to render with neutral chrome. Currently one knob: a "Launch"
 * selector that previews the cinematic home's launch-feedback states (Starting,
 * Now playing, each failure kind, Defect, Unavailable) without a real launch.
 */
import type { WorkshopControl } from "@tools/theme-workshop"
import { useState } from "react"
import {
  SHIFT_LAUNCH_PREVIEWS,
  setShiftLaunchPreview,
} from "./shift-launch-preview"

export function useShiftControls(): readonly WorkshopControl[] {
  const [previewId, setPreviewId] = useState("off")

  return [
    {
      kind: "select",
      id: "launch-preview",
      label: "Launch",
      value: previewId,
      options: SHIFT_LAUNCH_PREVIEWS.map(option => ({
        value: option.id,
        label: option.label,
      })),
      title: "preview the cinematic home's launch feedback states",
      onChange: next => {
        setPreviewId(next)
        const option = SHIFT_LAUNCH_PREVIEWS.find(entry => entry.id === next)
        setShiftLaunchPreview(option?.state ?? null)
      },
    },
  ]
}
