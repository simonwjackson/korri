import { describe, expect, it } from "bun:test"
import {
  buildBandaiGamescopeAcceptancePlan,
  runBandaiGamescopeAcceptanceCommand,
} from "./gamescope-control-bandai-acceptance"

describe("gamescope Bandai acceptance harness", () => {
  it("builds a repeatable DSI-2 capture and Gamescope control sequence", () => {
    const plan = buildBandaiGamescopeAcceptancePlan({
      host: "bandai",
      sshPort: 2222,
      remoteRoot: "/tmp/gamescope-acceptance",
      socketPath: "/storage/probe-a-resolution/run/control.sock",
    })

    expect(plan.sshTarget).toEqual(["ssh", "-p", "2222", "root@bandai"])
    expect(plan.steps.map(step => step.name)).toEqual([
      "prepare-output-dir",
      "hello",
      "state-before",
      "capture-before",
      "enable-fsr",
      "sharpness-zero",
      "capture-fsr-sharp0",
      "mode-960x540",
      "capture-960x540",
      "mode-1280x720",
      "capture-1280x720",
      "mode-640x360",
      "capture-640x360-return",
      "state-after",
    ])
    expect(
      plan.steps.find(step => step.name === "capture-before")?.remote,
    ).toContain("grim -o DSI-2 /tmp/gamescope-acceptance/00-before.png")
    expect(
      plan.steps.find(step => step.name === "enable-fsr")?.remote,
    ).toContain(
      "gamescope-control --socket /storage/probe-a-resolution/run/control.sock filter fsr",
    )
    expect(
      plan.steps.find(step => step.name === "mode-960x540")?.remote,
    ).toContain(
      "gamescope-control --socket /storage/probe-a-resolution/run/control.sock mode 960x540",
    )
  })

  it("prints a JSON command plan in dry-run mode", async () => {
    const output: string[] = []
    const exitCode = await runBandaiGamescopeAcceptanceCommand(
      ["--dry-run", "--remote-root", "/tmp/gamescope dry-run"],
      { write: line => output.push(line) },
    )

    expect(exitCode).toBe(0)
    const parsed = JSON.parse(output.join("\n"))
    expect(parsed.steps.map((step: { name: string }) => step.name)).toContain(
      "capture-before",
    )
    expect(
      parsed.steps.find(
        (step: { name: string }) => step.name === "capture-before",
      ).remote,
    ).toContain("'/tmp/gamescope dry-run/00-before.png'")
  })
})
