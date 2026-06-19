import { describe, expect, it } from "bun:test"
import { chmod, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Cause, Effect } from "effect"
import type { ExecutablePluginResource } from "."
import { createStagedExecutableResolver } from "./resources"

const resource: ExecutablePluginResource = {
  id: "3dsen",
  kind: "executable",
  fulfill: {
    provider: "staged-path",
    root: "/games/3dsen",
    binary: "3dSen.exe",
  },
}

describe("staged executable resources", () => {
  it("resolve a configured staged executable root to command and cwd", async () => {
    const root = await mktemp()
    const executable = join(root, "3dSen.exe")
    await writeFile(executable, "#!/bin/sh\n")
    await chmod(executable, 0o755)

    const resolver = createStagedExecutableResolver()
    await expect(
      Effect.runPromise(
        resolver.resolveExecutable({
          pluginId: "@korri:3dsen",
          resource: { ...resource, fulfill: { ...resource.fulfill, root } },
        }),
      ),
    ).resolves.toEqual({
      pluginId: "@korri:3dsen",
      resourceId: "3dsen",
      command: executable,
      cwd: root,
    })
  })

  it("rejects missing or non-executable staged binaries", async () => {
    const root = await mktemp()
    await writeFile(join(root, "3dSen.exe"), "not executable")
    const resolver = createStagedExecutableResolver()

    const exit = await Effect.runPromiseExit(
      resolver.resolveExecutable({
        pluginId: "@korri:3dsen",
        resource: { ...resource, fulfill: { ...resource.fulfill, root } },
      }),
    )

    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") {
      expect(Cause.squash(exit.cause)).toMatchObject({
        path: join(root, "3dSen.exe"),
      })
    }
  })
})

async function mktemp(): Promise<string> {
  return await import("node:fs/promises").then(fs =>
    fs.mkdtemp(join(tmpdir(), "korri-staged-resource-")),
  )
}
