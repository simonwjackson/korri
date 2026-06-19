import { describe, expect, it } from "bun:test"
import { decodeTurnipPolicy, normalizeTurnipPolicy } from "./policy"

describe("Turnip policy", () => {
  it("normalizes a default scoped Turnip driver environment", () => {
    expect(normalizeTurnipPolicy({})).toMatchObject({
      enable: true,
      icdPath: "/run/opengl-driver/share/vulkan/icd.d/freedreno_icd.aarch64.json",
      driverFiles: "/run/opengl-driver/share/vulkan/icd.d/freedreno_icd.aarch64.json",
      glDriversPath: "/run/opengl-driver/lib/dri",
      eglVendorLibraryDirs: "/run/opengl-driver/share/glvnd/egl_vendor.d",
      ldLibraryPath: "/run/opengl-driver/lib",
    })
  })

  it("rejects malformed policy values", () => {
    expect(() => decodeTurnipPolicy({ icdPath: "" })).toThrow()
    expect(() => decodeTurnipPolicy({ enable: "yes" })).toThrow()
  })
})
