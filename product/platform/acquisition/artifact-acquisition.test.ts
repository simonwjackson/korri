import { describe, expect, it } from "bun:test"
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { PluginAcquireOutput } from "@platform/protocol/acquisition/artifact-acquisition"
import { Effect } from "effect"

import {
  acquireArtifact,
  acquisitionArtifactStagingRoot,
  rejectNonArtifactPayload,
} from "./artifact-acquisition"
import { createAcquisitionPluginContext } from "./plugin-runtime"
import {
  type AcquisitionPluginDefinition,
  createAcquisitionPluginRegistry,
} from "./plugins/registry"

async function withTempRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "korri-acquire-artifact-"))
  try {
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

const levelBytes = Buffer.from('{"Info":{"Name":"Island"},"Levels":[{}]}')
const fixtureOutput: PluginAcquireOutput = {
  kind: "content",
  system: "smbr",
  format: { id: "smbr-level" },
  file: { name: "6a1797b85a07d826fd7a5bd0.lvl", extension: "lvl" },
  bytesBase64: levelBytes.toString("base64"),
  facets: { title: { text: "Tropical Island Adventure!" } },
  sourceData: {
    "levelsharesquare.v1": { levelId: "6a1797b85a07d826fd7a5bd0" },
  },
}

function fixturePlugin(output: unknown): AcquisitionPluginDefinition {
  return {
    metadata: {
      providerId: "@korri:fixture-source",
      displayName: "Fixture Source",
      module: "product/platform/acquisition/plugins/fixture-source",
      builtIn: true,
      enabledByDefault: true,
      legalRisk: "low",
      credentialRequired: false,
    },
    acquireArtifact: () => Effect.succeed(output as PluginAcquireOutput),
  }
}

describe("artifact acquisition staging", () => {
  it("derives a staging root from explicit env, library root, or XDG cache", () => {
    expect(
      acquisitionArtifactStagingRoot({
        KORRI_ACQUISITION_STAGING_ROOT: "/tmp/staged",
        KORRI_LIBRARY_ROOT: "/var/lib/korri/library",
      }),
    ).toBe("/tmp/staged")
    expect(
      acquisitionArtifactStagingRoot({
        KORRI_LIBRARY_ROOT: "/var/lib/korri/library",
      }),
    ).toBe("/var/lib/korri/acquisition-staging")
    expect(
      acquisitionArtifactStagingRoot({ XDG_CACHE_HOME: "/home/user/.cache" }),
    ).toBe("/home/user/.cache/korri/acquisition/artifacts")
  })

  it("stages plugin artifact bytes under acquisition-owned paths", async () => {
    await withTempRoot(async root => {
      const registry = createAcquisitionPluginRegistry([
        fixturePlugin(fixtureOutput),
      ])

      const acquired = await Effect.runPromise(
        acquireArtifact({
          registry,
          context: createAcquisitionPluginContext(),
          stagingRoot: root,
          request: { providerId: "@korri:fixture-source", id: "level-1" },
        }),
      )

      expect(acquired.id).toMatch(/^sha256:[a-f0-9]{64}$/)
      expect(acquired.system).toBe("smbr")
      expect(acquired.format.id).toBe("smbr-level")
      expect(acquired.file.extension).toBe("lvl")
      expect(acquired.stagedPath).toStartWith(root)
      expect(acquired.stagedPath).toContain("/sha256/")
      expect(acquired.stagedPath).toEndWith(".lvl")
      expect(acquired.digests.sha256).toBe(acquired.id.slice("sha256:".length))
      expect(acquired.sourceData?.["levelsharesquare.v1"]).toEqual({
        levelId: "6a1797b85a07d826fd7a5bd0",
      })
      expect(acquired.facets?.title?.text).toBe("Tropical Island Adventure!")
      expect(await readFile(acquired.stagedPath)).toEqual(levelBytes)
    })
  })

  it("rejects plugin-owned stagedPath before writing staged bytes", async () => {
    await withTempRoot(async root => {
      const registry = createAcquisitionPluginRegistry([
        fixturePlugin({
          ...fixtureOutput,
          stagedPath: "/tmp/source-owned.lvl",
        }),
      ])

      const error = await Effect.runPromise(
        acquireArtifact({
          registry,
          context: createAcquisitionPluginContext(),
          stagingRoot: root,
          request: { providerId: "@korri:fixture-source", id: "level-1" },
        }).pipe(
          Effect.match({
            onFailure: error => error,
            onSuccess: () => undefined,
          }),
        ),
      )

      expect(error).toMatchObject({
        reason: "defective-provider",
        providerId: "@korri:fixture-source",
      })
      expect(await readdir(root)).toEqual([])
    })
  })

  it("rejects unsupported expectedDigest algorithms as defective-provider", async () => {
    await withTempRoot(async root => {
      const registry = createAcquisitionPluginRegistry([
        fixturePlugin({
          ...fixtureOutput,
          expectedDigests: { blake3: "abc" },
        }),
      ])

      const error = await Effect.runPromise(
        acquireArtifact({
          registry,
          context: createAcquisitionPluginContext(),
          stagingRoot: root,
          request: { providerId: "@korri:fixture-source", id: "level-1" },
        }).pipe(
          Effect.match({
            onFailure: error => error,
            onSuccess: () => undefined,
          }),
        ),
      )

      expect(error).toMatchObject({
        reason: "defective-provider",
        providerId: "@korri:fixture-source",
      })
      expect(await readdir(root)).toEqual([])
    })
  })

  it("rejects mismatched expectedDigest values as defective-provider", async () => {
    await withTempRoot(async root => {
      const registry = createAcquisitionPluginRegistry([
        fixturePlugin({
          ...fixtureOutput,
          expectedDigests: { sha256: "0".repeat(64) },
        }),
      ])

      const error = await Effect.runPromise(
        acquireArtifact({
          registry,
          context: createAcquisitionPluginContext(),
          stagingRoot: root,
          request: { providerId: "@korri:fixture-source", id: "level-1" },
        }).pipe(
          Effect.match({
            onFailure: error => error,
            onSuccess: () => undefined,
          }),
        ),
      )

      expect(error).toMatchObject({
        reason: "defective-provider",
        providerId: "@korri:fixture-source",
      })
      expect(await readdir(root)).toEqual([])
    })
  })

  it("fails clearly when a plugin does not support artifact acquisition", async () => {
    const registry = createAcquisitionPluginRegistry([
      {
        metadata: {
          providerId: "@korri:fixture-source",
          displayName: "Fixture Source",
          module: "product/platform/acquisition/plugins/fixture-source",
          builtIn: true,
          enabledByDefault: true,
          legalRisk: "low",
          credentialRequired: false,
        },
      },
    ])

    const error = await Effect.runPromise(
      acquireArtifact({
        registry,
        context: createAcquisitionPluginContext(),
        stagingRoot: "/tmp/staging",
        request: { providerId: "@korri:fixture-source", id: "level-1" },
      }).pipe(
        Effect.match({
          onFailure: error => error,
          onSuccess: () => undefined,
        }),
      ),
    )

    expect(error).toMatchObject({
      reason: "defective-provider",
      providerId: "@korri:fixture-source",
    })
  })
})

describe("resolve-download acquire fallback", () => {
  const romBytes = Buffer.from("GBA ROM PAYLOAD BYTES")

  function resolveOnlyPlugin(): AcquisitionPluginDefinition {
    return {
      metadata: {
        providerId: "@local:fixture-roms",
        displayName: "Fixture ROMs",
        module: "local/fixture-roms",
        builtIn: false,
        enabledByDefault: true,
        legalRisk: "high",
        credentialRequired: false,
      },
      resolveDownload: (_context, request) =>
        Effect.succeed({
          _tag: "FinalDownload" as const,
          providerId: request.providerId,
          url: "https://downloads.example.com/files/Drill%20Dozer%20(U).gba",
          filename: "Drill Dozer (U).gba",
        }),
    }
  }

  const fakeFetch = (async () =>
    new Response(romBytes, {
      status: 200,
      headers: { "content-type": "application/octet-stream" },
    })) as unknown as typeof fetch

  it("stages a fetched artifact for a provider without acquireArtifact", async () => {
    await withTempRoot(async root => {
      const registry = createAcquisitionPluginRegistry([resolveOnlyPlugin()])

      const acquired = await Effect.runPromise(
        acquireArtifact({
          registry,
          context: createAcquisitionPluginContext(),
          stagingRoot: root,
          fetchImpl: fakeFetch,
          request: {
            providerId: "@local:fixture-roms",
            id: "drill-dozer",
            url: "https://roms.example.com/roms/drill-dozer",
          },
        }),
      )

      expect(acquired.id).toMatch(/^sha256:[a-f0-9]{64}$/)
      expect(acquired.file.name).toBe("Drill Dozer (U).gba")
      expect(acquired.file.extension).toBe("gba")
      expect(acquired.format.id).toBe("gba")
      expect(acquired.stagedPath).toStartWith(root)
      expect(await readFile(acquired.stagedPath)).toEqual(romBytes)
    })
  })

  it("fails clearly when no claim url is provided for the fallback", async () => {
    await withTempRoot(async root => {
      const registry = createAcquisitionPluginRegistry([resolveOnlyPlugin()])
      const error = await Effect.runPromise(
        acquireArtifact({
          registry,
          context: createAcquisitionPluginContext(),
          stagingRoot: root,
          fetchImpl: fakeFetch,
          request: { providerId: "@local:fixture-roms", id: "drill-dozer" },
        }).pipe(
          Effect.match({
            onFailure: error => error,
            onSuccess: () => undefined,
          }),
        ),
      )
      expect(error).toMatchObject({ reason: "defective-provider" })
    })
  })

  it("fails when the plugin resolves a non-final download", async () => {
    await withTempRoot(async root => {
      const registry = createAcquisitionPluginRegistry([
        {
          ...resolveOnlyPlugin(),
          resolveDownload: (_context, request) =>
            Effect.succeed({
              _tag: "NonFinalDownload" as const,
              providerId: request.providerId,
              reason: "interstitial" as const,
              url: request.candidateUrl,
            }),
        },
      ])
      const error = await Effect.runPromise(
        acquireArtifact({
          registry,
          context: createAcquisitionPluginContext(),
          stagingRoot: root,
          fetchImpl: fakeFetch,
          request: {
            providerId: "@local:fixture-roms",
            id: "drill-dozer",
            url: "https://roms.example.com/roms/drill-dozer",
          },
        }).pipe(
          Effect.match({
            onFailure: error => error,
            onSuccess: () => undefined,
          }),
        ),
      )
      expect(error).toMatchObject({ reason: "infrastructure" })
    })
  })
})

describe("rejectNonArtifactPayload", () => {
  const zipBytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00])

  it("accepts a plausible binary payload", () => {
    expect(
      rejectNonArtifactPayload({
        bytes: zipBytes,
        contentType: "application/zip",
        extension: "zip",
      }),
    ).toBeUndefined()
  })

  it("rejects HTML served with a game filename", () => {
    const page = Buffer.from(
      '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">\n<html lang="en">',
    )
    expect(
      rejectNonArtifactPayload({ bytes: page, extension: "zip" }),
    ).toContain("web page")
    expect(
      rejectNonArtifactPayload({
        bytes: zipBytes,
        contentType: "text/html; charset=utf-8",
        extension: "zip",
      }),
    ).toContain("web page")
  })

  it("rejects payloads whose magic does not match the extension", () => {
    expect(
      rejectNonArtifactPayload({
        bytes: Buffer.from("MZ not a zip at all"),
        extension: "zip",
      }),
    ).toContain(".zip")
  })

  it("rejects empty payloads and passes unknown extensions through", () => {
    expect(
      rejectNonArtifactPayload({ bytes: Buffer.alloc(0), extension: "sfc" }),
    ).toContain("empty")
    expect(
      rejectNonArtifactPayload({
        bytes: Buffer.from("raw rom bytes"),
        extension: "sfc",
      }),
    ).toBeUndefined()
  })
})

describe("resolve-download payload verification", () => {
  it("fails the acquire when the source serves a web page", async () => {
    await withTempRoot(async root => {
      const registry = createAcquisitionPluginRegistry([
        {
          metadata: {
            providerId: "@local:fixture-roms",
            displayName: "Fixture ROMs",
            module: "local/fixture-roms",
            builtIn: false,
            enabledByDefault: true,
            legalRisk: "high",
            credentialRequired: false,
          },
          resolveDownload: (_context, request) =>
            Effect.succeed({
              _tag: "FinalDownload" as const,
              providerId: request.providerId,
              url: "https://downloads.example.com/files/sonic.zip",
              filename: "sonic.zip",
            }),
        },
      ])
      const htmlFetch = (async () =>
        new Response("<!DOCTYPE html><html><body>ads</body></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        })) as unknown as typeof fetch
      const error = await Effect.runPromise(
        acquireArtifact({
          registry,
          context: createAcquisitionPluginContext(),
          stagingRoot: root,
          fetchImpl: htmlFetch,
          request: {
            providerId: "@local:fixture-roms",
            id: "sonic",
            url: "https://roms.example.com/roms/sonic",
          },
        }).pipe(
          Effect.match({ onFailure: e => e, onSuccess: () => undefined }),
        ),
      )
      expect(error).toMatchObject({ reason: "infrastructure" })
      expect(String((error as { message?: string })?.message)).toContain(
        "did not deliver the file",
      )
      expect(await readdir(root, { recursive: true })).toEqual([])
    })
  })
})
