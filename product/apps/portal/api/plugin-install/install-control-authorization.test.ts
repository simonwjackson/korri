import { describe, expect, it } from "bun:test"
import {
  installControlAuthorized,
  installControlCookie,
  installControlSessionToken,
} from "./install-control-authorization"

describe("install control authorization", () => {
  it("accepts the configured header token", async () => {
    expect(
      await installControlAuthorized(
        { "x-korri-install-control": "long-install-secret" },
        { KORRI_INSTALL_CONTROL_SECRET: "long-install-secret" } as NodeJS.ProcessEnv,
      ),
    ).toBe(true)
  })

  it("accepts the install-control cookie", async () => {
    expect(
      await installControlAuthorized(
        {
          cookie: `korri_install_control=${await installControlSessionToken("long-install-secret")}`,
        },
        { KORRI_INSTALL_CONTROL_SECRET: "long-install-secret" } as NodeJS.ProcessEnv,
      ),
    ).toBe(true)
  })

  it("rejects malformed cookie encoding without throwing", async () => {
    expect(
      await installControlAuthorized(
        { cookie: "korri_install_control=%" },
        { KORRI_INSTALL_CONTROL_SECRET: "long-install-secret" } as NodeJS.ProcessEnv,
      ),
    ).toBe(false)
  })

  it("rejects weak direct RPC secrets", async () => {
    expect(
      await installControlAuthorized(
        { "x-korri-install-control": "1234567890123456" },
        { KORRI_INSTALL_CONTROL_SECRET: "1234567890123456" } as NodeJS.ProcessEnv,
      ),
    ).toBe(false)
  })

  it("rejects callers when no secret is configured", async () => {
    expect(await installControlAuthorized({}, {} as NodeJS.ProcessEnv)).toBe(false)
  })

  it("marks session cookies HttpOnly and SameSite strict", async () => {
    const cookie = await installControlCookie("long-install-secret")
    expect(cookie).toContain("HttpOnly")
    expect(cookie).toContain("SameSite=Strict")
    expect(cookie).not.toContain("korri_install_control=long-install-secret")
  })
})
