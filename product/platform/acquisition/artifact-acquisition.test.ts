import { describe, expect, it } from "bun:test"
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { PluginAcquireOutput } from "@platform/protocol/acquisition/artifact-acquisition"
import { Effect } from "effect"

import {
  acquireArtifact,
  acquisitionArtifactStagingRoot,
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
