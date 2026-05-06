import { describe, expect, it } from "bun:test"
import { buildKorriSessiondServiceConfig } from "./sessiond-service-config"

const base = {
  project: "/storage/korri",
  port: "3003",
  log: "/storage/korri-sessiond.log",
  tokenFile: "/storage/korri/sessiond.token",
}

describe("sessiond service config", () => {
  it("builds Electrobun env without renderer fallback fields", () => {
    const config = buildKorriSessiondServiceConfig({
      ...base,
      electrobunApp: "korri-desktop-odin",
      electrobunStateRoot: "/storage/electrobun-state",
      electrobunStatusFile: "/storage/electrobun-state/status.json",
    })

    expect(config.environment).toMatchObject({
      KORRI_SESSIOND_TOKEN_FILE: "/storage/korri/sessiond.token",
      KORRI_ELECTROBUN_APP: "korri-desktop-odin",
      KORRI_ELECTROBUN_STATE_ROOT: "/storage/electrobun-state",
      KORRI_ELECTROBUN_STATUS_FILE: "/storage/electrobun-state/status.json",
    })
  })

  it("rejects config without an Electrobun app binary", () => {
    expect(() => buildKorriSessiondServiceConfig(base)).toThrow(
      "KORRI_ELECTROBUN_APP",
    )
  })
})
