import { describe, expect, it } from "bun:test"
import { composeBox64LaunchSpec } from "./wrapper"

describe("Box64 launch companion", () => {
  it("wraps a Linux x86_64 process launch with Unity-safe Box64 env", () => {
    expect(
      composeBox64LaunchSpec(
        {
          command: "./3dSen.exe",
          args: ["-id=37"],
          cwd: "/games/3dsen",
          env: { LD_LIBRARY_PATH: "/native/extra" },
        },
        {
          unityMode: true,
          strongMem: 3,
          bigBlock: 0,
          safeFlags: 2,
          fastNan: false,
          fastRound: false,
          nativeFlags: false,
          x87Double: true,
          syncRounding: true,
          maxCpu: 1,
          preferEmulated: false,
          sdlVideoDriver: "x11",
          nativeLibraryPath: "/run/opengl-driver/lib",
        },
      ),
    ).toEqual({
      command: "box64",
      args: ["./3dSen.exe", "-id=37"],
      cwd: "/games/3dsen",
      env: {
        LD_LIBRARY_PATH: "/run/opengl-driver/lib:/native/extra",
        BOX64_UNITY: "1",
        BOX64_DYNAREC_STRONGMEM: "3",
        BOX64_DYNAREC_BIGBLOCK: "0",
        BOX64_DYNAREC_SAFEFLAGS: "2",
        BOX64_DYNAREC_FASTNAN: "0",
        BOX64_DYNAREC_FASTROUND: "0",
        BOX64_DYNAREC_NATIVEFLAGS: "0",
        BOX64_DYNAREC_X87DOUBLE: "1",
        BOX64_SYNC_ROUNDING: "1",
        BOX64_MAXCPU: "1",
        BOX64_PREFER_EMULATED: "0",
        SDL_VIDEODRIVER: "x11",
        BOX64_LD_LIBRARY_PATH:
          "/games/3dsen:/games/3dsen/lib:/games/3dsen/lib64:/games/3dsen/MonoBleedingEdge/x86_64",
      },
    })
  })

  it("returns the original launch spec when disabled", () => {
    const spec = { command: "game", args: [] }
    expect(composeBox64LaunchSpec(spec, { enable: false })).toBe(spec)
  })
})
