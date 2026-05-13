import { describe, expect, it } from "bun:test"
import { buildKorriSessiondServiceConfig } from "./sessiond-service-config"

const base = {
  project: "/storage/.guest/korri/app",
  port: "3003",
  log: "/storage/.guest/korri/logs/sessiond.log",
  tokenFile: "/storage/.guest/korri/sessiond.token",
}

describe("sessiond service config", () => {
  it("builds Electrobun env without renderer fallback fields", () => {
    const config = buildKorriSessiondServiceConfig({
      ...base,
      electrobunApp: "korri-desktop-device",
      electrobunStateRoot: "/storage/electrobun-state",
      electrobunStatusFile: "/storage/electrobun-state/status.json",
    })

    expect(config.environment).toMatchObject({
      KORRI_SESSIOND_TOKEN_FILE: "/storage/.guest/korri/sessiond.token",
      KORRI_ELECTROBUN_APP: "korri-desktop-device",
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
