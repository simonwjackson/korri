#!/usr/bin/env bun

import {
  checkDemoVideoPrerequisites,
  failedDemoVideoPrerequisites,
  formatDemoVideoPrerequisiteFailures,
  listDemoVideoNames,
  runDemoVideo,
} from "./stack-runner"

const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run")
const checkOnly = args.includes("--check-only")
const demoName = args.find(arg => !arg.startsWith("--"))
const portOffset = process.pid % 10_000
const defaultWebPort = 30_000 + portOffset
const defaultApiPort = defaultWebPort + 1
const defaultPlaywrightTimeoutMs = 900_000

async function main() {
  const failedPrerequisites = failedDemoVideoPrerequisites(
    checkDemoVideoPrerequisites(),
  )

  if (failedPrerequisites.length > 0 && !dryRun) {
    process.stderr.write("Demo video prerequisites failed:\n")
    process.stderr.write(
      formatDemoVideoPrerequisiteFailures(failedPrerequisites),
    )
    process.stderr.write("\n")
    process.exit(1)
  }

  if (checkOnly) {
    process.stdout.write("Demo video prerequisites passed.\n")
    return
  }

  if (!demoName) {
    const available = listDemoVideoNames()
    if (available.length === 0) {
      process.stdout.write(
        "No demos available yet. Tag a BDD scenario with @demo(<name>) and run `just generate-bdd` to generate one.\n",
      )
      return
    }
    process.stdout.write(
      `Available demos: ${available.join(", ")}. Pass one as the first argument.\n`,
    )
    return
  }

  const plan = await runDemoVideo({
    demoName,
    dryRun,
    webPort: Number(process.env.DEMO_VIDEO_WEB_PORT ?? String(defaultWebPort)),
    apiPort: Number(process.env.DEMO_VIDEO_API_PORT ?? String(defaultApiPort)),
    playwrightTimeoutMs: Number(
      process.env.DEMO_VIDEO_PLAYWRIGHT_TIMEOUT_MS ??
        String(defaultPlaywrightTimeoutMs),
    ),
  })

  if (!dryRun) {
    process.stdout.write(`Demo video smoke passed: ${plan.outputPath}\n`)
  }
}

main().catch(error => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  )
  process.exit(1)
})
