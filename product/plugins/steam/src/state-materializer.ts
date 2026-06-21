import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import type { Stats } from "node:fs"
import {
  mkdir,
  readdir,
  readFile,
  rename,
  stat,
  writeFile,
} from "node:fs/promises"
import { dirname, join } from "node:path"
import type { LaunchSpec } from "@platform/library/launcher"
import { Data, Effect } from "effect"
import {
  type InvalidSteamLaunchOptions,
  type InvalidSteamTarget,
  parseSteamAppId,
  renderSteamLaunchSpec,
  validateSteamLaunchOptions,
} from "./launch-spec"
import {
  applySteamGateSeeds,
  setVdfPath,
  type VdfObject,
} from "./steam-gate-seed"

export class SteamStateMutationFailed extends Data.TaggedError(
  "SteamStateMutationFailed",
)<{
  readonly path: string
  readonly reason: string
}> {}

export class SteamRuntimeToolMissing extends Data.TaggedError(
  "SteamRuntimeToolMissing",
)<{
  readonly runtimeId: string
}> {}

export class SteamCompatToolMissing extends Data.TaggedError(
  "SteamCompatToolMissing",
)<{
  readonly stateRoot: string
  readonly tool: string
}> {}

export class SteamReadinessTimeout extends Data.TaggedError(
  "SteamReadinessTimeout",
)<{
  readonly stateRoot: string
}> {}

type SteamStateError =
  | InvalidSteamLaunchOptions
  | InvalidSteamTarget
  | SteamStateMutationFailed
  | SteamRuntimeToolMissing
  | SteamCompatToolMissing
  | SteamReadinessTimeout

export interface SteamRuntimeSelection {
  readonly id: string
  readonly path: string
  readonly tool?: string
}

export interface SteamDesiredState {
  readonly stateRoot: string
  readonly command?: string
  readonly target: string
  readonly launchOptions?: string
  readonly runtime?: SteamRuntimeSelection
  readonly defaultCompatTool?: string
  readonly compatToolOverrides?: Readonly<Record<string, string>>
  readonly suppressInterstitials?: boolean
  readonly acceptEulas?: boolean
  readonly extraArgs?: readonly string[]
}

export interface SteamLifecycle {
  readonly shutdown: (input: {
    readonly command: string
    readonly stateRoot: string
  }) => Promise<void>
  readonly waitForShutdown: (input: {
    readonly stateRoot: string
  }) => Promise<void>
  readonly start: (input: {
    readonly command: string
    readonly stateRoot: string
    readonly args: readonly string[]
  }) => Promise<void>
  readonly waitUntilReady: (input: {
    readonly stateRoot: string
  }) => Promise<void>
}

export interface SteamStateFileSystem {
  readonly readText: (path: string) => Promise<string | undefined>
  readonly writeTextAtomic: (path: string, content: string) => Promise<void>
  readonly mkdirp: (path: string) => Promise<void>
  readonly listDirectories?: (path: string) => Promise<readonly string[]>
  readonly pathExists?: (path: string) => Promise<boolean>
  readonly isExecutableFile?: (path: string) => Promise<boolean>
}

export interface SteamStateLock {
  readonly withLock: <A>(key: string, run: () => Promise<A>) => Promise<A>
}

export interface MaterializeSteamDesiredStateOptions {
  readonly desired: SteamDesiredState
  readonly fs?: SteamStateFileSystem
  readonly lifecycle?: SteamLifecycle
  readonly lock?: SteamStateLock
}

export interface MaterializedSteamDesiredState {
  readonly spec: LaunchSpec
  readonly paths: {
    readonly localconfig: string
    readonly config: string
  }
}

const inMemoryLocks = new Map<string, Promise<unknown>>()

export const defaultSteamStateLock: SteamStateLock = {
  withLock: async (key, run) => {
    const previous = inMemoryLocks.get(key) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>(resolve => {
      release = resolve
    })
    const queued = previous.then(() => current)
    inMemoryLocks.set(key, queued)
    await previous
    try {
      return await run()
    } finally {
      release()
      if (inMemoryLocks.get(key) === queued) inMemoryLocks.delete(key)
    }
  },
}

export const nodeSteamStateFileSystem: SteamStateFileSystem = {
  readText: async path => {
    try {
      return await readFile(path, "utf8")
    } catch (error) {
      if (isNodeErrorCode(error, "ENOENT")) return undefined
      throw error
    }
  },
  writeTextAtomic: async (path, content) => {
    await mkdir(dirname(path), { recursive: true, mode: 0o750 })
    const tmp = `${path}.${randomUUID()}.tmp`
    await writeFile(tmp, content, { mode: 0o640 })
    await rename(tmp, path)
  },
  mkdirp: async path => {
    await mkdir(path, { recursive: true, mode: 0o750 })
  },
  listDirectories: async path => {
    try {
      const entries = await readdir(path, { withFileTypes: true })
      return entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .sort()
    } catch (error) {
      if (isNodeErrorCode(error, "ENOENT")) return []
      throw error
    }
  },
  pathExists: async path => {
    try {
      await stat(path)
      return true
    } catch (error) {
      if (isNodeErrorCode(error, "ENOENT")) return false
      throw error
    }
  },
  isExecutableFile: async path => {
    try {
      const entry = await stat(path)
      return isExecutableRegularFile(entry)
    } catch (error) {
      if (isNodeErrorCode(error, "ENOENT")) return false
      throw error
    }
  },
}

function isExecutableRegularFile(entry: Stats): boolean {
  return entry.isFile() && (entry.mode & 0o111) !== 0
}

async function runBestEffort(
  command: string,
  args: readonly string[],
): Promise<void> {
  await runCommand(command, args).catch(() => {})
}

async function managedSteamServiceActive(): Promise<boolean> {
  const code = await commandExitCode("timeout", [
    "5",
    "systemctl",
    "is-active",
    "--quiet",
    "korri-steam-gamescope.service",
  ]).catch(error => {
    if (isNodeErrorCode(error, "ENOENT")) return 3
    throw error
  })
  if (code === 0) return true
  if (code === 3 || code === 4) return false
  throw new Error(`systemctl status probe exited ${code}`)
}

async function stateRootProcessRunning(stateRoot: string): Promise<boolean> {
  const code = await commandExitCode("timeout", [
    "5",
    "pgrep",
    "-f",
    stateRoot,
  ]).catch(error => {
    if (isNodeErrorCode(error, "ENOENT")) return 1
    throw error
  })
  if (code === 0) return true
  if (code === 1) return false
  throw new Error(`pgrep status probe exited ${code}`)
}

function runCommand(command: string, args: readonly string[]): Promise<void> {
  return commandExitCode(command, args).then(code => {
    if (code !== 0) throw new Error(`${command} exited ${code}`)
  })
}

function commandExitCode(
  command: string,
  args: readonly string[],
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { stdio: "ignore" })
    child.on("error", reject)
    child.on("exit", code => resolve(code ?? 1))
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isManagedKorriStateRoot(stateRoot: string): boolean {
  return (
    stateRoot === "/var/lib/korri/steam" ||
    stateRoot.startsWith("/var/lib/korri/steam/")
  )
}

export const noopSteamLifecycle: SteamLifecycle = {
  shutdown: async () => {},
  waitForShutdown: async () => {},
  start: async () => {},
  waitUntilReady: async () => {},
}

export const nodeSteamLifecycle: SteamLifecycle = {
  shutdown: async input => {
    await runBestEffort("/run/wrappers/bin/sudo", [
      "-n",
      "/run/current-system/sw/bin/korri-steam-service-control",
      "stop",
    ])
    await runBestEffort(
      "/run/current-system/sw/bin/korri-steam-service-control",
      ["stop"],
    )
    if (isManagedKorriStateRoot(input.stateRoot)) {
      await runBestEffort("pkill", ["-TERM", "-f", input.stateRoot])
    }
  },
  waitForShutdown: async input => {
    const deadline = Date.now() + 15_000
    while (Date.now() <= deadline) {
      const serviceActive = await managedSteamServiceActive()
      const stateProcessesRunning = isManagedKorriStateRoot(input.stateRoot)
        ? await stateRootProcessRunning(input.stateRoot)
        : false
      if (!serviceActive && !stateProcessesRunning) return
      await sleep(500)
    }
    throw new SteamStateMutationFailed({
      path: input.stateRoot,
      reason: "timed out waiting for Steam shutdown before VDF write",
    })
  },
  // AppID launches are subsequently forwarded through korri-steam-app, whose
  // shell wrapper owns starting and warming gamescoped Steam Big Picture.
  start: async () => {},
  waitUntilReady: async () => {},
}

export const materializeSteamDesiredState = (
  options: MaterializeSteamDesiredStateOptions,
): Effect.Effect<MaterializedSteamDesiredState, SteamStateError> =>
  Effect.gen(function* () {
    const materialized = yield* Effect.tryPromise({
      try: () => materializeSteamDesiredStatePromise(options),
      catch: error => toSteamStateError(options.desired.stateRoot, error),
    })
    const spec = yield* renderSteamLaunchSpec({
      command: options.desired.command ?? "steam",
      target: options.desired.target,
    })
    return { ...materialized, spec }
  })

async function materializeSteamDesiredStatePromise(
  options: MaterializeSteamDesiredStateOptions,
): Promise<Omit<MaterializedSteamDesiredState, "spec">> {
  const desired = options.desired
  const command = desired.command ?? "steam"
  const parsedAppId = parseSteamAppId(desired.target)
  if (parsedAppId._tag === "Left") throw parsedAppId.left
  const steamAppId = parsedAppId.right
  if (desired.launchOptions !== undefined) {
    const validated = validateSteamLaunchOptions(desired.launchOptions)
    if (validated._tag === "Left") throw validated.left
  }
  if (desired.runtime !== undefined && !desired.runtime.tool) {
    throw new SteamRuntimeToolMissing({ runtimeId: desired.runtime.id })
  }

  const fs = options.fs ?? nodeSteamStateFileSystem
  const lifecycle = options.lifecycle ?? nodeSteamLifecycle
  const lock = options.lock ?? defaultSteamStateLock
  const configPath = steamConfigPath(desired.stateRoot)

  await lock.withLock(desired.stateRoot, async () => {
    const localconfigPaths = await discoverSteamLocalConfigPaths(
      fs,
      desired.stateRoot,
    )
    const launchOptionsPath =
      localconfigPaths[0] ?? steamLocalConfigPath(desired.stateRoot)
    const appIdsForEula = uniqueStrings([
      steamAppId,
      ...Object.keys(desired.compatToolOverrides ?? {}),
    ])
    const toolsToValidate = uniqueStrings([
      desired.defaultCompatTool,
      ...Object.values(desired.compatToolOverrides ?? {}),
    ])

    for (const tool of toolsToValidate) {
      await assertCompatToolExists(fs, desired.stateRoot, tool)
    }

    const buildWrites = async (): Promise<
      Array<{ path: string; content: string }>
    > => {
      const writes: Array<{ path: string; content: string }> = []

      if (
        desired.launchOptions !== undefined ||
        desired.suppressInterstitials === true ||
        desired.acceptEulas === true
      ) {
        for (const localconfigPath of localconfigPaths.length > 0
          ? localconfigPaths
          : [launchOptionsPath]) {
          const localconfig = parseVdfOrEmpty(
            await fs.readText(localconfigPath),
            localconfigPath,
          )
          const before = stableVdfSnapshot(localconfig)
          if (
            desired.launchOptions !== undefined &&
            localconfigPath === launchOptionsPath
          ) {
            setVdfPath(
              localconfig,
              [
                "UserLocalConfigStore",
                "Software",
                "Valve",
                "Steam",
                "apps",
                steamAppId,
                "LaunchOptions",
              ],
              desired.launchOptions,
            )
          }
          applySteamGateSeeds(localconfig, {
            suppressInterstitials: desired.suppressInterstitials,
            acceptEulas: desired.acceptEulas,
            appIds: appIdsForEula,
          })
          if (stableVdfSnapshot(localconfig) !== before) {
            writes.push({
              path: localconfigPath,
              content: renderVdf(localconfig),
            })
          }
        }
      }

      if (
        desired.defaultCompatTool !== undefined ||
        Object.keys(desired.compatToolOverrides ?? {}).length > 0
      ) {
        const config = parseVdfOrEmpty(
          await fs.readText(configPath),
          configPath,
        )
        const before = stableVdfSnapshot(config)
        const compatToolMappingState: VdfObject = {}
        if (desired.defaultCompatTool !== undefined) {
          compatToolMappingState["0"] = compatToolMapping(
            desired.defaultCompatTool,
          )
        }
        for (const [appId, tool] of Object.entries(
          desired.compatToolOverrides ?? {},
        )) {
          compatToolMappingState[appId] = compatToolMapping(tool)
        }
        setVdfPath(
          config,
          [
            "InstallConfigStore",
            "Software",
            "Valve",
            "Steam",
            "CompatToolMapping",
          ],
          compatToolMappingState,
        )
        if (stableVdfSnapshot(config) !== before) {
          writes.push({ path: configPath, content: renderVdf(config) })
        }
      }

      return writes
    }

    let writes = await buildWrites()
    if (writes.length === 0) return

    await lifecycle.shutdown({ command, stateRoot: desired.stateRoot })
    await lifecycle.waitForShutdown({ stateRoot: desired.stateRoot })

    writes = await buildWrites()
    for (const write of writes) {
      await fs.mkdirp(dirname(write.path))
      await fs.writeTextAtomic(write.path, write.content)
    }

    await lifecycle.start({
      command,
      stateRoot: desired.stateRoot,
      args: desired.extraArgs ?? [],
    })
    await lifecycle.waitUntilReady({ stateRoot: desired.stateRoot })
  })

  return {
    paths: {
      localconfig: steamLocalConfigPath(desired.stateRoot),
      config: configPath,
    },
  }
}

async function discoverSteamLocalConfigPaths(
  fs: SteamStateFileSystem,
  stateRoot: string,
): Promise<readonly string[]> {
  const userdataPath = join(stateRoot, "userdata")
  const accountIds = fs.listDirectories
    ? await fs.listDirectories(userdataPath)
    : ["0"]
  const paths = accountIds.map(accountId =>
    join(userdataPath, accountId, "config", "localconfig.vdf"),
  )
  return paths.length > 0 ? paths : [steamLocalConfigPath(stateRoot)]
}

async function assertCompatToolExists(
  fs: SteamStateFileSystem,
  stateRoot: string,
  tool: string | undefined,
): Promise<void> {
  if (tool === undefined) return
  const path = join(stateRoot, "compatibilitytools.d", tool)
  const exists = fs.pathExists ? await fs.pathExists(path) : true
  if (!exists) throw new SteamCompatToolMissing({ stateRoot, tool })
  const protonPath = join(path, "proton")
  const hasExecutableProton = fs.isExecutableFile
    ? await fs.isExecutableFile(protonPath)
    : fs.pathExists
      ? await fs.pathExists(protonPath)
      : true
  if (!hasExecutableProton)
    throw new SteamCompatToolMissing({ stateRoot, tool })
  const manifest = await fs.readText(join(path, "toolmanifest.vdf"))
  if (manifest === undefined || manifest.includes("require_tool_appid")) {
    throw new SteamCompatToolMissing({ stateRoot, tool })
  }
}

function stableVdfSnapshot(value: VdfObject): string {
  return JSON.stringify(value)
}

function compatToolMapping(tool: string): VdfObject {
  return { name: tool, config: "", priority: "250" }
}

function uniqueStrings(
  values: readonly (string | undefined)[],
): readonly string[] {
  return [
    ...new Set(values.filter((value): value is string => value !== undefined)),
  ]
}

export const steamLocalConfigPath = (stateRoot: string): string =>
  join(stateRoot, "userdata", "0", "config", "localconfig.vdf")

export const steamConfigPath = (stateRoot: string): string =>
  join(stateRoot, "config", "config.vdf")

function parseVdfOrEmpty(content: string | undefined, path: string): VdfObject {
  if (content === undefined || content.trim() === "") return {}
  try {
    return parseVdf(content)
  } catch (error) {
    throw new SteamStateMutationFailed({
      path,
      reason: error instanceof Error ? error.message : String(error),
    })
  }
}

export function parseVdf(content: string): VdfObject {
  const tokens = tokenizeVdf(content)
  let index = 0

  const parseObject = (untilBrace: boolean): VdfObject => {
    const object: VdfObject = {}
    while (index < tokens.length) {
      const key = tokens[index++]
      if (key === "}") {
        if (untilBrace) return object
        throw new Error("unexpected closing brace")
      }
      if (key === "{") throw new Error("unexpected opening brace")
      const value = tokens[index++]
      if (value === undefined) throw new Error(`missing value for ${key}`)
      if (value === "{") {
        object[key] = parseObject(true)
      } else if (value === "}") {
        throw new Error(`missing value for ${key}`)
      } else {
        object[key] = value
      }
    }
    if (untilBrace) throw new Error("missing closing brace")
    return object
  }

  return parseObject(false)
}

export function renderVdf(object: VdfObject): string {
  return renderVdfObject(object, 0)
}

function tokenizeVdf(content: string): string[] {
  const tokens: string[] = []
  let index = 0
  while (index < content.length) {
    const char = content[index]
    if (/\s/.test(char)) {
      index += 1
      continue
    }
    if (char === "/" && content[index + 1] === "/") {
      while (index < content.length && content[index] !== "\n") index += 1
      continue
    }
    if (char === "{" || char === "}") {
      tokens.push(char)
      index += 1
      continue
    }
    if (char !== '"') throw new Error(`unexpected token at ${index}`)
    index += 1
    let value = ""
    let closed = false
    while (index < content.length) {
      const next = content[index]
      if (next === "\\") {
        value += content[index + 1] ?? ""
        index += 2
        continue
      }
      if (next === '"') {
        index += 1
        tokens.push(value)
        closed = true
        break
      }
      value += next
      index += 1
    }
    if (!closed) throw new Error("unterminated string")
  }
  return tokens
}

function renderVdfObject(object: VdfObject, indent: number): string {
  const pad = "\t".repeat(indent)
  let output = ""
  for (const [key, value] of Object.entries(object)) {
    if (typeof value === "string") {
      output += `${pad}"${escapeVdf(key)}"\t\t"${escapeVdf(value)}"\n`
    } else {
      output += `${pad}"${escapeVdf(key)}"\n${pad}{\n${renderVdfObject(
        value,
        indent + 1,
      )}${pad}}\n`
    }
  }
  return output
}

function escapeVdf(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

function toSteamStateError(stateRoot: string, error: unknown): SteamStateError {
  if (isTaggedSteamStateError(error)) return error
  return new SteamStateMutationFailed({
    path: stateRoot,
    reason: error instanceof Error ? error.message : String(error),
  })
}

function isTaggedSteamStateError(error: unknown): error is SteamStateError {
  return (
    typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    [
      "InvalidSteamLaunchOptions",
      "InvalidSteamTarget",
      "SteamStateMutationFailed",
      "SteamRuntimeToolMissing",
      "SteamCompatToolMissing",
      "SteamReadinessTimeout",
    ].includes(String(error._tag))
  )
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === code
  )
}
