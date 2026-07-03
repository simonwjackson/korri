#!/usr/bin/env bun

const separator = process.argv.indexOf("--")
if (separator < 0) process.exit(64)
const childArgv = process.argv.slice(separator + 1)
const child = Bun.spawn(childArgv, {
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
  env: Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !key.startsWith("KORRI_REMAP_"),
    ),
  ) as Record<string, string>,
})

let terminating = false
const terminate = async (code: number) => {
  if (terminating) return
  terminating = true
  child.kill("SIGTERM")
  await child.exited.catch(() => undefined)
  process.exit(code)
}
process.on("SIGTERM", () => void terminate(143))
process.on("SIGINT", () => void terminate(130))

process.exit(await child.exited)
