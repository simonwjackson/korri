import { describe, expect, it } from "bun:test"
import { buildSwayShortcutCommand } from "./sway-actions"

describe("sway shortcut actions", () => {
  it("builds workspace switching commands", () => {
    expect(buildSwayShortcutCommand("workspace-prev")).toEqual({
      command: "swaymsg",
      args: ["workspace prev_on_output"],
    })
    expect(buildSwayShortcutCommand("workspace-next")).toEqual({
      command: "swaymsg",
      args: ["workspace next_on_output"],
    })
  })

  it("builds focused-window output move commands", () => {
    expect(buildSwayShortcutCommand("move-output-up")).toEqual({
      command: "swaymsg",
      args: ["move container to output up"],
    })
    expect(buildSwayShortcutCommand("move-output-down")).toEqual({
      command: "swaymsg",
      args: ["move container to output down"],
    })
  })
})
