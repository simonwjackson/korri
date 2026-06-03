import { type ChildProcess, spawn, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs"
import path from "node:path"
import { globSync } from "fast-glob"
import {
  demoVideoArtifactPath,
  generatedArtifactPaths,
} from "../artifacts/paths"
import { BDD_FOLDER_CONVENTION } from "../testing/bdd/architecture"
import { parseFeatureFile } from "../testing/bdd/parser"
import { createNarrationAudio } from "./narration-audio"

const repoRoot = path.resolve(import.meta.dir, "../..")
const demosDir = generatedArtifactPaths.bddArgo
const argoConfigPath = "argo.config.mjs"
const argoPlaywrightConfigPath = "tools/demo-video/playwright.argo.config.ts"

export type DemoVideoRunOptions = {
  demoName: string
  webPort?: number
  apiPort?: number
  host?: string
  useExistingStack?: boolean
  baseUrl?: string
  dryRun?: boolean
  playwrightTimeoutMs?: number
}

export type DemoVideoCommandPhase = {
  name: "stack" | "readiness" | "tts" | "record" | "audio" | "export"
  command?: string
  args?: ReadonlyArray<string>
  env?: Record<string, string>
  description: string
}

export type DemoVideoRunPlan = {
  demoName: string
  baseUrl: string
  workDir: string
  scriptPath: string
  manifestPath: string
  outputPath: string
  stackEnv: Record<string, string>
  argoEnv: Record<string, string>
  phases: ReadonlyArray<DemoVideoCommandPhase>
}

export type DemoVideoPrerequisite = {
  name: "ffmpeg" | "ffprobe"
  ok: boolean
  message: string
}

export const demoVideoDefaults = {
  webPort: 3100,
  apiPort: 3101,
  host: "localhost",
  playwrightTimeoutMs: 900_000,
} as const

export function checkDemoVideoPrerequisites(): DemoVideoPrerequisite[] {
  return [
    checkCommandPrerequisite("ffmpeg", ["-version"]),
    checkCommandPrerequisite("ffprobe", ["-version"]),
  ]
}

export function failedDemoVideoPrerequisites(
  prerequisites: ReadonlyArray<DemoVideoPrerequisite>,
): DemoVideoPrerequisite[] {
  return prerequisites.filter(prerequisite => !prerequisite.ok)
}

export function formatDemoVideoPrerequisiteFailures(
  failed: ReadonlyArray<DemoVideoPrerequisite>,
): string {
  return failed
    .map(prerequisite => `- ${prerequisite.name}: ${prerequisite.message}`)
    .join("\n")
}

export function listDemoVideoNames(): string[] {
  const absoluteDemosDir = path.join(repoRoot, demosDir)
  const generatedDemoNames = existsSync(absoluteDemosDir)
    ? readdirSync(absoluteDemosDir)
        .filter(fileName => fileName.endsWith(".scenes.json"))
        .map(fileName => fileName.replace(/\.scenes\.json$/, ""))
    : []

  return uniqueStrings([...generatedDemoNames, ...listAuthoredBddDemoNames()])
}

function listAuthoredBddDemoNames(): string[] {
  return uniqueStrings(
    globSync(BDD_FOLDER_CONVENTION.featureGlob, { cwd: repoRoot })
      .flatMap(
        featurePath =>
          parseFeatureFile(path.join(repoRoot, featurePath)).scenarios,
      )
      .flatMap(scenario =>
        scenario.tags
          .map(tag => tag.match(/^@demo\(([^)]+)\)$/i)?.[1])
          .filter((demoName): demoName is string => Boolean(demoName)),
      ),
  )
}

function uniqueStrings(values: ReadonlyArray<string>): string[] {
  return Array.from(new Set(values)).sort()
}

export function isSafeLocalDemoBaseUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }

  if (url.protocol !== "http:") return false

  const hostname = url.hostname.toLowerCase()
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "[::1]" ||
    hostname.endsWith(".local") ||
    !hostname.includes(".")
  )
}

export function createDemoVideoRunPlan(
  options: DemoVideoRunOptions,
): DemoVideoRunPlan {
  const demoName = validateDemoName(options.demoName)
  const scriptPath = `${demosDir}/${demoName}.demo.ts`
  const manifestPath = `${demosDir}/${demoName}.scenes.json`
  const absoluteManifestPath = path.join(repoRoot, manifestPath)
  if (!existsSync(absoluteManifestPath)) {
    const available = listDemoVideoNames()
    if (available.includes(demoName)) {
      throw new Error(
        `Demo "${demoName}" has not been generated at ${manifestPath}. Run 'just generate-bdd' to regenerate BDD demo adapters.`,
      )
    }
    throw new Error(
      `Unknown demo "${demoName}". Available demos: ${available.join(", ") || "none"}`,
    )
  }
  assertDemoVideoArtifactsReady({ demoName, scriptPath, manifestPath })

  const host = options.host ?? demoVideoDefaults.host
  const webPort = options.webPort ?? demoVideoDefaults.webPort
  const baseUrl = options.baseUrl ?? `http://${host}:${webPort}`
  if (!isSafeLocalDemoBaseUrl(baseUrl)) {
    throw new Error(
      `Refusing to record non-local demo URL: ${baseUrl}. Demo videos must use a local/dev app URL.`,
    )
  }

  const apiPort = options.apiPort ?? demoVideoDefaults.apiPort
  const playwrightTimeoutMs =
    options.playwrightTimeoutMs ?? demoVideoDefaults.playwrightTimeoutMs
  const workDir = `.argo/${demoName}`
  const outputPath = `${demoVideoArtifactPath}/${demoName}.mp4`

  const stackEnv = {
    PORTAL_PORT: String(webPort),
    API_PORT: String(apiPort),
    APP_HOST: host,
    KORRI_API_PROXY_TARGET: `http://${host}:${apiPort}`,
  }

  const argoEnv = {
    ...stackEnv,
    ARGO_BASE_URL: baseUrl,
    PLAYWRIGHT_TEST_BASE_URL: baseUrl,
    ARGO_DEMO_NAME: demoName,
    ARGO_OUTPUT_DIR: path.resolve(repoRoot, workDir),
    ARGO_PROGRESS_PATH: path.resolve(
      repoRoot,
      workDir,
      ".scene-progress.jsonl",
    ),
    ARGO_SCREENCAST_PATH: path.resolve(repoRoot, workDir, "video.webm"),
    ARGO_SCREENCAST_WIDTH: "1920",
    ARGO_SCREENCAST_HEIGHT: "1080",
    ARGO_SCENE_THUMBS: "1",
    ARGO_THUMBS_DIR: path.resolve(repoRoot, workDir, "thumbs"),
    ARGO_LIVE_FRAME_PATH: path.resolve(repoRoot, workDir, ".live-frame.jpg"),
    ARGO_FPS: "30",
    ARGO_OVERLAYS_PATH: path.resolve(repoRoot, manifestPath),
    ARGO_AUTO_BACKGROUND: "1",
    ARGO_DEFAULT_PLACEMENT: "bottom-center",
    ARGO_PLAYWRIGHT_TIMEOUT_MS: String(playwrightTimeoutMs),
  }

  return {
    demoName,
    baseUrl,
    workDir,
    scriptPath,
    manifestPath,
    outputPath,
    stackEnv,
    argoEnv,
    phases: [
      ...(options.useExistingStack
        ? []
        : [
            {
              name: "stack" as const,
              command: "bun",
              args: [
                "run",
                "vite",
                "--mode",
                "development",
                "--host",
                host,
                "--port",
                String(webPort),
                "--clearScreen",
                "false",
              ],
              env: stackEnv,
              description:
                "Start the Vite portal (a sibling Hono API process is started in parallel)",
            },
          ]),
      {
        name: "readiness",
        description: "Wait for portal readiness",
      },
      {
        name: "tts",
        command: "bunx",
        args: ["argo", "tts", "generate", manifestPath],
        description: "Generate local Argo TTS clips",
      },
      {
        name: "record",
        command: "bunx",
        args: [
          "playwright",
          "test",
          "--config",
          argoPlaywrightConfigPath,
          "--project",
          "argo-demo",
          "--grep",
          demoName,
          "--workers",
          "1",
        ],
        description: "Record the demo with repo-owned Playwright settings",
      },
      {
        name: "audio",
        description: "Align generated local TTS clips with recording timing",
      },
      {
        name: "export",
        command: "bunx",
        args: ["argo", "--config", argoConfigPath, "export", demoName],
        description: "Export the narrated video artifact",
      },
    ],
  }
}

export async function runDemoVideo(
  options: DemoVideoRunOptions,
): Promise<DemoVideoRunPlan> {
  validateDemoName(options.demoName)

  if (!options.dryRun) {
    await regenerateBddArtifacts()
  }

  const plan = createDemoVideoRunPlan(options)

  if (options.dryRun) {
    printDryRun(plan)
    return plan
  }

  const failedPrerequisites = failedDemoVideoPrerequisites(
    checkDemoVideoPrerequisites(),
  )
  if (failedPrerequisites.length > 0) {
    throw new Error(
      `Demo video prerequisites failed:\n${formatDemoVideoPrerequisiteFailures(failedPrerequisites)}`,
    )
  }

  prepareArgoWorkDir(plan)

  let portalProcess: ChildProcess | undefined
  let apiProcess: ChildProcess | undefined
  try {
    if (!options.useExistingStack) {
      portalProcess = spawnPhase(
        "bun",
        [
          "run",
          "vite",
          "--mode",
          "development",
          "--host",
          options.host ?? demoVideoDefaults.host,
          "--port",
          String(options.webPort ?? demoVideoDefaults.webPort),
          "--clearScreen",
          "false",
        ],
        plan.stackEnv,
      )
      apiProcess = spawnPhase(
        "bun",
        [
          "x",
          "tsx",
          "--tsconfig",
          "tsconfig.server.json",
          "product/services/server/http/server.ts",
        ],
        {
          ...plan.stackEnv,
          PORT: String(options.apiPort ?? demoVideoDefaults.apiPort),
          NODE_ENV: "development",
        },
      )
    }

    await waitForStackReadiness(plan.baseUrl, [portalProcess, apiProcess])
    await runPhaseCommand(
      "bunx",
      ["argo", "tts", "generate", plan.manifestPath],
      {
        ARGO_BASE_URL: plan.baseUrl,
      },
    )
    await runPhaseCommand(
      "bunx",
      [
        "playwright",
        "test",
        "--config",
        argoPlaywrightConfigPath,
        "--project",
        "argo-demo",
        "--grep",
        plan.demoName,
        "--workers",
        "1",
      ],
      plan.argoEnv,
    )
    createNarrationAudio({
      demoName: plan.demoName,
      manifestPath: plan.manifestPath,
      workDir: plan.workDir,
    })
    await runPhaseCommand(
      "bunx",
      ["argo", "--config", argoConfigPath, "export", plan.demoName],
      { ARGO_BASE_URL: plan.baseUrl },
    )

    assertOutputExists(plan.outputPath)
    return plan
  } finally {
    if (apiProcess) await stopProcess(apiProcess)
    if (portalProcess) await stopProcess(portalProcess)
  }
}

export function assertDemoVideoArtifactsReady(options: {
  demoName: string
  scriptPath: string
  manifestPath: string
}): void {
  const absoluteScriptPath = resolveRepoPath(options.scriptPath)
  if (!existsSync(absoluteScriptPath)) {
    throw new Error(
      `Demo "${options.demoName}" is missing ${options.scriptPath}. Run 'just generate-bdd' to regenerate BDD demo adapters.`,
    )
  }

  const absoluteManifestPath = resolveRepoPath(options.manifestPath)
  if (!existsSync(absoluteManifestPath)) {
    throw new Error(
      `Demo "${options.demoName}" is missing ${options.manifestPath}. Run 'just generate-bdd' to regenerate BDD demo adapters.`,
    )
  }
}

function resolveRepoPath(value: string): string {
  return path.isAbsolute(value) ? value : path.join(repoRoot, value)
}

async function regenerateBddArtifacts(): Promise<void> {
  await runPhaseCommand("bun", [
    "run",
    "tools/scripts/generate-bdd-playwright-tests.ts",
  ])
}

function checkCommandPrerequisite(
  name: DemoVideoPrerequisite["name"],
  args: ReadonlyArray<string>,
): DemoVideoPrerequisite {
  const result = spawnSync(name, [...args], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe",
  })

  if (result.status === 0) {
    const firstLine = (result.stdout || result.stderr).split("\n")[0] ?? "ok"
    return { name, ok: true, message: firstLine }
  }

  return {
    name,
    ok: false,
    message:
      result.error?.message ??
      `${name} not found. Enter the Nix dev shell (nix develop) or install ${name} locally.`,
  }
}

function validateDemoName(name: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name)) {
    throw new Error(
      `Invalid demo name "${name}": only letters, numbers, hyphens, and underscores are allowed.`,
    )
  }
  return name
}

function printDryRun(plan: DemoVideoRunPlan): void {
  process.stdout.write(`Demo video: ${plan.demoName}\n`)
  process.stdout.write(`Base URL: ${plan.baseUrl}\n`)
  process.stdout.write(`Generated script: ${plan.scriptPath}\n`)
  process.stdout.write(`Refresh generated demos: just generate-bdd\n`)
  process.stdout.write(`Output: ${plan.outputPath}\n`)
  for (const phase of plan.phases) {
    const command = phase.command
      ? ` — ${[phase.command, ...(phase.args ?? [])].join(" ")}`
      : ""
    process.stdout.write(`- ${phase.name}: ${phase.description}${command}\n`)
  }
}

function prepareArgoWorkDir(plan: DemoVideoRunPlan): void {
  const absoluteWorkDir = path.join(repoRoot, plan.workDir)
  mkdirSync(path.join(absoluteWorkDir, "thumbs"), { recursive: true })
  for (const fileName of [
    "video.webm",
    ".timing.json",
    ".scene-progress.jsonl",
    ".live-frame.jpg",
  ]) {
    rmSync(path.join(absoluteWorkDir, fileName), { force: true })
  }
}

function spawnPhase(
  command: string,
  args: ReadonlyArray<string>,
  env: Record<string, string>,
): ChildProcess {
  return spawn(command, [...args], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdio: "inherit",
  })
}

async function runPhaseCommand(
  command: string,
  args: ReadonlyArray<string>,
  env: Record<string, string> = {},
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd: repoRoot,
      env: { ...process.env, ...env },
      stdio: "inherit",
    })

    child.on("error", reject)
    child.on("close", code => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${command} exited with code ${code ?? "unknown"}`))
    })
  })
}

async function waitForStackReadiness(
  baseUrl: string,
  processes: ReadonlyArray<ChildProcess | undefined>,
): Promise<void> {
  const timeoutMs = 180_000
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    for (const proc of processes) {
      if (proc?.exitCode !== null && proc?.exitCode !== undefined) {
        throw new Error(
          `Local stack process exited before it became ready with code ${proc.exitCode}`,
        )
      }
    }

    if (await urlResponds(baseUrl)) return

    await new Promise(resolve => setTimeout(resolve, 1_000))
  }

  throw new Error(`Timed out waiting for demo stack readiness at ${baseUrl}`)
}

async function urlResponds(value: string): Promise<boolean> {
  try {
    const response = await fetch(value, { redirect: "manual" })
    return response.status >= 200 && response.status < 500
  } catch {
    return false
  }
}

async function stopProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return

  child.kill("SIGTERM")
  await new Promise<void>(resolve => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL")
      resolve()
    }, 10_000)

    child.once("close", () => {
      clearTimeout(timeout)
      resolve()
    })
  })
}

function assertOutputExists(outputPath: string): void {
  const absoluteOutputPath = path.join(repoRoot, outputPath)
  if (!existsSync(absoluteOutputPath)) {
    throw new Error(`Expected Argo output was not created: ${outputPath}`)
  }

  const stats = statSync(absoluteOutputPath)
  if (stats.size <= 0) {
    throw new Error(`Expected Argo output was empty: ${outputPath}`)
  }
}
