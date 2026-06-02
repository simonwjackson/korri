import { describe, expect, it } from "bun:test"

import { decodeModulePayload } from "./module"

describe("ModulePayload", () => {
  it("decodes a libretro core module with a stable absolute path", () => {
    expect(
      decodeModulePayload({
        kind: "libretro-core",
        path: "/etc/korri/cores/fake08_libretro.so",
      }),
    ).toEqual({
      kind: "libretro-core",
      path: "/etc/korri/cores/fake08_libretro.so",
    })
  })

  it("rejects relative module paths", () => {
    expect(() =>
      decodeModulePayload({ kind: "libretro-core", path: "cores/fake08.so" }),
    ).toThrow()
  })

  it("rejects unknown keys", () => {
    expect(() =>
      decodeModulePayload({
        kind: "libretro-core",
        path: "/etc/korri/cores/fake08_libretro.so",
        app: "retroarch",
      }),
    ).toThrow()
  })
})
