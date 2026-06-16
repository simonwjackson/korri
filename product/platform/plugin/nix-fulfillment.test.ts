import { describe, expect, it } from "bun:test"
import { chmod, mkdir, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"

import type { ExecutablePluginResource } from "."
import {
  createNixOutLinkFulfiller,
  createNixOutLinkResolver,
  executablePath,
  fulfillNixOutLinkExecutable,
  outLinkPath,
  type ProcessRunner,
  resolveNixOutLinkExecutable,
} from "./resources"

const resource: ExecutablePluginResource = {
  id: "neverball",
  kind: "executable",
  fulfill: {
    provider: "nix",
    installable: "nixpkgs#neverball",
    binary: "neverball",
  },
}

describe("Nix out-link fulfillment", () => {
  it("keeps distinct ids on safe distinct out-link paths", async () => {
    const stateRoot = await mktemp()

    expect(outLinkPath(stateRoot, "@korri:a/b", resource.id)).toBe(
      join(stateRoot, "x406b6f7272693a612f62", "x6e6576657262616c6c", "result"),
    )
    expect(outLinkPath(stateRoot, "@korri:a/b", resource.id)).not.toBe(
      outLinkPath(stateRoot, "@korri:a:b", resource.id),
    )
    expect(outLinkPath(stateRoot, "@korri:neverball", "..")).toBe(
      join(stateRoot, "x406b6f7272693a6e6576657262616c6c", "x2e2e", "result"),
    )
    expect(outLinkPath(stateRoot, "@korri:neverball", "")).toBe(
      join(stateRoot, "x406b6f7272693a6e6576657262616c6c", "x", "result"),
    )
  })

  it("builds through an absolute Nix command and resolves the binary under the out-link", async () => {
    const stateRoot = await mktemp()
    const calls: Array<{ command: string; args: readonly string[] }> = []
    const runner: ProcessRunner = {
      run: async (command, args) => {
        calls.push({ command, args })
        await seedExecutable(stateRoot)
        return { exitCode: 0 }
      },
    }

    const result = await Effect.runPromise(
      fulfillNixOutLinkExecutable({
        stateRoot,
        nixCommand: "/nix/store/hash-nix/bin/nix",
        runner,
        pluginId: "@korri:neverball",
        resource,
      }),
    )

    expect(calls).toEqual([
      {
        command: "/nix/store/hash-nix/bin/nix",
        args: [
          "build",
          "nixpkgs#neverball",
          "--out-link",
          outLinkPath(stateRoot, "@korri:neverball", resource.id),
        ],
      },
    ])
    expect(result.command).toBe(
      executablePath(stateRoot, "@korri:neverball", resource.id, "neverball"),
    )
  })

  it("rejects a PATH-based Nix command", async () => {
    const exit = await Effect.runPromiseExit(
      fulfillNixOutLinkExecutable({
        stateRoot: await mktemp(),
        nixCommand: "nix",
        runner: { run: async () => ({ exitCode: 0 }) },
        pluginId: "@korri:neverball",
        resource,
      }),
    )

    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") {
      expect(exit.cause.toString()).toContain(
        "Nix command must be an absolute path",
      )
    }
  })

  it("keeps read-only resolution separate from explicit fulfillment", async () => {
    const stateRoot = await mktemp()
    const calls: Array<{ command: string; args: readonly string[] }> = []
    const resolver = createNixOutLinkResolver({ stateRoot })
    const fulfiller = createNixOutLinkFulfiller({
      stateRoot,
      nixCommand: "/nix/store/hash-nix/bin/nix",
      runner: {
        run: async (command, args) => {
          calls.push({ command, args })
          await seedExecutable(stateRoot)
          return { exitCode: 0 }
        },
      },
    })

    const missing = await Effect.runPromiseExit(
      resolver.resolveExecutable({ pluginId: "@korri:neverball", resource }),
    )
    expect(missing._tag).toBe("Failure")
    expect(calls).toHaveLength(0)

    const resolved = await Effect.runPromise(
      fulfiller.fulfillExecutable({ pluginId: "@korri:neverball", resource }),
    )

    expect(calls).toHaveLength(1)
    expect(resolved.command).toBe(
      executablePath(stateRoot, "@korri:neverball", resource.id, "neverball"),
    )
  })

  it("reports a non-executable binary under an out-link as missing", async () => {
    const stateRoot = await mktemp()
    const store = join(stateRoot, "store-neverball")
    await mkdir(join(store, "bin"), { recursive: true })
    await writeFile(join(store, "bin", "neverball"), "#!/bin/sh\n", {
      mode: 0o644,
    })
    const link = outLinkPath(stateRoot, "@korri:neverball", resource.id)
    await mkdir(join(link, ".."), { recursive: true })
    await symlink(store, link)

    const exit = await Effect.runPromiseExit(
      resolveNixOutLinkExecutable({
        stateRoot,
        pluginId: "@korri:neverball",
        resource,
      }),
    )

    expect(exit._tag).toBe("Failure")
  })

  it("reports a missing executable under an out-link", async () => {
    const exit = await Effect.runPromiseExit(
      resolveNixOutLinkExecutable({
        stateRoot: await mktemp(),
        pluginId: "@korri:neverball",
        resource,
      }),
    )

    expect(exit._tag).toBe("Failure")
  })

  it("reports unsuccessful Nix builds", async () => {
    const exit = await Effect.runPromiseExit(
      fulfillNixOutLinkExecutable({
        stateRoot: await mktemp(),
        nixCommand: "/nix/store/hash-nix/bin/nix",
        runner: {
          run: async () => ({ exitCode: 1, stderr: "no substituter" }),
        },
        pluginId: "@korri:neverball",
        resource,
      }),
    )

    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") {
      expect(exit.cause.toString()).toContain("no substituter")
    }
  })
})

async function mktemp(): Promise<string> {
  return await import("node:fs/promises").then(fs =>
    fs.mkdtemp(join(tmpdir(), "korri-plugin-nix-")),
  )
}

async function seedExecutable(stateRoot: string): Promise<void> {
  const store = join(stateRoot, "store-neverball")
  await mkdir(join(store, "bin"), { recursive: true })
  const executable = join(store, "bin", "neverball")
  await Bun.write(executable, "#!/bin/sh\n")
  await chmod(executable, 0o755)
  await symlink(store, outLinkPath(stateRoot, "@korri:neverball", resource.id))
}
