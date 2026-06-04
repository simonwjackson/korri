/**
 * `Launcher` implementation backed by `Bun.spawn`.
 *
 * The interface contract is "run this `LaunchSpec` and tell me what
 * happened". The shell launcher delivers it by spawning `[command, ...args]`
 * directly (no shell, no string concatenation), awaiting `proc.exited`, and
 * returning a discriminated `LaunchResult`.
 *
 * Long-running-process posture (per plan Unit 4): block until the child
 * exits. Real `runemu.sh` typically holds until the game ends, which means
 * the renderer's RPC connection stays open across gameplay. This is the
 * simplest shape that gives an accurate exit-code reading; if smoke testing
 * shows the connection drops when the OS suspends Korri during gameplay,
 * the fallback is to switch to a fire-and-forget start + status-poll RPC
 * pair.
 *
 * Security: we hand `Bun.spawn` an array (`[command, ...args]`), not a
 * single shell string. A `<path>` value containing spaces or shell
 * metacharacters is just an argv element; no shell ever sees it.
 *
 * See docs/plans/2026-05-02-001-feat-personal-mvp-rocknix-launch-plan.md (Unit 4).
 */

import { logger } from "@platform/logger/logger"

import type {
  Launcher,
  LaunchResult,
  LaunchSpec,
  ManagedLaunchResult,
} from "./launcher"

const STDERR_TAIL_BYTES = 4 * 1024
const DEFAULT_SETSID_COMMAND = "setsid"

export interface ShellLauncherOptions {
  /**
   * When true, wrap every managed spawn with `setsid -- <command>` so the
   * child becomes its own session/process-group leader. Terminate paths
   * then signal the process group (`kill -- -pgid <sig>`), reaching
   * grandchildren that escape the direct kill of the parent.
   *
   * Default false to preserve byte-for-byte compatibility for callers
   * that did not opt in.
   */
  readonly processGroup?: boolean
  /** Override the setsid binary path. Default `"setsid"`. */
  readonly setsidCommand?: string
}

export function createShellLauncher(
  options: ShellLauncherOptions = {},
): Launcher {
  return {
    async run(spec: LaunchSpec): Promise<LaunchResult> {
      const managed = await spawnShellLaunch(spec, options)
      if (managed.status === "failed") return managed.result
      return await managed.result
    },
    spawn: spec => spawnShellLaunch(spec, options),
  }
}

async function spawnShellLaunch(
  spec: LaunchSpec,
  options: ShellLauncherOptions = {},
): Promise<ManagedLaunchResult> {
  const useProcessGroup = options.processGroup === true
  const setsidCommand = options.setsidCommand ?? DEFAULT_SETSID_COMMAND
  const argv = useProcessGroup
    ? ([setsidCommand, "--", spec.command, ...spec.args] as const)
    : ([spec.command, ...spec.args] as const)

  logger.info(
    { command: spec.command, argc: spec.args.length },
    "shell-launcher: spawning",
  )

  const env = spec.env ? { ...process.env, ...spec.env } : { ...process.env }

  // Bun.spawn throws synchronously when posix_spawn fails (e.g. ENOENT
  // for the binary itself). The launcher contract is that we never
  // throw — every outcome is a `LaunchResult`. Translate the throw
  // into a `failed` result so callers always get a structured answer.
  let proc: ReturnType<typeof Bun.spawn>
  try {
    proc = Bun.spawn(argv as unknown as string[], {
      env: env as Record<string, string>,
      cwd: spec.cwd,
      stderr: "pipe",
      stdout: "ignore",
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const code =
      error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined
    logger.warn(
      { command: spec.command, code, message },
      "shell-launcher: spawn failed",
    )
    // Conventional Unix "command not found" exit code, used here for
    // any pre-exec failure (the actual exit never happened).
    return {
      status: "failed",
      result: { status: "failed", exitCode: 127, stderrTail: message },
    }
  }

  // Read stderr concurrently with awaiting exit so the pipe never blocks
  // the child. We only keep the tail. proc.stderr is typed as a union
  // (number | ReadableStream | undefined) because Bun's Subprocess type
  // depends on the spawn options; we asked for `stderr: "pipe"`, so it
  // is a stream at runtime. Narrow defensively.
  const stderrStream =
    typeof proc.stderr === "object" && proc.stderr !== null
      ? (proc.stderr as ReadableStream<Uint8Array>)
      : null
  const stderrPromise = readTail(stderrStream, STDERR_TAIL_BYTES)
  const exited = proc.exited.then(exitCode => ({ exitCode }))
  const result = Promise.all([proc.exited, stderrPromise]).then(
    ([exitCode, stderrTail]): LaunchResult => {
      if (exitCode === 0) {
        logger.info(
          { command: spec.command, exitCode: 0 },
          "shell-launcher: launched",
        )
        return { status: "launched" }
      }

      logger.warn({ command: spec.command, exitCode }, "shell-launcher: failed")

      return stderrTail
        ? { status: "failed", exitCode, stderrTail }
        : { status: "failed", exitCode }
    },
  )

  const killGroup = (signal: NodeJS.Signals) => {
    try {
      process.kill(-proc.pid, signal)
    } catch {
      proc.kill(signal)
    }
  }

  return {
    status: "started",
    result,
    session: {
      id: `shell:${proc.pid}`,
      processId: proc.pid,
      ...(useProcessGroup ? { processGroupId: proc.pid } : {}),
      exited,
      terminate: () =>
        useProcessGroup ? killGroup("SIGTERM") : proc.kill("SIGTERM"),
      terminateNow: () =>
        useProcessGroup ? killGroup("SIGKILL") : proc.kill("SIGKILL"),
    },
  }
}

/**
 * Drain a `ReadableStream<Uint8Array>` into a UTF-8 string, keeping at most
 * the trailing `maxBytes`. Resolves to `undefined` if the stream is null
 * (e.g., spawn failed before stderr was opened) or yields no bytes.
 */
async function readTail(
  stream: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<string | undefined> {
  if (!stream) return undefined

  const decoder = new TextDecoder()
  let buffer = ""

  for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true })
    if (buffer.length > maxBytes) {
      buffer = buffer.slice(-maxBytes)
    }
  }
  buffer += decoder.decode()
  if (buffer.length > maxBytes) buffer = buffer.slice(-maxBytes)

  return buffer.length > 0 ? buffer : undefined
}
