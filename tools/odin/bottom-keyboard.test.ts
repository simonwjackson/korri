import { describe, expect, it } from "bun:test"
import {
  buildBottomKeyboardCommand,
  selectBottomOutput,
} from "./bottom-keyboard"

const outputs = [
  {
    name: "top",
    active: true,
    rect: { x: 0, y: 0, width: 1920, height: 1080 },
  },
  {
    name: "bottom",
    active: true,
    rect: { x: 0, y: 1080, width: 1920, height: 800 },
  },
]

const thorOutputs = [
  {
    name: "DSI-2",
    active: true,
    rect: { x: 0, y: 0, width: 1920, height: 1080 },
  },
  {
    name: "DSI-1",
    active: true,
    rect: { x: 340, y: 1080, width: 1240, height: 1080 },
  },
]

describe("bottom keyboard command", () => {
  it("selects the enabled output with the largest y coordinate", () => {
    expect(selectBottomOutput(outputs)?.name).toBe("bottom")
  })

  it("selects the lower output when Odin screens are stacked", () => {
    expect(selectBottomOutput(thorOutputs)?.name).toBe("DSI-1")
  })

  it("builds a configured keyboard command with the bottom output", () => {
    expect(
      buildBottomKeyboardCommand({
        configuredCommand: "wvkbd-mobintl --output {output}",
        outputs,
      }).command,
    ).toEqual({
      command: "wvkbd-mobintl",
      args: ["--output", "bottom"],
    })
  })

  it("adds an output argument for wvkbd commands that do not include a placeholder", () => {
    expect(
      buildBottomKeyboardCommand({
        configuredCommand: "wvkbd-mobintl",
        outputs: thorOutputs,
      }).command,
    ).toEqual({
      command: "wvkbd-mobintl",
      args: ["--output", "DSI-1"],
    })
  })

  it("prefers an explicitly configured output", () => {
    expect(
      buildBottomKeyboardCommand({
        configuredCommand: "osk --display {output}",
        configuredOutput: "DSI-1",
        outputs,
      }).command,
    ).toEqual({ command: "osk", args: ["--display", "DSI-1"] })
  })

  it("warns instead of throwing when no command is configured", () => {
    const result = buildBottomKeyboardCommand({ outputs })

    expect(result.command).toBeUndefined()
    expect(result.warning).toContain("KORRI_INPUTD_BOTTOM_KEYBOARD")
  })
})
