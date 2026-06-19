import { describe, expect, it } from "bun:test"
import {
  installControlAuthorized,
  installControlCookie,
  installControlSessionToken,
} from "./install-control-authorization"

describe("install control authorization", () => {
  it("accepts the configured header token", () => {
    expect(
      installControlAuthorized(
        { "x-korri-install-control": "long-install-secret" },
        { KORRI_INSTALL_CONTROL_SECRET: "long-install-secret" } as NodeJS.ProcessEnv,
      ),
    ).toBe(true)
  })

  it("accepts the install-control cookie", () => {
    expect(
      installControlAuthorized(
        { cookie: `korri_install_control=${installControlSessionToken("long-install-secret")}` },
        { KORRI_INSTALL_CONTROL_SECRET: "long-install-secret" } as NodeJS.ProcessEnv,
      ),
    ).toBe(true)
  })

  it("rejects malformed cookie encoding without throwing", () => {
    expect(
      installControlAuthorized(
        { cookie: "korri_install_control=%" },
        { KORRI_INSTALL_CONTROL_SECRET: "long-install-secret" } as NodeJS.ProcessEnv,
      ),
    ).toBe(false)
  })

  it("rejects weak direct RPC secrets", () => {
    expect(
      installControlAuthorized(
        { "x-korri-install-control": "1234567890123456" },
        { KORRI_INSTALL_CONTROL_SECRET: "1234567890123456" } as NodeJS.ProcessEnv,
      ),
    ).toBe(false)
  })

  it("rejects callers when no secret is configured", () => {
    expect(installControlAuthorized({}, {} as NodeJS.ProcessEnv)).toBe(false)
  })

  it("marks session cookies HttpOnly and SameSite strict", () => {
    expect(installControlCookie("long-install-secret")).toContain("HttpOnly")
    expect(installControlCookie("long-install-secret")).toContain("SameSite=Strict")
    expect(installControlCookie("long-install-secret")).not.toContain("korri_install_control=long-install-secret")
  })
})
