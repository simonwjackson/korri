import { describe, expect, it } from "bun:test"
import { collectSteamInstallSnapshot } from "./install-state"

const manifest = (body: string) => `"AppState"\n{\n${body}\n}\n`

describe("Steam install state projection", () => {
  it("reports not-installed when no manifest exists", async () => {
    const result = await collectSteamInstallSnapshot({
      appId: "1029210",
      readText: async () => undefined,
    })

    expect(result.state).toBe("not-installed")
  })

  it("reports requested when a request exists before the manifest appears", async () => {
    const result = await collectSteamInstallSnapshot({
      appId: "1029210",
      requested: true,
      readText: async () => undefined,
    })

    expect(result.state).toBe("requested")
  })

  it("reports downloading with byte percent from appmanifest fields", async () => {
    const result = await collectSteamInstallSnapshot({
      appId: "1029210",
      readText: async () =>
        manifest(
          `"StateFlags" "1026"\n"BytesDownloaded" "351879984"\n"BytesToDownload" "703759968"`,
        ),
    })

    expect(result.state).toBe("downloading")
    expect(result.bytesToDownload).toBe(703759968)
    expect(result.percent).toBe(50)
  })

  it("reports installed from final manifest state", async () => {
    const result = await collectSteamInstallSnapshot({
      appId: "1029210",
      readText: async () =>
        manifest(
          `"StateFlags" "4"\n"BytesDownloaded" "703759968"\n"BytesToDownload" "703759968"\n"SizeOnDisk" "1436380182"\n"buildid" "22186364"`,
        ),
    })

    expect(result.state).toBe("installed")
    expect(result.providerEvidence).toMatchObject({
      stateFlags: 4,
      buildId: "22186364",
      sizeOnDisk: 1436380182,
    })
  })

  it("reports unknown for corrupt manifests", async () => {
    const result = await collectSteamInstallSnapshot({
      appId: "1029210",
      readText: async () => `"AppState" {`,
    })

    expect(result.state).toBe("unknown")
  })
})
