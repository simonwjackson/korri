import { describe, expect, it } from "bun:test"
import type { ReadableResolvedLaunchContext } from "@platform/library/config/resolved-launch-context"
import {
  KORRI_MELONDS_APP_ID,
  KORRI_MELONDS_DEFAULT_COMMAND,
  KORRI_MELONDS_NDS_SYSTEM_ID,
  KORRI_MELONDS_PLUGIN_ID,
} from ".."
import { melonDsReadableLaunchIntegration } from "./readable-launch-integration"

describe("melonDS readable launch integration", () => {
  it("can resolve only melonDS contexts with file content and valid policy", () => {
    expect(melonDsReadableLaunchIntegration.providerId).toBe(
      KORRI_MELONDS_PLUGIN_ID,
    )
    expect(melonDsReadableLaunchIntegration.canResolve(context())).toBe(true)
    expect(
      melonDsReadableLaunchIntegration.canResolve(
        context({ contentPath: undefined }),
      ),
    ).toBe(false)
    expect(
      melonDsReadableLaunchIntegration.canResolve(
        context({ appPlugin: "@korri:retroarch" }),
      ),
    ).toBe(false)
    expect(
      melonDsReadableLaunchIntegration.canResolve(
        context({ policy: { display: { gap: -1 } } }),
      ),
    ).toBe(false)
  })
})

function context(
  input: {
    readonly appPlugin?: string
    readonly contentPath?: string
    readonly policy?: unknown
  } = {},
): ReadableResolvedLaunchContext {
  return {
    playableId: "Mario Kart DS",
    releaseId: "Mario Kart DS",
    itemId: "Mario Kart DS",
    system: KORRI_MELONDS_NDS_SYSTEM_ID,
    target: "Mario Kart DS.nds",
    app: {
      id: KORRI_MELONDS_APP_ID,
      plugin: input.appPlugin ?? KORRI_MELONDS_PLUGIN_ID,
      command: KORRI_MELONDS_DEFAULT_COMMAND,
      policy: { allowedCommands: [KORRI_MELONDS_DEFAULT_COMMAND] },
    },
    ...(Object.hasOwn(input, "contentPath")
      ? input.contentPath === undefined
        ? {}
        : { content: { path: input.contentPath } }
      : { content: { path: "/games/Mario Kart DS.nds" } }),
    launchCompanions: {},
    plugin: {
      [KORRI_MELONDS_PLUGIN_ID]: input.policy ?? {
        state: { root: "/tmp/melonDS" },
      },
    },
  }
}
