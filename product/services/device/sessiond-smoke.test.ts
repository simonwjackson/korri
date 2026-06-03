import { describe, expect, it } from "bun:test"
import { evaluateSessiondSmoke } from "./sessiond-smoke"
import type { SwayNode } from "./sessiond-sway"

const compliantTree: SwayNode = {
  id: 1,
  nodes: [
    {
      id: 2,
      nodes: [
        {
          id: 10,
          name: "Korri",
          app_id: "korri-desktop",
          focused: true,
          fullscreen_mode: 1,
          window_properties: { title: "Korri", class: "Electrobun" },
        },
      ],
    },
  ],
}

describe("sessiond smoke evaluation", () => {
  it("passes when sessiond is home and Sway has one focused fullscreen Korri window", () => {
    expect(
      evaluateSessiondSmoke({
        status: {
          state: { mode: "home" },
          renderer: { kind: "electrobun", pid: 123 },
        },
        swayTree: compliantTree,
      }),
    ).toEqual({ ok: true, issues: [] })
  })

  it("fails when sessiond is not home", () => {
    const report = evaluateSessiondSmoke({
      status: { state: { mode: "game" }, renderer: { kind: "electrobun" } },
      swayTree: compliantTree,
    })

    expect(report.ok).toBe(false)
    expect(report.issues).toContain(
      "sessiond electrobun renderer is game, not home",
    )
  })

  it("fails when the Sway invariant still needs repair", () => {
    const report = evaluateSessiondSmoke({
      status: { state: { mode: "home" }, renderer: { kind: "electrobun" } },
      swayTree: { id: 1, nodes: [] },
    })

    expect(report.ok).toBe(false)
    expect(report.issues.join("\n")).toContain("relaunch-renderer")
    expect(report.issues.join("\n")).toContain("electrobun renderer")
  })
})
