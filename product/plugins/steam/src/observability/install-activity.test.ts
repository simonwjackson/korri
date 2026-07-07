import { describe, expect, it } from "bun:test"
import { collectSteamBusySnapshot } from "./install-activity"

describe("collectSteamBusySnapshot", () => {
  it("reports idle when every manifest is installed", async () => {
    const snapshot = await collectSteamBusySnapshot({
      steamHome: "/steam-home",
      listSteamAppManifestPaths: async () => [
        "/steam-home/steamapps/appmanifest_360740.acf",
      ],
      readText: async () => manifest("360740", { stateFlags: 4 }),
    })

    expect(snapshot.state).toBe("idle")
    expect(snapshot.busyAppIds).toEqual([])
  })

  it("reports a different AppID download as active", async () => {
    const snapshot = await collectSteamBusySnapshot({
      steamHome: "/steam-home",
      listSteamAppManifestPaths: async () => [
        "/steam-home/steamapps/appmanifest_401710.acf",
      ],
      readText: async () =>
        manifest("401710", {
          stateFlags: 1026,
          bytesDownloaded: 100,
          bytesToDownload: 200,
        }),
    })

    expect(snapshot.state).toBe("active")
    expect(snapshot.busyAppIds).toEqual(["401710"])
    expect(snapshot.evidence[0]).toContain("StateFlags=1026")
  })

  it("fails closed when manifests cannot be listed", async () => {
    const snapshot = await collectSteamBusySnapshot({
      steamHome: "/steam-home",
      listSteamAppManifestPaths: async () => {
        throw new Error("permission denied")
      },
      readText: async () => undefined,
    })

    expect(snapshot.state).toBe("unknown")
    expect(snapshot.evidence[0]).toContain("permission denied")
  })
})

function manifest(
  appId: string,
  input: {
    readonly stateFlags: number
    readonly bytesDownloaded?: number
    readonly bytesToDownload?: number
  },
): string {
  return `"AppState"
{
  "appid" "${appId}"
  "StateFlags" "${input.stateFlags}"
  ${input.bytesDownloaded === undefined ? "" : `"BytesDownloaded" "${input.bytesDownloaded}"`}
  ${input.bytesToDownload === undefined ? "" : `"BytesToDownload" "${input.bytesToDownload}"`}
}
`
}
