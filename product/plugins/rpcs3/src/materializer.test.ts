import { describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AppMaterializationFailed } from "@platform/library/config/errors"
import type { ReadableResolvedLaunchContext } from "@platform/library/config/resolved-launch-context"
import { Cause, Effect, Exit } from "effect"
import {
  KORRI_RPCS3_APP_ID,
  KORRI_RPCS3_DEFAULT_COMMAND,
  KORRI_RPCS3_PLUGIN_ID,
  KORRI_RPCS3_PS3_SYSTEM_ID,
  KORRI_RPCS3_RUNTIME_ID,
  rpcs3ReadableLaunchIntegration,
} from ".."
import { materializeReadableRpcs3Launch } from "./materializer"

describe("RPCS3 readable launch integration", () => {
  it("can resolve only RPCS3 contexts with file content", () => {
    expect(rpcs3ReadableLaunchIntegration.canResolve(context({}))).toBe(true)
    expect(
      rpcs3ReadableLaunchIntegration.canResolve(
        context({ contentPath: undefined }),
      ),
    ).toBe(false)
    expect(
      rpcs3ReadableLaunchIntegration.canResolve(
        context({ appPlugin: "@korri:retroarch" }),
      ),
    ).toBe(false)
  })

  it("materializes PS3_DISC.SFB content into a no-gui launch for its parent folder", async () => {
    const root = await mkdtemp(join(tmpdir(), "korri-rpcs3-materializer-"))
    try {
      const gameFolder = join(root, "Skate 3 [BLUS30464]")
      const marker = join(gameFolder, "PS3_DISC.SFB")
      const stateRoot = join(root, "state")
      const firmwareSentinel = "dev_flash/sys/external/liblv2.sprx"
      await mkdir(gameFolder, { recursive: true })
      await writeFile(marker, "disc")
      await mkdir(join(stateRoot, "dev_flash", "sys", "external"), {
        recursive: true,
      })
      await writeFile(join(stateRoot, firmwareSentinel), "firmware")

      const result = await Effect.runPromise(
        materializeReadableRpcs3Launch({
          context: context({
            contentPath: marker,
            policy: {
              command: KORRI_RPCS3_DEFAULT_COMMAND,
              state: { root: stateRoot },
              firmware: { sentinel: firmwareSentinel },
            },
          }),
        }),
      )

      expect(result.spec).toEqual({
        command: KORRI_RPCS3_DEFAULT_COMMAND,
        args: ["--no-gui", gameFolder],
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("resolves storage tokens in policy roots", async () => {
    const root = await mkdtemp(join(tmpdir(), "korri-rpcs3-storage-"))
    try {
      const gameFolder = join(root, "games", "Skate 3 [BLUS30464]")
      const marker = join(gameFolder, "PS3_DISC.SFB")
      const stateRoot = join(root, "state")
      const firmwareSentinel = "dev_flash/sys/external/liblv2.sprx"
      await mkdir(gameFolder, { recursive: true })
      await writeFile(marker, "disc")
      await mkdir(join(stateRoot, "dev_flash", "sys", "external"), {
        recursive: true,
      })
      await writeFile(join(stateRoot, firmwareSentinel), "firmware")

      const result = await Effect.runPromise(
        materializeReadableRpcs3Launch({
          context: context({
            contentPath: marker,
            storage: {
              "@korri:rpcs3/state": { id: "state", root: stateRoot },
            },
            policy: {
              command: KORRI_RPCS3_DEFAULT_COMMAND,
              state: { root: "{storage:@korri:rpcs3/state}" },
              firmware: { sentinel: firmwareSentinel },
            },
          }),
        }),
      )

      expect(result.spec.args.at(-1)).toBe(gameFolder)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("fails before spawn when content, command, or firmware is missing", async () => {
    const missingContent = await Effect.runPromiseExit(
      materializeReadableRpcs3Launch({
        context: context({ contentPath: undefined }),
      }),
    )
    expectFailureReason(
      missingContent,
      "require a resolved PS3 disc marker path",
    )

    const relativeCommand = await Effect.runPromiseExit(
      materializeReadableRpcs3Launch({
        context: context({
          policy: { command: "rpcs3", state: { root: "/tmp" } },
        }),
      }),
    )
    expectFailureReason(relativeCommand, "require an absolute RPCS3 command")

    const root = await mkdtemp(join(tmpdir(), "korri-rpcs3-missing-fw-"))
    try {
      const gameFolder = join(root, "Skate 3 [BLUS30464]")
      const marker = join(gameFolder, "PS3_DISC.SFB")
      const stateRoot = join(root, "state")
      await mkdir(gameFolder, { recursive: true })
      await writeFile(marker, "disc")
      await mkdir(stateRoot, { recursive: true })

      const missingFirmware = await Effect.runPromiseExit(
        materializeReadableRpcs3Launch({
          context: context({
            contentPath: marker,
            policy: {
              command: KORRI_RPCS3_DEFAULT_COMMAND,
              state: { root: stateRoot },
            },
          }),
        }),
      )
      expectFailureReason(missingFirmware, "RPCS3 firmware is missing")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

function context(
  input: {
    readonly appPlugin?: string
    readonly contentPath?: string
    readonly policy?: unknown
    readonly storage?: ReadableResolvedLaunchContext["storage"]
  } = {},
): ReadableResolvedLaunchContext {
  return {
    playableId: "Skate 3 [BLUS30464]",
    releaseId: "Skate 3 [BLUS30464]",
    itemId: "Skate 3 [BLUS30464]",
    system: KORRI_RPCS3_PS3_SYSTEM_ID,
    target: "Skate 3 [BLUS30464]/PS3_DISC.SFB",
    app: {
      id: KORRI_RPCS3_APP_ID,
      plugin: input.appPlugin ?? KORRI_RPCS3_PLUGIN_ID,
      command: KORRI_RPCS3_DEFAULT_COMMAND,
      policy: { allowedCommands: [KORRI_RPCS3_DEFAULT_COMMAND] },
    },
    runtime: {
      id: KORRI_RPCS3_RUNTIME_ID,
      kind: "emulator",
      path: KORRI_RPCS3_DEFAULT_COMMAND,
    },
    ...(Object.hasOwn(input, "contentPath")
      ? input.contentPath === undefined
        ? {}
        : { content: { path: input.contentPath } }
      : { content: { path: "/tmp/Skate 3 [BLUS30464]/PS3_DISC.SFB" } }),
    launchCompanions: {},
    plugin: {
      [KORRI_RPCS3_PLUGIN_ID]: input.policy ?? {
        command: KORRI_RPCS3_DEFAULT_COMMAND,
        state: { root: "/tmp/rpcs3" },
      },
    },
    storage: input.storage,
  }
}

function expectFailureReason(
  exit: Exit.Exit<unknown, unknown>,
  reason: string,
): void {
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isFailure(exit)) {
    const error = Cause.squash(exit.cause)
    expect(error).toBeInstanceOf(AppMaterializationFailed)
    expect((error as AppMaterializationFailed).reason).toContain(reason)
  }
}
