import { describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { ReadableResolvedLaunchContext } from "@platform/library/config/resolved-launch-context"
import { Effect } from "effect"
import {
  materializeReadableRyubingLaunch,
  ryubingReadableLaunchIntegration,
} from "./materializer"
import { KORRI_RYUBING_PLUGIN_ID } from "./plugin"

describe("Ryubing plugin materializer", () => {
  it("registers under the provider-qualified plugin app kind", () => {
    expect(ryubingReadableLaunchIntegration.kind).toBe(KORRI_RYUBING_PLUGIN_ID)
  })

  it("materializes plugin-owned policy into config and launch spec", async () => {
    const root = await mkdtemp(join(tmpdir(), "korri-ryubing-plugin-"))
    try {
      const stateRoot = join(root, "state")
      await mkdir(join(stateRoot, "system"), { recursive: true })
      await writeFile(join(stateRoot, "system", "prod.keys"), "keys")
      const game = join(root, "game.nsp")
      await writeFile(game, "game")

      const result = await Effect.runPromise(
        materializeReadableRyubingLaunch({
          context: context({
            stateRoot,
            contentPath: game,
            policy: {
              state: { root: stateRoot },
              input: {
                controllers: [{ id: "0", mapping: { a: "button-east" } }],
              },
            },
          }),
        }),
      )

      expect(result.spec.command).toBe("Ryujinx")
      expect(result.spec.args).toContain("--root-data-dir")
      expect(result.spec.args.at(-1)).toBe(game)
      const config = JSON.parse(
        await readFile(join(stateRoot, "Config.json"), "utf8"),
      )
      expect(config.input_config).toHaveLength(1)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("overrides.config.replace wipes the on-disk Config.json instead of blending it", async () => {
    const root = await mkdtemp(join(tmpdir(), "korri-ryubing-plugin-"))
    try {
      const stateRoot = join(root, "state")
      await mkdir(join(stateRoot, "system"), { recursive: true })
      await writeFile(join(stateRoot, "system", "prod.keys"), "keys")
      await writeFile(
        join(stateRoot, "Config.json"),
        JSON.stringify({
          version: 70,
          stale_key: "should-be-gone",
          input_config: [{ id: "9" }],
        }),
      )
      const game = join(root, "game.nsp")
      await writeFile(game, "game")

      await Effect.runPromise(
        materializeReadableRyubingLaunch({
          context: {
            ...context({
              stateRoot,
              contentPath: game,
              policy: { state: { root: stateRoot } },
            }),
            overrides: {
              config: {
                replace:
                  '{ "version": 70, "input_config": [{ "id": "0" }], "override_only": true }',
              },
            },
          },
        }),
      )

      const config = JSON.parse(
        await readFile(join(stateRoot, "Config.json"), "utf8"),
      )
      expect(config.stale_key).toBeUndefined()
      expect(config.override_only).toBe(true)
      expect(config.input_config).toEqual([{ id: "0" }])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("substitutes storage-token state roots before materialization", async () => {
    const root = await mkdtemp(join(tmpdir(), "korri-ryubing-plugin-"))
    try {
      const stateRoot = join(root, "state")
      await mkdir(join(stateRoot, "system"), { recursive: true })
      await writeFile(join(stateRoot, "system", "prod.keys"), "keys")
      const game = join(root, "game.xci")
      await writeFile(game, "game")

      const result = await Effect.runPromise(
        materializeReadableRyubingLaunch({
          context: {
            ...context({
              stateRoot,
              contentPath: game,
              policy: {
                state: { root: "{storage:@korri:ryubing/state}" },
                input: {
                  controllers: [{ id: "0", mapping: { a: "button-east" } }],
                },
              },
            }),
            storage: {
              "@korri:ryubing/state": {
                id: "@korri:ryubing/state",
                root: stateRoot,
              },
            },
          },
        }),
      )

      expect(result.spec.args).toContain(stateRoot)
      expect(result.spec.args.at(-1)).toBe(game)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

function context(input: {
  readonly stateRoot: string
  readonly contentPath: string
  readonly policy: unknown
}): ReadableResolvedLaunchContext {
  return {
    playableId: "switch-game",
    releaseId: "file",
    app: {
      id: "switch-runtime",
      plugin: KORRI_RYUBING_PLUGIN_ID,
      command: "Ryujinx",
    },
    itemId: "switch-game",
    system: "switch",
    target: "game.nsp",
    content: { path: input.contentPath },
    launchCompanions: {},
    plugin: { [KORRI_RYUBING_PLUGIN_ID]: input.policy },
  }
}
