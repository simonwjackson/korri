import { describe, expect, it } from "bun:test"

import { decodeArtifactMetadata, decodeArtifactRecord } from "./artifact"

const SHA_256 = "a".repeat(64)
const OTHER_SHA_256 = "b".repeat(64)

function artifact(overrides: Record<string, unknown> = {}) {
  return {
    id: `sha256:${SHA_256}`,
    kind: "content",
    system: "snes",
    format: { id: "sfc-rom" },
    file: { name: "Super Metroid.sfc", extension: "sfc" },
    digests: { sha256: SHA_256 },
    facets: {
      title: { text: "Super Metroid", language: "en" },
    },
    provenance: {
      source: "manual",
      acquiredAt: "2026-06-04T00:00:00.000Z",
    },
    externalIds: [{ namespace: "no-intro", id: "super-metroid" }],
    sourceData: { "manual.v1": { shelf: "usb-1" } },
    ...overrides,
  }
}

describe("artifact protocol contract", () => {
  it("decodes pre-identity artifact metadata before a service assigns id and digests", () => {
    const decoded = decodeArtifactMetadata({
      kind: "content",
      system: "smbr",
      format: { id: "smbr-level" },
      file: { name: "6a1797b85a07d826fd7a5bd0.lvl", extension: "lvl" },
      facets: { title: { text: "Tropical Island Adventure!" } },
    })

    expect(decoded.system).toBe("smbr")
    expect(decoded.format.id).toBe("smbr-level")
    expect(() =>
      decodeArtifactMetadata({
        id: `sha256:${SHA_256}`,
        kind: "content",
        format: { id: "smbr-level" },
        file: { name: "level.lvl", extension: "lvl" },
      }),
    ).toThrow()
    expect(() =>
      decodeArtifactMetadata({
        kind: "content",
        format: { id: "smbr-level" },
        file: { name: "level.lvl", extension: "lvl" },
        digests: { sha256: SHA_256 },
      }),
    ).toThrow()
  })

  it("decodes an SNES content artifact with content-addressed identity and localized facets", () => {
    const decoded = decodeArtifactRecord(artifact())

    expect(decoded.id).toBe(`sha256:${SHA_256}`)
    expect(decoded.system).toBe("snes")
    expect(decoded.format.id).toBe("sfc-rom")
    expect(decoded.file.extension).toBe("sfc")
    expect(decoded.facets?.title?.language).toBe("en")
    expect(decoded.provenance?.source).toBe("manual")
  })

  it("decodes a patch artifact with compatibility facets", () => {
    const decoded = decodeArtifactRecord(
      artifact({
        kind: "patch",
        system: undefined,
        format: { id: "ips" },
        file: { name: "balance.ips", extension: "ips" },
        facets: {
          compatibility: {
            expectedBaseDigests: { sha256: OTHER_SHA_256 },
          },
        },
      }),
    )

    expect(decoded.kind).toBe("patch")
    expect(decoded.format.id).toBe("ips")
    expect(decoded.facets?.compatibility?.expectedBaseDigests.sha256).toBe(
      OTHER_SHA_256,
    )
  })

  it("decodes an SMBR level artifact with general media and sourceData", () => {
    const decoded = decodeArtifactRecord(
      artifact({
        system: "smbr",
        format: { id: "smbr-level" },
        file: { name: "6a1797b85a07d826fd7a5bd0.lvl", extension: "lvl" },
        facets: {
          title: { text: "Tropical Island Adventure!" },
          credits: { authors: [{ name: "Elvee" }] },
          media: [
            {
              kind: "image",
              role: "thumbnail",
              url: "https://levelsharesquare.com/levels/6a1797b85a07d826fd7a5bd0/thumbnail.png",
              mediaType: "image/png",
            },
          ],
        },
        sourceData: {
          "levelsharesquare.v1": {
            levelId: "6a1797b85a07d826fd7a5bd0",
            difficulty: "Normal",
          },
        },
      }),
    )

    expect(decoded.system).toBe("smbr")
    expect(decoded.format.id).toBe("smbr-level")
    expect(decoded.facets?.media?.[0]?.role).toBe("thumbnail")
    expect(decoded.sourceData?.["levelsharesquare.v1"]).toEqual({
      levelId: "6a1797b85a07d826fd7a5bd0",
      difficulty: "Normal",
    })
  })

  it("keeps extension separate from semantic system and format", () => {
    const smbr = decodeArtifactRecord(
      artifact({
        system: "smbr",
        format: { id: "smbr-level" },
        file: { name: "level.lvl", extension: "lvl" },
      }),
    )
    const other = decodeArtifactRecord(
      artifact({
        id: `sha256:${OTHER_SHA_256}`,
        digests: { sha256: OTHER_SHA_256 },
        system: "other-level-game",
        format: { id: "other-level" },
        file: { name: "level.lvl", extension: "lvl" },
      }),
    )

    expect(smbr.file.extension).toBe(other.file.extension)
    expect(smbr.system).not.toBe(other.system)
    expect(smbr.format.id).not.toBe(other.format.id)
  })

  it("rejects non-canonical artifact ids and id/digest mismatches", () => {
    expect(() => decodeArtifactRecord(artifact({ id: SHA_256 }))).toThrow()
    expect(() =>
      decodeArtifactRecord(artifact({ id: `sha256:${"A".repeat(64)}` })),
    ).toThrow()
    expect(() =>
      decodeArtifactRecord(
        artifact({
          id: `sha256:${SHA_256}`,
          digests: { sha256: OTHER_SHA_256 },
        }),
      ),
    ).toThrow()
  })

  it("rejects malformed digest sets", () => {
    for (const digests of [
      {},
      { sha256: "A".repeat(64) },
      { sha256: "abc" },
      { sha256: SHA_256, "sha 1": "abc" },
      { sha256: SHA_256, md5: "zzzz" },
    ]) {
      expect(() => decodeArtifactRecord(artifact({ digests }))).toThrow()
    }
  })

  it("rejects unknown top-level fields while preserving unknown namespaced sourceData", () => {
    expect(() =>
      decodeArtifactRecord(artifact({ launcherArgs: ["--level"] })),
    ).toThrow()

    expect(
      decodeArtifactRecord(
        artifact({
          sourceData: { "levelsharesquare.v1": { launcherArgs: ["--level"] } },
        }),
      ).sourceData?.["levelsharesquare.v1"],
    ).toEqual({ launcherArgs: ["--level"] })
  })

  it("rejects sourceData keys that are not namespaced and versioned", () => {
    expect(() =>
      decodeArtifactRecord(artifact({ sourceData: { levelsharesquare: {} } })),
    ).toThrow()
    expect(() =>
      decodeArtifactRecord(
        artifact({ sourceData: { "levelsharesquare.latest": {} } }),
      ),
    ).toThrow()
    expect(() =>
      decodeArtifactRecord(
        artifact({ sourceData: { "levelsharesquare.v1.v2": {} } }),
      ),
    ).toThrow()
  })

  it("rejects unsafe file extensions and file names", () => {
    for (const extension of [
      "../sfc",
      "s/fc",
      "sfc\0",
      "sfc;rm",
      ".lvl",
      "svg+xml",
    ]) {
      expect(() =>
        decodeArtifactRecord(artifact({ file: { name: "game", extension } })),
      ).toThrow()
    }

    for (const name of [
      "../game.sfc",
      "folder/game.sfc",
      "folder\\game.sfc",
      "game\0.sfc",
      ".",
      "..",
    ]) {
      expect(() =>
        decodeArtifactRecord(artifact({ file: { name, extension: "sfc" } })),
      ).toThrow()
    }

    expect(
      decodeArtifactRecord(
        artifact({ file: { name: "patch..v2.ips", extension: "ips" } }),
      ).file.name,
    ).toBe("patch..v2.ips")
  })

  it("rejects unsafe media asset URLs while allowing public HTTP URLs", () => {
    for (const url of [
      "ftp://example.com/thumbnail.png",
      "https://user:pass@example.com/thumbnail.png",
      "http://localhost/thumbnail.png",
      "http://127.0.0.1/thumbnail.png",
      "http://0.0.0.1/thumbnail.png",
      "http://10.0.0.1/thumbnail.png",
      "http://100.64.0.1/thumbnail.png",
      "http://192.168.1.1/thumbnail.png",
      "http://172.16.0.1/thumbnail.png",
      "http://169.254.1.1/thumbnail.png",
      "http://[::]/thumbnail.png",
      "http://[::1]/thumbnail.png",
      "http://[fe80::1]/thumbnail.png",
      "http://[fc00::1]/thumbnail.png",
      "http://[fd00::1]/thumbnail.png",
      "http://[64:ff9b::1]/thumbnail.png",
      "http://[::ffff:10.0.0.1]/thumbnail.png",
    ]) {
      expect(() =>
        decodeArtifactRecord(
          artifact({
            facets: {
              media: [{ kind: "image", role: "thumbnail", url }],
            },
          }),
        ),
      ).toThrow()
    }

    expect(
      decodeArtifactRecord(
        artifact({
          facets: {
            media: [
              {
                kind: "image",
                role: "thumbnail",
                url: "https://8.8.8.8/thumbnail.png",
              },
            ],
          },
        }),
      ).facets?.media?.[0]?.url,
    ).toBe("https://8.8.8.8/thumbnail.png")
    expect(
      decodeArtifactRecord(
        artifact({
          facets: {
            media: [
              {
                kind: "image",
                role: "thumbnail",
                url: "https://fdroid.org/thumbnail.png",
              },
            ],
          },
        }),
      ).facets?.media?.[0]?.url,
    ).toBe("https://fdroid.org/thumbnail.png")
  })

  it("rejects malformed language tags", () => {
    expect(() =>
      decodeArtifactRecord(
        artifact({
          facets: { title: { text: "Title", language: "not a tag" } },
        }),
      ),
    ).toThrow()
  })

  it("rejects malformed timestamps and non-finite community stats", () => {
    for (const acquiredAt of [
      "not-a-date",
      "2026-13-01T00:00:00.000Z",
      "2026-06-04",
    ]) {
      expect(() =>
        decodeArtifactRecord(
          artifact({ provenance: { source: "manual", acquiredAt } }),
        ),
      ).toThrow()
    }

    for (const downloads of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        decodeArtifactRecord(
          artifact({ facets: { communityStats: { downloads } } }),
        ),
      ).toThrow()
    }
  })
})
