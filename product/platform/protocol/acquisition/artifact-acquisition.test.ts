import { describe, expect, it } from "bun:test"

import {
  decodeAcquiredArtifact,
  decodePluginAcquireOutput,
} from "./artifact-acquisition"

const SHA_256 = "c".repeat(64)

function pluginOutput(overrides: Record<string, unknown> = {}) {
  return {
    kind: "content",
    system: "smbr",
    format: { id: "smbr-level" },
    file: { name: "6a1797b85a07d826fd7a5bd0.lvl", extension: "lvl" },
    bytesBase64: Buffer.from('{"Info":{},"Levels":[]}').toString("base64"),
    expectedDigests: { sha256: SHA_256 },
    facets: { title: { text: "Tropical Island Adventure!" } },
    sourceData: {
      "levelsharesquare.v1": { levelId: "6a1797b85a07d826fd7a5bd0" },
    },
    ...overrides,
  }
}

describe("artifact acquisition protocol", () => {
  it("decodes plugin artifact bytes and metadata without a staged path", () => {
    const decoded = decodePluginAcquireOutput(pluginOutput())

    expect(decoded.system).toBe("smbr")
    expect(decoded.format.id).toBe("smbr-level")
    expect(decoded.bytesBase64).toBe(pluginOutput().bytesBase64)
    expect("stagedPath" in decoded).toBe(false)
  })

  it("rejects plugin output that tries to choose service-owned fields", () => {
    for (const serviceOwnedFields of [
      { stagedPath: "/tmp/source-owned.lvl" },
      { id: `sha256:${SHA_256}` },
      { digests: { sha256: SHA_256 } },
    ]) {
      expect(() =>
        decodePluginAcquireOutput(pluginOutput(serviceOwnedFields)),
      ).toThrow()
    }
  })

  it("decodes service-owned acquired artifacts with computed digests and stagedPath", () => {
    const { bytesBase64: _bytesBase64, ...metadata } = pluginOutput()
    const decoded = decodeAcquiredArtifact({
      id: `sha256:${SHA_256}`,
      ...metadata,
      stagedPath: "/var/lib/korri/acquisition/staged/sha256/c.lvl",
      digests: { sha256: SHA_256 },
    })

    expect(decoded.id).toBe(`sha256:${SHA_256}`)
    expect(decoded.stagedPath).toContain("/staged/")
    expect(decoded.digests.sha256).toBe(SHA_256)
    expect("bytesBase64" in decoded).toBe(false)
    expect(() =>
      decodeAcquiredArtifact({
        ...decoded,
        id: `sha256:${"d".repeat(64)}`,
      }),
    ).toThrow()
  })
})
