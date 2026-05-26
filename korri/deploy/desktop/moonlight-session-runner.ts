import type {
  CommandRunner,
  ManagedMoonlightSessionHandle,
} from "@app/stream/moonlight-launcher"
import { logger as defaultLogger } from "@shared/logger"

export interface DesktopMoonlightChild {
  readonly pid?: number
  readonly stdout?: ReadableStream<Uint8Array> | null
  readonly stderr?: ReadableStream<Uint8Array> | null
  readonly exited: Promise<number>
  readonly unref?: () => void
  readonly kill: (signal: string) => void
}

export interface DesktopMoonlightSessionRunnerOptions {
  readonly spawn: (
    command: string,
    args: readonly string[],
    options?: { readonly env?: Readonly<Record<string, string>> },
  ) => DesktopMoonlightChild
  readonly logger?: Pick<typeof defaultLogger, "info" | "warn">
  readonly collectOutput?: boolean
}

export function createDesktopMoonlightSessionRunner(
  options: DesktopMoonlightSessionRunnerOptions,
): CommandRunner {
  const logger = options.logger ?? defaultLogger
  return {
    run: async (command, args, runnerOptions) => {
      try {
        const child = options.spawn(command, args, { env: runnerOptions?.env })
        if (options.collectOutput !== false) {
          void collectAndLogMoonlightOutput(child, command, args, logger)
        }
        const observedExit = await observeMoonlightStartupExit(
          child,
          runnerOptions?.startupObserveMs,
        )
        if (observedExit !== undefined && observedExit !== 0) {
          return {
            status: "failed",
            message: `Moonlight exited early with status ${observedExit}`,
          }
        }
        child.unref?.()
        return {
          status: "started",
          session: managedSessionHandleForChild(child),
        }
      } catch (error) {
        return {
          status: "failed",
          message: error instanceof Error ? error.message : String(error),
        }
      }
    },
  }
}

function managedSessionHandleForChild(
  child: DesktopMoonlightChild,
): ManagedMoonlightSessionHandle {
  return {
    id: child.pid === undefined ? "process-unknown" : `pid-${child.pid}`,
    ...(child.pid === undefined ? {} : { processId: child.pid }),
    exited: child.exited.then(exitCode => ({ exitCode })),
    terminate: () => terminateMoonlightChild(child, "SIGTERM"),
    terminateNow: () => terminateMoonlightChild(child, "SIGKILL"),
  }
}

function terminateMoonlightChild(
  child: DesktopMoonlightChild,
  signal: "SIGTERM" | "SIGKILL",
): void {
  try {
    child.kill(signal)
  } catch (error) {
    defaultLogger.warn({ err: error }, "moonlight: failed to terminate child")
  }
}

async function observeMoonlightStartupExit(
  child: DesktopMoonlightChild,
  startupObserveMs: number | undefined,
): Promise<number | undefined> {
  if (!startupObserveMs || startupObserveMs <= 0) return undefined
  return Promise.race([
    child.exited,
    new Promise<undefined>(resolve => setTimeout(resolve, startupObserveMs)),
  ])
}

async function collectAndLogMoonlightOutput(
  child: DesktopMoonlightChild,
  command: string,
  args: readonly string[],
  logger: Pick<typeof defaultLogger, "info" | "warn">,
): Promise<void> {
  const snapshotBytes = 4 * 1024
  const snapshotDelayMs = 4_000

  const snapshotOf = (
    stream: ReadableStream<Uint8Array> | null | undefined,
  ) => {
    const snapshotChunks: Uint8Array[] = []
    let bytesKept = 0
    let snapshotReady = false
    const snapshotReadyResolvers: Array<() => void> = []
    const onSnapshotReady = () =>
      new Promise<void>(resolve => {
        if (snapshotReady) resolve()
        else snapshotReadyResolvers.push(resolve)
      })
    const markSnapshotReady = () => {
      if (snapshotReady) return
      snapshotReady = true
      for (const resolve of snapshotReadyResolvers) resolve()
    }
    const consume = async () => {
      if (!stream) return
      const reader = stream.getReader()
      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          if (!value || snapshotReady) continue
          const room = snapshotBytes - bytesKept
          if (room <= 0) continue
          const take = value.byteLength > room ? value.slice(0, room) : value
          snapshotChunks.push(take)
          bytesKept += take.byteLength
          if (bytesKept >= snapshotBytes) markSnapshotReady()
        }
      } catch {
        // Reader cancelled or process exited; nothing to do.
      } finally {
        markSnapshotReady()
        reader.releaseLock()
      }
    }
    void consume()
    return {
      onSnapshotReady,
      text: () =>
        new TextDecoder()
          .decode(Buffer.concat(snapshotChunks.map(c => Buffer.from(c))))
          .slice(0, snapshotBytes),
    }
  }

  const stdoutCollector = snapshotOf(child.stdout)
  const stderrCollector = snapshotOf(child.stderr)

  try {
    await Promise.race([
      Promise.all([
        stdoutCollector.onSnapshotReady(),
        stderrCollector.onSnapshotReady(),
      ]),
      new Promise(resolve => setTimeout(resolve, snapshotDelayMs)),
    ])
    const earlyExit = await Promise.race([
      child.exited,
      new Promise<undefined>(resolve =>
        setTimeout(() => resolve(undefined), 50),
      ),
    ])
    logger.info(
      {
        command,
        args,
        pid: child.pid,
        earlyExitCode: typeof earlyExit === "number" ? earlyExit : null,
        stdoutSnapshot: stdoutCollector.text().trim() || null,
        stderrSnapshot: stderrCollector.text().trim() || null,
      },
      "moonlight-diagnostic: snapshot",
    )
  } catch (error) {
    logger.warn(
      { err: error, command, args },
      "moonlight-diagnostic: snapshot failed",
    )
  }

  try {
    const exitCode = await child.exited
    logger.info(
      { command, args, pid: child.pid, exitCode },
      "moonlight-diagnostic: process exited",
    )
  } catch (error) {
    logger.warn(
      { err: error, command, args, pid: child.pid },
      "moonlight-diagnostic: failed to observe exit",
    )
  }
}
