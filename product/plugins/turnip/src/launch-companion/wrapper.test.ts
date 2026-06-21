import { describe, expect, it } from "bun:test"
import { composeTurnipLaunchSpec } from "./wrapper"

describe("Turnip launch companion", () => {
  it("adds scoped Turnip Vulkan and Mesa environment without changing command", () => {
    expect(
      composeTurnipLaunchSpec(
        {
          command: "box64",
          args: ["./3dSen.exe", "-id=37"],
          cwd: "/games/3dsen",
          env: { BOX64_UNITY: "1", LD_LIBRARY_PATH: "/native/extra" },
        },
        { icdPath: "/mesa/share/vulkan/icd.d/freedreno_icd.aarch64.json" },
      ),
    ).toEqual({
      command: "box64",
      args: ["./3dSen.exe", "-id=37"],
      cwd: "/games/3dsen",
      env: {
        BOX64_UNITY: "1",
        VK_ICD_FILENAMES: "/mesa/share/vulkan/icd.d/freedreno_icd.aarch64.json",
        VK_DRIVER_FILES: "/mesa/share/vulkan/icd.d/freedreno_icd.aarch64.json",
        LIBGL_DRIVERS_PATH: "/run/opengl-driver/lib/dri",
        __EGL_VENDOR_LIBRARY_DIRS:
          "/run/opengl-driver/share/glvnd/egl_vendor.d",
        LD_LIBRARY_PATH: "/run/opengl-driver/lib:/native/extra",
      },
    })
  })

  it("returns the original launch spec when disabled", () => {
    const spec = { command: "game", args: [] }
    expect(composeTurnipLaunchSpec(spec, { enable: false })).toBe(spec)
  })
})
