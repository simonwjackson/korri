import { describe, expect, it } from "bun:test"
import { installMetadataForRelease } from "./app-install-metadata"
import type { AppRecord } from "./records/app"

const steamApp: AppRecord = {
  id: "@korri:steam/steam",
  kind: "@korri:steam",
  command: "steam",
}

describe("install metadata projection", () => {
  it("projects provider install metadata from app choice and numeric target", () => {
    const install = installMetadataForRelease(
      {
        id: "steam",
        system: "steam",
        target: "steam://rungameid/1029210",
        apps: [{ id: "@korri:steam/steam" }],
      },
      new Map([[steamApp.id, steamApp]]),
    )

    expect(install).toEqual({
      providerId: "@korri:steam",
      appId: "1029210",
      canRequestInstall: true,
    })
  })

  it("uses system app choices when releases inherit them", () => {
    const install = installMetadataForRelease(
      {
        id: "steam",
        system: "steam",
        target: "steam://rungameid/1029210",
      },
      new Map([[steamApp.id, steamApp]]),
      new Map([
        [
          "steam",
          { id: "steam", apps: [{ id: "@korri:steam/steam" }] },
        ],
      ]),
    )

    expect(install).toMatchObject({
      providerId: "@korri:steam",
      appId: "1029210",
    })
  })

  it("overlays release app choices while preserving inherited Steam install metadata", () => {
    const install = installMetadataForRelease(
      {
        id: "steam",
        system: "steam",
        target: "steam://rungameid/1029210",
        apps: [{ id: "local-companion" }],
      },
      new Map([
        [steamApp.id, steamApp],
        ["local-companion", { id: "local-companion", kind: "process" }],
      ]),
      new Map([
        [
          "steam",
          { id: "steam", apps: [{ id: "@korri:steam/steam" }] },
        ],
      ]),
    )

    expect(install).toMatchObject({
      providerId: "@korri:steam",
      appId: "1029210",
    })
  })

  it("does not infer metadata without a provider-qualified app", () => {
    const install = installMetadataForRelease(
      {
        id: "pc",
        system: "pc",
        target: "steam://rungameid/1029210",
        apps: [{ id: "local-app" }],
      },
      new Map([["local-app", { id: "local-app", kind: "process" }]]),
    )

    expect(install).toBeUndefined()
  })
})
