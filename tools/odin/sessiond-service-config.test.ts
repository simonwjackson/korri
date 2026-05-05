import { describe, expect, it } from "bun:test"
import {
  buildKorriSessiondServiceConfig,
  parseKorriSessionRenderer,
} from "./sessiond-service-config"

const base = {
  project: "/storage/korri",
  port: "3003",
  log: "/storage/korri-sessiond.log",
  tokenFile: "/storage/korri/sessiond.token",
  korriUrl: "http://127.0.0.1:3100",
  chromiumPath: "/storage/apps/chromium/AppRun",
  chromiumProfileDir: "/storage/apps/chromium/korri-profile",
}

describe("sessiond service config", () => {
  it("defaults to the Chromium renderer", () => {
    const config = buildKorriSessiondServiceConfig(base)

    expect(config.renderer).toBe("chromium")
    expect(config.environment.KORRI_SESSION_RENDERER).toBe("chromium")
    expect(config.environment.KORRI_SESSIOND_TOKEN_FILE).toBe(
      "/storage/korri/sessiond.token",
    )
  })

  it("builds Electrobun renderer env without changing token paths", () => {
    const config = buildKorriSessiondServiceConfig({
      ...base,
      renderer: "electrobun",
      electrobunApp: "korri-desktop-odin",
      electrobunStateRoot: "/storage/electrobun-state",
      electrobunStatusFile: "/storage/electrobun-state/status.json",
    })

    expect(config.environment).toMatchObject({
      KORRI_SESSION_RENDERER: "electrobun",
      KORRI_SESSIOND_TOKEN_FILE: "/storage/korri/sessiond.token",
      KORRI_ELECTROBUN_APP: "korri-desktop-odin",
      KORRI_ELECTROBUN_STATE_ROOT: "/storage/electrobun-state",
      KORRI_ELECTROBUN_STATUS_FILE: "/storage/electrobun-state/status.json",
    })
  })

  it("rejects unsupported renderer modes", () => {
    expect(() => parseKorriSessionRenderer("webkit")).toThrow("Unsupported")
  })

  it("rejects Electrobun mode without an app binary", () => {
    expect(() =>
      buildKorriSessiondServiceConfig({ ...base, renderer: "electrobun" }),
    ).toThrow("KORRI_ELECTROBUN_APP")
  })
})
