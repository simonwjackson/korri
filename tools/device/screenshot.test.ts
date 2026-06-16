import { describe, expect, it } from "bun:test"
import {
  buildDeviceScreenshotPlan,
  captureDeviceScreenshot,
  DeviceScreenshotError,
  parseArgs,
  parseSwayOutputs,
  selectSwayOutput,
} from "./screenshot"

const swayOutputsJson = JSON.stringify([
  {
    name: "DSI-1",
    active: true,
    rect: { width: 1240, height: 1080 },
  },
  {
    name: "DSI-2",
    active: true,
    rect: { width: 1920, height: 1080 },
  },
  {
    name: "DISABLED",
    active: false,
    rect: { width: 3840, height: 2160 },
  },
])

describe("device screenshot tool", () => {
  it("defaults to the bandai deployment target", () => {
    expect(buildDeviceScreenshotPlan()).toMatchObject({
      device: "bandai",
      host: "bandai-guest-ip",
      sshConfig: "/tmp/bandai-deploy/ssh_config_ip",
      requestedOutput: "largest",
      waylandUser: "korri",
      xdgRuntimeDir: "/run/user/2000",
      waylandDisplay: "wayland-1",
    })
  })

  it("parses active sway outputs", () => {
    expect(parseSwayOutputs(swayOutputsJson)).toEqual([
      { name: "DSI-1", active: true, rect: { width: 1240, height: 1080 } },
      { name: "DSI-2", active: true, rect: { width: 1920, height: 1080 } },
      { name: "DISABLED", active: false, rect: { width: 3840, height: 2160 } },
    ])
  })

  it("selects the largest active output by default", () => {
    const selected = selectSwayOutput(
      parseSwayOutputs(swayOutputsJson),
      "largest",
    )
    expect(selected.name).toBe("DSI-2")
  })

  it("selects an explicit output", () => {
    const selected = selectSwayOutput(
      parseSwayOutputs(swayOutputsJson),
      "DSI-1",
    )
    expect(selected.name).toBe("DSI-1")
  })

  it("rejects missing outputs with a useful message", () => {
    expect(() =>
      selectSwayOutput(parseSwayOutputs(swayOutputsJson), "HDMI-A-1"),
    ).toThrow(/Active outputs: DSI-1, DSI-2/)
  })

  it("parses CLI arguments", () => {
    expect(
      parseArgs([
        "--output",
        "DSI-2",
        "--local-path=/tmp/out.png",
        "--host",
        "bandai-guest-ip",
        "--dry-run",
      ]),
    ).toEqual({
      output: "DSI-2",
      localPath: "/tmp/out.png",
      host: "bandai-guest-ip",
      dryRun: true,
    })
  })

  it("builds a dry-run capture plan without invoking grim or scp", async () => {
    const calls: Array<{
      command: string
      args: readonly string[]
      input?: string
    }> = []
    const result = await captureDeviceScreenshot(
      {
        output: "largest",
        localPath: "/tmp/screenshot.png",
        dryRun: true,
      },
      {
        now: () => 123,
        pid: () => 456,
        run: async (command, args, options) => {
          calls.push({ command, args, input: options?.input })
          return { exitCode: 0, stdout: swayOutputsJson, stderr: "" }
        },
      },
    )

    expect(result.plan.output).toBe("DSI-2")
    expect(result.plan.localPath).toBe("/tmp/screenshot.png")
    expect(result.plan.remotePath).toBe(
      "/tmp/korri-screenshot-456-123-DSI-2.png",
    )
    expect(result.plan.captureScript).toContain("grim")
    expect(result.plan.captureScript).toContain("-o DSI-2")
    expect(result.plan.scpArgs).toEqual([
      "-F",
      "/tmp/bandai-deploy/ssh_config_ip",
      "bandai-guest-ip:/tmp/korri-screenshot-456-123-DSI-2.png",
      "/tmp/screenshot.png",
    ])
    expect(calls).toHaveLength(1)
    expect(calls[0]?.command).toBe("ssh")
    expect(calls[0]?.input).toContain("swaymsg -t get_outputs")
  })

  it("rejects unsupported devices", () => {
    expect(() => buildDeviceScreenshotPlan({ device: "unknown" })).toThrow(
      DeviceScreenshotError,
    )
  })
})
