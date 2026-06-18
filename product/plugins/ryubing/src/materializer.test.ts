import { describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { ReadableResolvedLaunchContext } from "@platform/library/config/resolved-launch-context"
import { Effect } from "effect"
import { materializeReadableRyubingLaunch } from "./materializer"
import { KORRI_RYUBING_PLUGIN_ID } from "./plugin"

describe("Ryubing plugin materializer", () => {
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
      kind: "ryubing",
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
