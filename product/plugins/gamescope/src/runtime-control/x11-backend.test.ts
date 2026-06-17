import { describe, expect, it } from "bun:test"
import { createX11GamescopeControlBackend } from "./x11-backend"

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

  it("times out mode readback when xrandr blocks", async () => {
    const backend = createX11GamescopeControlBackend({
      display: ":1",
      commandTimeoutMs: 5,
      pollIntervalMs: 1,
      settleTimeoutMs: 10,
      run: async (command, args) => {
        if (command === "xprop" && args.includes("-set")) {
          return { stdout: "", stderr: "", exitCode: 0 }
        }
        if (command === "xrandr") {
          return new Promise(() => undefined)
        }
        return { stdout: "", stderr: "", exitCode: 0 }
      },
    })

    const result = await backend.setMode({ width: 960, height: 540 })

    expect(result.status).toBe("timed-out")
    expect(result.reason).toContain("timed out")
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

  it("reports readback mismatch instead of accepted when filter readback differs", async () => {
    const backend = createX11GamescopeControlBackend({
      display: ":1",
      run: async (_command, args) => {
        if (args.includes("GAMESCOPE_FSR_FEEDBACK")) {
          return {
            stdout:
              "GAMESCOPE_SCALING_FILTER(CARDINAL) = 0\nGAMESCOPE_SHARPNESS(CARDINAL) = 20\nGAMESCOPE_FSR_FEEDBACK(CARDINAL) = 0\n",
            stderr: "",
            exitCode: 0,
          }
        }
        return { stdout: "", stderr: "", exitCode: 0 }
      },
    })

    const result = await backend.setFilter("fsr")

    expect(result.status).toBe("readback-mismatch")
    expect(result.reason).toContain("filter readback mismatch")
    expect(result.applied.filter).toBe("linear")
  })

  it("writes GAMESCOPE_FPS_LIMIT via xprop and reports the readback as applied", async () => {
    const calls: string[][] = []
    const backend = createX11GamescopeControlBackend({
      display: ":1",
      run: async (command, args) => {
        calls.push([command, ...args])
        if (args.includes("GAMESCOPE_FPS_LIMIT") && !args.includes("-set")) {
          return {
            stdout:
              "GAMESCOPE_SCALING_FILTER(CARDINAL) = 1\nGAMESCOPE_SHARPNESS(CARDINAL) = 0\nGAMESCOPE_FSR_FEEDBACK(CARDINAL) = 0\nGAMESCOPE_FPS_LIMIT(CARDINAL) = 60\n",
            stderr: "",
            exitCode: 0,
          }
        }
        return { stdout: "", stderr: "", exitCode: 0 }
      },
    })

    const result = await backend.setFps(60)
    expect(result.status).toBe("applied")
    expect(result.applied.fps).toBe(60)
    expect(calls).toContainEqual([
      "xprop",
      "-root",
      "-f",
      "GAMESCOPE_FPS_LIMIT",
      "32c",
      "-set",
      "GAMESCOPE_FPS_LIMIT",
      "60",
    ])
  })

  it("reports readback-mismatch when GAMESCOPE_FPS_LIMIT does not echo back", async () => {
    const backend = createX11GamescopeControlBackend({
      display: ":1",
      run: async (_command, args) => {
        if (args.includes("GAMESCOPE_FPS_LIMIT") && !args.includes("-set")) {
          return {
            stdout:
              "GAMESCOPE_SCALING_FILTER(CARDINAL) = 1\nGAMESCOPE_SHARPNESS(CARDINAL) = 0\nGAMESCOPE_FSR_FEEDBACK(CARDINAL) = 0\nGAMESCOPE_FPS_LIMIT(CARDINAL) = 30\n",
            stderr: "",
            exitCode: 0,
          }
        }
        return { stdout: "", stderr: "", exitCode: 0 }
      },
    })

    const result = await backend.setFps(60)
    expect(result.status).toBe("readback-mismatch")
    expect(result.applied.fps).toBe(30)
    expect(result.reason).toContain("fps readback mismatch")
  })

  it("reads GAMESCOPE_FPS_LIMIT into the state snapshot when set", async () => {
    const backend = createX11GamescopeControlBackend({
      display: ":1",
      run: async (command, args) => {
        if (command === "xrandr") {
          return {
            stdout:
              "Screen 0: minimum 16 x 16, current 640 x 360, maximum 32767 x 32767\n",
            stderr: "",
            exitCode: 0,
          }
        }
        if (args.includes("GAMESCOPE_FPS_LIMIT")) {
          return {
            stdout:
              "GAMESCOPE_SCALING_FILTER(CARDINAL) = 1\nGAMESCOPE_SHARPNESS(CARDINAL) = 0\nGAMESCOPE_FSR_FEEDBACK(CARDINAL) = 0\nGAMESCOPE_FPS_LIMIT(CARDINAL) = 45\n",
            stderr: "",
            exitCode: 0,
          }
        }
        return { stdout: "", stderr: "", exitCode: 0 }
      },
    })
    const state = await backend.getState()
    expect(state.fps).toBe(45)
  })

  it("reports readback-failed when state cannot be read after sharpness write", async () => {
    const backend = createX11GamescopeControlBackend({
      display: ":1",
      run: async (_command, args) => {
        if (args.includes("-set"))
          return { stdout: "", stderr: "", exitCode: 0 }
        return { stdout: "", stderr: "xprop unavailable", exitCode: 1 }
      },
    })

    const result = await backend.setSharpness(0)

    expect(result.status).toBe("readback-failed")
    expect(result.reason).toContain("xprop")
  })
})
