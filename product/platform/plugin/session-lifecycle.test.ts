import { describe, expect, it } from "bun:test"
import type { KorriSessionLifecycleHookFactory } from "./session-lifecycle"

describe("plugin session lifecycle hook seam", () => {
  it("passes launch metadata through typed hook factories", async () => {
    const factory: KorriSessionLifecycleHookFactory = {
      pluginId: "@korri:test",
      create: () => ({
        id: "@korri:test",
        afterChildRunning: async request => ({
          label: request.launchMetadata?.appProviderId,
        }),
        cleanup: async request => ({
          cleaned: request.launchMetadata?.appProviderId ? [1] : [],
          residual: [],
        }),
      }),
    }

    const hook = factory.create({ env: {} as NodeJS.ProcessEnv })
    await expect(
      hook.afterChildRunning?.({
        launchId: "launch-1",
        spec: { command: "/bin/game", args: [] },
        launchMetadata: { appProviderId: "@korri:test" },
      }),
    ).resolves.toEqual({ label: "@korri:test" })
    await expect(
      hook.cleanup?.({
        launchId: "launch-1",
        launchMetadata: { appProviderId: "@korri:test" },
      }),
    ).resolves.toEqual({ cleaned: [1], residual: [] })
  })
})
