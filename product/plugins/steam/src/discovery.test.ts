import { describe, expect, it } from "bun:test"
import type {
  FileDiscoveryDescriptor,
  ReleaseDiscoveryObservation,
} from "@platform/plugin/discovery"
import {
  KORRI_STEAM_APP_ID,
  KORRI_STEAM_PLUGIN_ID,
  steamInstalledAppsDiscoveryProvider,
} from ".."

const rootPath = "/var/lib/korri/steam"

function manifestDescriptor(appId: string): FileDiscoveryDescriptor {
  return {
    storageId: "@korri:steam/steam",
    rootPath,
    absolutePath: `${rootPath}/steamapps/appmanifest_${appId}.acf`,
    relativePath: `steamapps/appmanifest_${appId}.acf`,
    name: `appmanifest_${appId}.acf`,
    extension: ".acf",
  }
}

function manifest(input: {
  readonly appId: string
  readonly name?: string
  readonly stateFlags?: string | number
  readonly type?: string
  readonly buildId?: string
}): string {
  const lines = ['"AppState"', "{", `  "appid" "${input.appId}"`]
  if (input.name !== undefined) lines.push(`  "name" "${input.name}"`)
  if (input.stateFlags !== undefined) {
    lines.push(`  "StateFlags" "${input.stateFlags}"`)
  }
  if (input.type !== undefined) lines.push(`  "type" "${input.type}"`)
  if (input.buildId !== undefined) lines.push(`  "buildid" "${input.buildId}"`)
  lines.push("}")
  return lines.join("\n")
}

async function discover(
  files: readonly FileDiscoveryDescriptor[],
  contentByPath: ReadonlyMap<string, string | undefined>,
): Promise<readonly ReleaseDiscoveryObservation[]> {
  return (await Promise.resolve(
    steamInstalledAppsDiscoveryProvider.discover({
      pluginId: KORRI_STEAM_PLUGIN_ID,
      storageId: "@korri:steam/steam",
      rootPath,
      files,
      readText: async path => contentByPath.get(path),
    }),
  )) as readonly ReleaseDiscoveryObservation[]
}

describe("steamInstalledAppsDiscoveryProvider", () => {
  it("emits a provider-ref observation for a fully installed Steam game", async () => {
    const descriptor = manifestDescriptor("1029210")
    const observations = await discover(
      [descriptor],
      new Map([
        [
          descriptor.absolutePath,
          manifest({
            appId: "1029210",
            name: "30XX",
            stateFlags: "4",
            type: "Game",
            buildId: "12345",
          }),
        ],
      ]),
    )

    expect(observations).toEqual([
      {
        kind: "provider-ref-release",
        confidence: "high",
        source: descriptor,
        target: { provider: KORRI_STEAM_PLUGIN_ID, ref: "1029210" },
        release: { id: "steam", title: "30XX", system: "steam" },
        launch: { use: KORRI_STEAM_APP_ID },
        evidence: [
          { kind: "manifest", value: "steamapps/appmanifest_1029210.acf" },
          { kind: "state-flags", value: "4" },
          { kind: "type", value: "Game" },
          { kind: "build-id", value: "12345" },
        ],
      },
    ])
  })

  it("skips partial installs, tools, corrupt manifests, and mismatched appids", async () => {
    const installed = manifestDescriptor("1029210")
    const downloading = manifestDescriptor("111111")
    const tool = manifestDescriptor("222222")
    const corrupt = manifestDescriptor("333333")
    const mismatch = manifestDescriptor("444444")

    const observations = await discover(
      [installed, downloading, tool, corrupt, mismatch],
      new Map([
        [
          installed.absolutePath,
          manifest({
            appId: "1029210",
            name: "30XX",
            stateFlags: 4,
            type: "Game",
          }),
        ],
        [
          downloading.absolutePath,
          manifest({
            appId: "111111",
            name: "Downloading",
            stateFlags: "1026",
            type: "Game",
          }),
        ],
        [
          tool.absolutePath,
          manifest({
            appId: "222222",
            name: "Steam Linux Runtime",
            stateFlags: "4",
            type: "Tool",
          }),
        ],
        [corrupt.absolutePath, '"AppState" {'],
        [
          mismatch.absolutePath,
          manifest({
            appId: "555555",
            name: "Wrong AppID",
            stateFlags: "4",
            type: "Game",
          }),
        ],
      ]),
    )

    expect(observations).toHaveLength(1)
    expect(observations[0]).toMatchObject({
      target: { provider: KORRI_STEAM_PLUGIN_ID, ref: "1029210" },
      release: { title: "30XX" },
    })
  })

  it("accepts missing manifest type and falls back to a stable title", async () => {
    const descriptor = manifestDescriptor("1029210")
    const observations = await discover(
      [descriptor],
      new Map([
        [
          descriptor.absolutePath,
          manifest({ appId: "1029210", stateFlags: "4" }),
        ],
      ]),
    )

    expect(observations).toMatchObject([
      {
        target: { provider: KORRI_STEAM_PLUGIN_ID, ref: "1029210" },
        release: { title: "Steam App 1029210" },
      },
    ])
  })
})
