import { afterEach, describe, expect, it } from "bun:test"
import { join } from "node:path"

const bridge = join(import.meta.dir, "index.ts")
const sentinel = join(import.meta.dir, "test-child.ts")
const ignoreTermChild = join(import.meta.dir, "ignore-term-child.ts")
const fakeNativeDriver = join(import.meta.dir, "fake-native-driver.ts")

const baseEnv = {
  PATH: process.env.PATH ?? "",
  KORRI_REMAP_RUNNER_USER: "korri-remap-runner",
  KORRI_REMAP_POLICY_JSON: JSON.stringify({ bindings: [] }),
}

const children: Array<ReturnType<typeof Bun.spawn>> = []

afterEach(() => {
  for (const child of children.splice(0)) {
    try {
      child.kill("SIGKILL")
    } catch {
      // already exited
    }
  }
  try {
    Bun.spawnSync(["pkill", "-f", ignoreTermChild])
  } catch {
    // best-effort cleanup for orphaned signal-test children
  }
})

describe("korri-remap-bridge CLI", () => {
  it("fails closed and does not run the child when native driver is disabled", async () => {
    const proc = spawnBridge({
      env: baseEnv,
      args: ["--launch-id", "launch-1", "--", "bun", sentinel],
    })

    expect(await proc.exited).toBe(1)
    expect(await new Response(proc.stderr).text()).toContain(
      "native Remap driver is not enabled",
    )
    expect(await new Response(proc.stdout).text()).not.toContain("child-ran")
  })

  it("runs through the native driver and propagates child exit code", async () => {
    const proc = spawnBridge({
      env: nativeDriverEnv(),
      args: ["--launch-id", "launch-2", "--", "bun", sentinel, "7"],
    })

    expect(await proc.exited).toBe(7)
    expect(await new Response(proc.stdout).text()).toContain("child-ran")
  })

  it("fails closed when enabled without an absolute trusted native driver", async () => {
    const proc = spawnBridge({
      env: { ...baseEnv, KORRI_REMAP_NATIVE_DRIVER: "enabled" },
      args: ["--launch-id", "launch-2b", "--", "bun", sentinel],
    })

    expect(await proc.exited).toBe(1)
    expect(await new Response(proc.stderr).text()).toContain(
      "native Remap driver path must be an absolute trusted path",
    )
  })

  it("escalates termination when the child ignores SIGTERM", async () => {
    const proc = spawnBridge({
      env: {
        ...nativeDriverEnv(),
        KORRI_REMAP_TERMINATE_GRACE_MS: "20",
      },
      args: ["--launch-id", "launch-3", "--", "bun", ignoreTermChild],
    })

    await waitForStdout(proc, "child-ready")
    proc.kill("SIGTERM")
    expect(await proc.exited).toBe(143)
  })
})

async function waitForStdout(
  proc: ReturnType<typeof Bun.spawn>,
  needle: string,
): Promise<void> {
  const reader = proc.stdout.getReader()
  const decoder = new TextDecoder()
  let buffered = ""
  while (!buffered.includes(needle)) {
    const next = await reader.read()
    if (next.done) throw new Error(`process exited before stdout contained ${needle}`)
    buffered += decoder.decode(next.value)
  }
  reader.releaseLock()
}

function nativeDriverEnv(): Record<string, string> {
  return {
    ...baseEnv,
    KORRI_REMAP_NATIVE_DRIVER: "enabled",
    KORRI_REMAP_NATIVE_DRIVER_PYTHON: "bun",
    KORRI_REMAP_NATIVE_DRIVER_PATH: fakeNativeDriver,
  }
}

function spawnBridge(input: { env: Record<string, string>; args: string[] }) {
  const proc = Bun.spawn(["bun", bridge, ...input.args], {
    stdout: "pipe",
    stderr: "pipe",
    env: input.env,
  })
  children.push(proc)
  return proc
}
