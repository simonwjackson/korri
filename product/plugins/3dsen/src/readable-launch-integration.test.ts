import { describe, expect, it } from "bun:test"
import type { ReadableResolvedLaunchContext } from "@platform/library/config/resolved-launch-context"
import { Effect } from "effect"
import { KORRI_BOX64_RUNTIME_PLUGIN_ID } from "../../box64-runtime"
import { KORRI_TURNIP_PLUGIN_ID } from "../../turnip"
import {
  materializeReadable3dSenLaunch,
  threeDSenReadableLaunchIntegration,
} from "./readable-launch-integration"
import {
  KORRI_3DSEN_APP_ID,
  KORRI_3DSEN_PLUGIN_ID,
} from "./plugin"

const context: ReadableResolvedLaunchContext = {
  playableId: "smb3d",
  itemId: "smb3d",
  releaseId: "3dsen",
  system: "3dsen",
  target: "smb.nes",
  app: {
    id: KORRI_3DSEN_APP_ID,
    kind: KORRI_3DSEN_PLUGIN_ID,
    command: "3dSen.exe",
  },
  launchCompanions: {
    [KORRI_BOX64_RUNTIME_PLUGIN_ID]: { unityMode: true, maxCpu: 1 },
    [KORRI_TURNIP_PLUGIN_ID]: { enable: true },
  },
  plugin: {
    [KORRI_3DSEN_PLUGIN_ID]: {
      executableRoot: "/games/3dsen",
      registryPath: "/home/korri/.config/unity3d/Geod Studio/3dSen/rom.json",
      profileId: "37",
      profiles: [
        {
          id: "37",
          title: "Super Mario Bros.",
          romPath: "/roms/Super Mario Bros.nes",
        },
        {
          id: "12",
          title: "The Legend of Zelda",
          romPath: "/roms/Zelda.nes",
        },
      ],
    },
  },
}

describe("3dSen readable launch integration", () => {
  it("advertises provider ownership and resolves app-like 3dSen contexts", () => {
    expect(threeDSenReadableLaunchIntegration).toMatchObject({
      providerId: KORRI_3DSEN_PLUGIN_ID,
      kind: KORRI_3DSEN_PLUGIN_ID,
      integration: "3dsen",
    })
    expect(threeDSenReadableLaunchIntegration.canResolve(context)).toBe(true)
    expect(
      threeDSenReadableLaunchIntegration.canResolve({
        ...context,
        plugin: undefined,
      }),
    ).toBe(false)
  })

  it("materializes profile-id argv and launch.prepare state", async () => {
    await expect(
      Effect.runPromise(materializeReadable3dSenLaunch({ context })),
    ).resolves.toEqual({
      spec: {
        command: "/games/3dsen/3dSen.exe",
        args: ["-id=37"],
        cwd: "/games/3dsen",
      },
      launchPrepare: {
        [KORRI_3DSEN_PLUGIN_ID]: {
          registryPath:
            "/home/korri/.config/unity3d/Geod Studio/3dSen/rom.json",
          selectedProfileId: "37",
          profiles: [
            {
              id: "37",
              title: "Super Mario Bros.",
              romPath: "/roms/Super Mario Bros.nes",
            },
            {
              id: "12",
              title: "The Legend of Zelda",
              romPath: "/roms/Zelda.nes",
            },
          ],
        },
      },
      launchMetadata: { appProviderId: KORRI_3DSEN_PLUGIN_ID },
    })
  })

  it("fails clearly when the selected profile is absent", async () => {
    const exit = await Effect.runPromiseExit(
      materializeReadable3dSenLaunch({
        context: {
          ...context,
          plugin: {
            [KORRI_3DSEN_PLUGIN_ID]: {
              executableRoot: "/games/3dsen",
              registryPath: "/state/rom.json",
              profileId: "99",
              profiles: [
                {
                  id: "37",
                  title: "Super Mario Bros.",
                  romPath: "/roms/smb.nes",
                },
              ],
            },
          },
        },
      }),
    )

    expect(exit._tag).toBe("Failure")
  })
})
