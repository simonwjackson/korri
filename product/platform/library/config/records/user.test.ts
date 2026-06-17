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
      launch: { with: { "@korri:gamescope": { enable: true } } },
      env: { LANG: "en_US.UTF-8" },
      patches: ["/patches/user.ips"],
      presets: {
        my: {
          launch: {
            with: { "@korri:gamescope": { extraArgs: ["-F", "fsr"] } },
          },
          patches: ["/patches/my.bps"],
        },
      },
      inherit: false,
    })
    expect(user.launcher).toBe("retroarch")
    expect(user.launch?.with?.["@korri:gamescope"]?.enable).toBe(true)
    expect(user.patches).toEqual(["/patches/user.ips"])
    expect(
      user.presets?.my?.launch?.with?.["@korri:gamescope"]?.extraArgs,
    ).toEqual(["-F", "fsr"])
    expect(user.presets?.my?.patches).toEqual(["/patches/my.bps"])
  })

  it("rejects identity-field bypass: 'system' is not allowed on user", () => {
    expect(() => decodeUserPayload({ system: "snes" })).toThrow()
  })

  it("rejects an unknown key (typo)", () => {
    expect(() => decodeUserPayload({ dispalyName: "Simon" })).toThrow()
  })
})
