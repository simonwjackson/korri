#!/usr/bin/env bun

export {}

const launchId = valueAfter("--launch-id", process.argv)
const separator = process.argv.indexOf("--")
const childCommand = separator >= 0 ? process.argv[separator + 1] : undefined
const childArgs = separator >= 0 ? process.argv.slice(separator + 2) : []

if (!launchId) fail("missing --launch-id")
if (!childCommand) fail("missing child command after --")
if (process.env.KORRI_REMAP_RUNNER_USER !== "korri-remap-runner") {
  fail("KORRI_REMAP_RUNNER_USER must be korri-remap-runner")
}
if (!process.env.KORRI_REMAP_POLICY_JSON) fail("missing KORRI_REMAP_POLICY_JSON")

// This command is the stable product-owned boundary for native Remap. The
// privileged uinput/ACL implementation is intentionally behind this binary so
// launch composition does not grow device-management policy. Until the native
// driver is enabled by a host build, fail closed instead of running a child
// without the promised launch-scoped input isolation.
if (process.env.KORRI_REMAP_NATIVE_DRIVER !== "enabled") {
  fail("native Remap driver is not enabled; refusing unisolated launch")
}

const child = Bun.spawn([childCommand, ...childArgs], {
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
  env: process.env,
})

const stopChild = () => {
  child.kill("SIGTERM")
}
process.on("SIGTERM", stopChild)
process.on("SIGINT", stopChild)

const result = await child.exited
process.exit(result)

function valueAfter(flag: string, argv: readonly string[]): string | undefined {
  const index = argv.indexOf(flag)
  return index >= 0 ? argv[index + 1] : undefined
}

function fail(message: string): never {
  console.error(`korri-remap-bridge: ${message}`)
  process.exit(1)
}
