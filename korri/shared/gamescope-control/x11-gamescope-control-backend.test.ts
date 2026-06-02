import { describe, expect, it } from "bun:test"
import { createX11GamescopeControlBackend } from "./x11-gamescope-control-backend"

describe("x11 gamescope control backend", () => {
  it("writes the Xwayland mode-control atom and returns applied readback", async () => {
    const calls: Array<{
      command: string
      args: readonly string[]
      env?: NodeJS.ProcessEnv
    }> = []
    const backend = createX11GamescopeControlBackend({
      display: ":1",
      pollIntervalMs: 1,
      settleTimeoutMs: 20,
      run: async (command, args, options) => {
        calls.push({ command, args, env: options?.env })
        if (command === "xrandr") {
          return {
            stdout:
              "Screen 0: minimum 16 x 16, current 960 x 540, maximum 32767 x 32767\n",
            stderr: "",
            exitCode: 0,
          }
        }
        if (command === "xprop" && args.includes("GAMESCOPE_FSR_FEEDBACK")) {
          return {
            stdout:
              "GAMESCOPE_SCALING_FILTER(CARDINAL) = 3\nGAMESCOPE_SHARPNESS(CARDINAL) = 20\nGAMESCOPE_FSR_FEEDBACK(CARDINAL) = 1\n",
            stderr: "",
            exitCode: 0,
          }
        }
        return { stdout: "", stderr: "", exitCode: 0 }
      },
    })

    const result = await backend.setMode({ width: 960, height: 540 })

    expect(result.status).toBe("applied")
    expect(result.applied.xwaylandMode).toEqual({ width: 960, height: 540 })
    expect(calls[0]).toMatchObject({
      command: "xprop",
      args: [
        "-root",
        "-f",
        "GAMESCOPE_XWAYLAND_MODE_CONTROL",
        "32c",
        "-set",
        "GAMESCOPE_XWAYLAND_MODE_CONTROL",
        "0, 960, 540, 0",
      ],
    })
    expect(calls[0]?.env?.DISPLAY).toBe(":1")
  })

  it("sets scaler filter and sharpness through root CARDINAL atoms", async () => {
    const calls: string[][] = []
    const backend = createX11GamescopeControlBackend({
      display: ":1",
      run: async (command, args) => {
        calls.push([command, ...args])
        if (args.includes("GAMESCOPE_FSR_FEEDBACK")) {
          return {
            stdout:
              "GAMESCOPE_SCALING_FILTER(CARDINAL) = 3\nGAMESCOPE_SHARPNESS(CARDINAL) = 0\nGAMESCOPE_FSR_FEEDBACK(CARDINAL) = 1\n",
            stderr: "",
            exitCode: 0,
          }
        }
        return { stdout: "", stderr: "", exitCode: 0 }
      },
    })

    expect((await backend.setFilter("fsr")).applied.filter).toBe("fsr")
    expect((await backend.setSharpness(0)).applied.sharpness).toBe(0)
    expect(calls).toContainEqual([
      "xprop",
      "-root",
      "-f",
      "GAMESCOPE_SCALING_FILTER",
      "32c",
      "-set",
      "GAMESCOPE_SCALING_FILTER",
      "3",
    ])
    expect(calls).toContainEqual([
      "xprop",
      "-root",
      "-f",
      "GAMESCOPE_SHARPNESS",
      "32c",
      "-set",
      "GAMESCOPE_SHARPNESS",
      "0",
    ])
  })
})
