#!/usr/bin/env bun

export {}

const separator = process.argv.indexOf("--")
const launchId = valueBeforeSeparator("--launch-id", process.argv, separator)
const policyJson =
  valueBeforeSeparator("--policy-json", process.argv, separator) ??
  process.env.KORRI_REMAP_POLICY_JSON
const runnerUser =
  valueBeforeSeparator("--runner-user", process.argv, separator) ??
  process.env.KORRI_REMAP_RUNNER_USER
const childCommand = separator >= 0 ? process.argv[separator + 1] : undefined
const childArgs = separator >= 0 ? process.argv.slice(separator + 2) : []
const terminateGraceMs = Number(
  process.env.KORRI_REMAP_TERMINATE_GRACE_MS ?? "2000",
)
const nativeDriverPath = process.env.KORRI_REMAP_NATIVE_DRIVER_PATH
const nativeDriverPython =
  process.env.KORRI_REMAP_NATIVE_DRIVER_PYTHON ?? "python3"

if (!launchId) fail("missing --launch-id")
if (!childCommand) fail("missing child command after --")
if (runnerUser !== "korri-remap-runner") {
  fail("Remap runner user must be korri-remap-runner")
}
if (!policyJson) fail("missing Remap policy JSON")

// This command is the stable product-owned boundary for native Remap. The
// privileged uinput/ACL implementation is intentionally behind this binary so
// launch composition does not grow device-management policy. Until the native
// driver is enabled by a trusted host build, fail closed instead of running a
// child without the promised launch-scoped input isolation.
if (process.env.KORRI_REMAP_NATIVE_DRIVER !== "enabled") {
  fail("native Remap driver is not enabled; refusing unisolated launch")
}
if (!nativeDriverPath?.startsWith("/")) {
  fail("native Remap driver path must be an absolute trusted path")
}

const child = Bun.spawn(
  [
    nativeDriverPython,
    nativeDriverPath,
    "--launch-id",
    launchId,
    "--policy-json",
    policyJson,
    "--runner-user",
    runnerUser,
    "--",
    childCommand,
    ...childArgs,
  ],
  {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: process.env,
  },
)

let terminating = false

const terminateChild = async (exitCode: number): Promise<never> => {
  if (terminating) await new Promise(() => undefined)
  terminating = true
  try {
    child.kill("SIGTERM")
  } catch {
    process.exit(exitCode)
  }
  const exited = await Promise.race([
    child.exited.then(() => true),
    Bun.sleep(Number.isFinite(terminateGraceMs) ? terminateGraceMs : 2000).then(
      () => false,
    ),
  ])
  if (!exited) {
    try {
      child.kill("SIGKILL")
    } catch {
      // Already exited.
    }
    await child.exited.catch(() => undefined)
  }
  process.exit(exitCode)
}

process.on("SIGTERM", () => {
  void terminateChild(143)
})
process.on("SIGINT", () => {
  void terminateChild(130)
})

const result = await child.exited
if (!terminating) process.exit(result)
await new Promise(() => undefined)

function valueBeforeSeparator(
  flag: string,
  argv: readonly string[],
  separatorIndex: number,
): string | undefined {
  const limit = separatorIndex >= 0 ? separatorIndex : argv.length
  for (let index = 0; index < limit; index += 1) {
    if (argv[index] === flag) return argv[index + 1]
  }
  return undefined
}

function fail(message: string): never {
  console.error(`korri-remap-bridge: ${message}`)
  process.exit(1)
}
