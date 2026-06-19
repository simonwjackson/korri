import { describe, expect, it } from "bun:test"
import { installMetadataForRelease } from "./app-install-metadata"
import type { AppRecord } from "./records/app"

const steamApp: AppRecord = {
  id: "@korri:steam/steam",
  plugin: "@korri:steam",
  command: "steam",
}

describe("install metadata projection", () => {
  it("projects provider install metadata from release launch and numeric URL target", () => {
    const install = installMetadataForRelease(
      {
        id: "steam",
        system: "steam",
        target: { kind: "url", value: "steam://rungameid/1029210" },
        launch: { use: "@korri:steam/steam" },
      },
      new Map([[steamApp.id, steamApp]]),
    )

    expect(install).toEqual({
      providerId: "@korri:steam",
      appId: "1029210",
      canRequestInstall: true,
    })
  })

  it("can project provider metadata from a direct launch plugin selector", () => {
    const install = installMetadataForRelease(
      {
        id: "steam",
        system: "steam",
        target: { kind: "url", value: "steam://install/1029210" },
        launch: { plugin: "@korri:steam" },
      },
      new Map(),
    )

    expect(install).toMatchObject({
      providerId: "@korri:steam",
      appId: "1029210",
    })
  })

  it("does not infer metadata without a provider-qualified launcher", () => {
    const install = installMetadataForRelease(
      {
        id: "pc",
        system: "pc",
        target: { kind: "url", value: "steam://rungameid/1029210" },
        launch: { use: "local-app" },
      },
      new Map([["local-app", { id: "local-app", plugin: "@korri:process" }]]),
    )

    expect(install).toBeUndefined()
  })
})
