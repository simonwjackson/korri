import type { SessionControls } from "@contracts/generated/korrid"
import { createInMemoryKorridClient } from "../korrid/client"
import {
  createOverlayController,
  type OverlayController,
  type OverlayPlatform,
} from "./overlay-controller"

export const IN_MEMORY_OVERLAY_LAUNCH_ID =
  "0123456789abcdef0123456789abcdef"

const fixtureControls: SessionControls = {
  launchId: IN_MEMORY_OVERLAY_LAUNCH_ID,
  title: "Browser gameplay fixture",
  groups: [
    {
      id: "fixture-controls",
      label: "Gameplay",
      controls: [
        {
          id: "fixture-command",
          label: "Open menu",
          enabled: true,
          destructive: false,
          dismissOnSuccess: true,
          interaction: { kind: "command" },
        },
        {
          id: "fixture-toggle",
          label: "Fill screen",
          enabled: true,
          destructive: false,
          dismissOnSuccess: false,
          interaction: {
            kind: "toggle",
            payload: { value: false, trueLabel: "On", falseLabel: "Off" },
          },
        },
        {
          id: "fixture-choice",
          label: "Mouse mode",
          enabled: true,
          destructive: false,
          dismissOnSuccess: false,
          interaction: {
            kind: "choice",
            payload: {
              value: "trackpad",
              options: [
                { value: "trackpad", label: "Trackpad" },
                { value: "direct", label: "Direct" },
              ],
            },
          },
        },
        {
          id: "fixture-range",
          label: "Sharpness",
          enabled: true,
          destructive: false,
          dismissOnSuccess: false,
          interaction: {
            kind: "range",
            payload: { value: 50, min: 0, max: 100, step: 5 },
          },
        },
        {
          id: "fixture-disabled",
          label: "Unavailable control",
          enabled: false,
          disabledReason: "No executor is connected in this fixture.",
          destructive: false,
          dismissOnSuccess: false,
          interaction: { kind: "command" },
        },
        {
          id: "fixture-danger",
          label: "Quit fixture",
          enabled: true,
          destructive: true,
          dismissOnSuccess: true,
          interaction: { kind: "command" },
        },
      ],
    },
  ],
}

const browserPlatform: OverlayPlatform = {
  dismiss() {},
  requestAuthorityRefresh() {},
  async executeProtectedInstruction() {
    return {
      _tag: "Unavailable",
      message: "Platform execution is unavailable in the browser fixture.",
    }
  },
}

/** Real in-memory client/controller composition used by browser development. */
export function createInMemoryOverlayController(
  behavior: "ok" | "unavailable" | "invoke-fail" = "ok",
): OverlayController {
  return createOverlayController({
    launchId: IN_MEMORY_OVERLAY_LAUNCH_ID,
    korrid: createInMemoryKorridClient({
      sessionControls: fixtureControls,
      sessionControlBehavior: behavior,
    }),
    platform: browserPlatform,
  })
}
