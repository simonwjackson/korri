import { describe, expect, it } from "bun:test"
import type { ReadableResolvedLaunchContext } from "@platform/library/config/resolved-launch-context"
import { Effect } from "effect"
import {
  KORRI_ZQUEST_CLASSIC_APP_ID,
  KORRI_ZQUEST_CLASSIC_PLUGIN_ID,
} from "./plugin"
import { materializeReadableZQuestClassicLaunch } from "./readable-launch-integration"

describe("ZQuest Classic readable launch integration", () => {
  it("materializes the plugin-contributed zplayer launcher", async () => {
    const context: ReadableResolvedLaunchContext = {
      playableId: "to-the-top",
      itemId: "to-the-top",
      releaseId: "zelda-classic",
      system: "zelda-classic",
      target: "zelda-classic/ToTheTop.qst",
      app: {
        id: KORRI_ZQUEST_CLASSIC_APP_ID,
        plugin: KORRI_ZQUEST_CLASSIC_PLUGIN_ID,
        command: "zplayer",
        args: ["-standalone", "{content.path}", "{playable.id}.sav"],
        cwd: "/storage/saves/zquest-classic",
        env: {
          ZQUEST_CLASSIC_SAVE_FOLDER: "/storage/saves/zquest-classic",
        },
      },
      content: { path: "/storage/roms/zelda-classic/ToTheTop.qst" },
      cwd: "/storage/saves/zquest-classic",
      env: {
        ZQUEST_CLASSIC_SAVE_FOLDER: "/storage/saves/zquest-classic",
      },
      launchCompanions: {},
    }

    const result = await Effect.runPromise(
      materializeReadableZQuestClassicLaunch({ context }),
    )

    expect(result.spec).toEqual({
      command: "zplayer",
      args: [
        "-standalone",
        "/storage/roms/zelda-classic/ToTheTop.qst",
        "to-the-top.sav",
      ],
      cwd: "/storage/saves/zquest-classic",
      env: {
        ZQUEST_CLASSIC_SAVE_FOLDER: "/storage/saves/zquest-classic",
      },
    })
  })
})
