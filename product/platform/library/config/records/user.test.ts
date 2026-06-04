import { describe, expect, it } from "bun:test"

import { decodeUserPayload } from "./user"

describe("UserPayload", () => {
  it("decodes a minimal user (every field optional — no display name required)", () => {
    const user = decodeUserPayload({})
    expect(user).toEqual({})
  })

  it("decodes optional display name", () => {
    const user = decodeUserPayload({ displayName: "Simon" })
    expect(user.displayName).toBe("Simon")
  })

  it("decodes user-level launcher default + inheritable fields + presets", () => {
    const user = decodeUserPayload({
      displayName: "Simon",
      launcher: "retroarch",
      gamescope: { enabled: true },
      env: { LANG: "en_US.UTF-8" },
      presets: { my: { gamescope: { args: ["-F", "fsr"] } } },
      inherit: false,
    })
    expect(user.launcher).toBe("retroarch")
    expect(user.gamescope?.enabled).toBe(true)
    expect(user.presets?.my?.gamescope?.args).toEqual(["-F", "fsr"])
  })

  it("rejects identity-field bypass: 'system' is not allowed on user", () => {
    expect(() => decodeUserPayload({ system: "snes" })).toThrow()
  })

  it("rejects an unknown key (typo)", () => {
    expect(() => decodeUserPayload({ dispalyName: "Simon" })).toThrow()
  })
})
