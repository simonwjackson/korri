import { describe, expect, it } from "bun:test"
import { chmod, mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"
import { FulfillPluginResourcePayload } from "./fulfill-resource.rpc"
import { handleFulfillPluginResource } from "./fulfill-resource.rpc-handler"

const envKeys = [
  "KORRI_ENABLED_PLUGINS",
  "KORRI_NIX_COMMAND",
  "KORRI_PLUGIN_RESOURCE_ROOT",
] as const

describe("app.plugins.resource.fulfill", () => {
  it("fulfills an enabled executable resource through the configured Nix command", async () => {
    const previous = snapshotEnv()
    const root = await mkdtemp(join(tmpdir(), "korri-plugin-rpc-"))
    const nixCommand = join(root, "fake-nix")
    await Bun.write(
      nixCommand,
      `#!/bin/sh
set -eu
out=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--out-link" ]; then
    shift
    out="$1"
  fi
  shift || true
done
store="$(dirname "$out")/fake-store"
mkdir -p "$store/bin"
printf '#!/bin/sh\n' > "$store/bin/neverball"
chmod +x "$store/bin/neverball"
rm -f "$out"
ln -s "$store" "$out"
`,
    )
    await chmod(nixCommand, 0o755)
    process.env.KORRI_ENABLED_PLUGINS = "@korri:neverball"
    process.env.KORRI_NIX_COMMAND = nixCommand
    process.env.KORRI_PLUGIN_RESOURCE_ROOT = root
    try {
      const response = await Effect.runPromise(
        handleFulfillPluginResource(
          new FulfillPluginResourcePayload({
            pluginId: "@korri:neverball",
            resourceId: "neverball-executable",
          }),
        ),
      )

      expect(response.pluginId).toBe("@korri:neverball")
      expect(response.resourceId).toBe("neverball-executable")
      expect(response.command).toBe(
        join(
          root,
          "x406b6f7272693a6e6576657262616c6c",
          "x6e6576657262616c6c2d65786563757461626c65",
          "result",
          "bin",
          "neverball",
        ),
      )
    } finally {
      restoreEnv(previous)
    }
  })

  it("requires an enabled plugin resource", async () => {
    const previous = snapshotEnv()
    delete process.env.KORRI_ENABLED_PLUGINS
    try {
      const exit = await Effect.runPromiseExit(
        handleFulfillPluginResource(
          new FulfillPluginResourcePayload({
            pluginId: "@korri:neverball",
            resourceId: "neverball-executable",
          }),
        ),
      )

      expect(exit._tag).toBe("Failure")
      if (exit._tag === "Failure") {
        expect(exit.cause.toString()).toContain("not enabled")
      }
    } finally {
      restoreEnv(previous)
    }
  })

  it("is an explicit operation gated by the host Nix command", async () => {
    const previous = snapshotEnv()
    process.env.KORRI_ENABLED_PLUGINS = "@korri:neverball"
    delete process.env.KORRI_NIX_COMMAND
    try {
      const exit = await Effect.runPromiseExit(
        handleFulfillPluginResource(
          new FulfillPluginResourcePayload({
            pluginId: "@korri:neverball",
            resourceId: "neverball-executable",
          }),
        ),
      )

      expect(exit._tag).toBe("Failure")
      if (exit._tag === "Failure") {
        expect(exit.cause.toString()).toContain("KORRI_NIX_COMMAND")
      }
    } finally {
      restoreEnv(previous)
    }
  })
})

function snapshotEnv() {
  return Object.fromEntries(
    envKeys.map(key => [key, process.env[key]]),
  ) as Record<(typeof envKeys)[number], string | undefined>
}

function restoreEnv(previous: ReturnType<typeof snapshotEnv>) {
  for (const key of envKeys) {
    const value = previous[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}
