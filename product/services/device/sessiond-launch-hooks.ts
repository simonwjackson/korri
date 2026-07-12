/**
 * Launch-hook runner for sessiond managed launches.
 *
 * Owns everything about executing user-authored `hooks.before` /
 * `hooks.after` shell steps around a managed child: sequencing, per-step
 * timeout (default 30s), SIGTERM→grace→SIGKILL kill of the step's process
 * group, launch-scoped abort (terminate during hooks), env assembly, and
 * bounded output capture for failure reporting.
 *
 * Ordering contract (see `ResolvedLaunchHooks`): the `before` list is
 * execution order; the `after` list arrives in inheritance order and THIS
 * RUNNER REVERSES IT so teardown unwinds most-specific first — nested
 * try/finally semantics.
 *
 * Spawn conventions mirror `shell-launcher.ts`: steps become their own
 * session/process-group leaders via `setsid -- /bin/sh -c <run>` so kill
 * escalation reaches grandchildren, and completion is only ever inferred
 * from the process exit event — never from stream close (SSE learning).
 */

export interface LaunchHookStepInput {
  readonly run: string
  readonly name?: string
  /** Whole seconds in the authored schema; fractional accepted internally. */
  readonly timeout?: number
  readonly "on-failure"?: "abort" | "warn"
}

export type LaunchHookPhase = "before" | "after"

export type LaunchHookOutcomeStatus =
  | "ok"
  | "failed"
  | "timed-out"
  | "aborted"
  | "spawn-error"

export interface LaunchHookOutcome {
  /** Authored step name, or the synthetic positional label `before[N]` / `after[N]`. */
  readonly name: string
  readonly phase: LaunchHookPhase
  readonly status: LaunchHookOutcomeStatus
  readonly exitCode?: number
  readonly stderrTail?: string
}

export interface LaunchHooksBeforeResult {
  /** Per-step outcomes for every step that started, in execution order. */
  readonly outcomes: readonly LaunchHookOutcome[]
  /**
   * Set when the before sequence stopped early: an abort-policy step
   * failed/timed out, the step spawn itself failed, or a launch-scoped
   * abort (terminate) killed the running step. Remaining steps were skipped.
   */
  readonly aborted?: LaunchHookOutcome
}

export interface LaunchHooksRunnerLogger {
  readonly info: (input: unknown, message?: string) => void
  readonly warn: (input: unknown, message?: string) => void
}

export interface LaunchHooksRunnerOptions {
  readonly launchId: string
  /** Closest stable game identity for `KORRI_GAME_ID`; omitted when unknown. */
  readonly gameId?: string
  /** Resolved cascade env (rides the launch spec); overlaid on the process env. */
  readonly launchEnv?: Readonly<Record<string, string>>
  readonly logger?: LaunchHooksRunnerLogger
  /** Grace between SIGTERM and SIGKILL on timeout/abort. Default 1.5s. */
  readonly killGraceMs?: number
  /** Per-step timeout fallback in seconds. Default 30. */
  readonly defaultTimeoutSeconds?: number
  /** Override the shell binary. Default `/bin/sh`. */
  readonly shellCommand?: string
  /** Override the setsid binary. Default `setsid` (mirrors shell-launcher). */
  readonly setsidCommand?: string
  /** Base environment. Default `process.env`. */
  readonly baseEnv?: Readonly<Record<string, string | undefined>>
}

export interface LaunchHooksRunner {
  /**
   * Executes before-steps in order. A step failing (non-zero exit, timeout,
   * spawn error) under the default `on-failure: abort` policy stops the
   * remaining steps and surfaces the failing outcome as `aborted`; under
   * `warn` the failure is logged and execution continues.
   */
  readonly runBeforeHooks: (
    steps: readonly LaunchHookStepInput[],
  ) => Promise<LaunchHooksBeforeResult>
  /**
   * Reverses the given list, then executes every step. Failures and
   * timeouts log and continue — never throw, never block teardown.
   */
  readonly runAfterHooks: (
    steps: readonly LaunchHookStepInput[],
  ) => Promise<readonly LaunchHookOutcome[]>
  /**
   * Launch-scoped abort (terminate during hooks). Kills the currently
   * running before-step's process group (graceful = SIGTERM→grace→SIGKILL,
   * force = immediate SIGKILL) and skips the remaining before-steps.
   * After-hooks are unaffected: they must still run to undo partial state.
   */
  readonly abort: (mode: "graceful" | "force") => void
}

const DEFAULT_TIMEOUT_SECONDS = 30
const DEFAULT_KILL_GRACE_MS = 1500
/**
 * Post-exit output collection bound. A background child that inherited the
 * step's stdout/stderr keeps the pipes open past the step's own exit; the
 * tails are best-effort diagnostics, so give them a short window and move on.
 */
const OUTPUT_DRAIN_DEADLINE_MS = 250
const DEFAULT_SHELL_COMMAND = "/bin/sh"
const DEFAULT_SETSID_COMMAND = "setsid"
const OUTPUT_TAIL_BYTES = 4 * 1024

const noopLogger: LaunchHooksRunnerLogger = {
  info: () => {},
  warn: () => {},
}

export function createLaunchHooksRunner(
  options: LaunchHooksRunnerOptions,
): LaunchHooksRunner {
  const logger = options.logger ?? noopLogger
  const killGraceMs = options.killGraceMs ?? DEFAULT_KILL_GRACE_MS
  const defaultTimeoutSeconds =
    options.defaultTimeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS
  const shellCommand = options.shellCommand ?? DEFAULT_SHELL_COMMAND
  const setsidCommand = options.setsidCommand ?? DEFAULT_SETSID_COMMAND

  let abortRequested: "graceful" | "force" | undefined
  let killRunningStep: ((mode: "graceful" | "force") => void) | undefined

  function stepEnv(phase: LaunchHookPhase): Record<string, string> {
    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(options.baseEnv ?? process.env)) {
      if (value !== undefined) env[key] = value
    }
    for (const [key, value] of Object.entries(options.launchEnv ?? {})) {
      env[key] = value
    }
    // Scrub inherited launch-identity vars before injecting: hooks must
    // never see stale values leaked from sessiond's own environment.
    // "KORRI_GAME_ID unset when the launch has no game annotation" is the
    // documented contract for user scripts.
    delete env.KORRI_GAME_ID
    delete env.KORRI_LAUNCH_ID
    delete env.KORRI_HOOK_PHASE
    // KORRI_* vars injected last: a frozen external contract for user scripts.
    if (options.gameId !== undefined) env.KORRI_GAME_ID = options.gameId
    env.KORRI_LAUNCH_ID = options.launchId
    env.KORRI_HOOK_PHASE = phase
    return env
  }

  async function executeStep(
    step: LaunchHookStepInput,
    phase: LaunchHookPhase,
    label: string,
  ): Promise<LaunchHookOutcome> {
    let proc: ReturnType<typeof Bun.spawn>
    try {
      proc = Bun.spawn([setsidCommand, "--", shellCommand, "-c", step.run], {
        env: stepEnv(phase),
        cwd: "/tmp",
        stdout: "pipe",
        stderr: "pipe",
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.warn(
        { launchId: options.launchId, hook: label, phase, message },
        "sessiond: launch hook spawn failed",
      )
      return { name: label, phase, status: "spawn-error", stderrTail: message }
    }

    let exited = false
    const killGroup = (signal: NodeJS.Signals) => {
      try {
        process.kill(-proc.pid, signal)
      } catch {
        try {
          proc.kill(signal)
        } catch {
          // Already gone; nothing to signal.
        }
      }
    }
    const escalate = (mode: "graceful" | "force") => {
      if (exited) return
      if (mode === "force") {
        killGroup("SIGKILL")
        return
      }
      killGroup("SIGTERM")
      const escalation = setTimeout(() => {
        if (!exited) killGroup("SIGKILL")
      }, killGraceMs)
      if (typeof escalation.unref === "function") escalation.unref()
    }

    let timedOut = false
    const timeoutSeconds = step.timeout ?? defaultTimeoutSeconds
    const timeoutTimer = setTimeout(() => {
      timedOut = true
      escalate("graceful")
    }, timeoutSeconds * 1000)
    if (typeof timeoutTimer.unref === "function") timeoutTimer.unref()

    // The launch-scoped abort only cancels before-hooks: after-hooks must
    // still run after a terminate to undo partial device state. Their own
    // per-step timeout bounds them instead.
    let abortedDuringStep = false
    if (phase === "before") {
      killRunningStep = mode => {
        abortedDuringStep = true
        escalate(mode)
      }
      // Abort raced in between the spawn and the kill-slot registration.
      if (abortRequested !== undefined) killRunningStep(abortRequested)
    }

    const stderrTailPromise = readTail(pipeOf(proc.stderr), OUTPUT_TAIL_BYTES)
    const stdoutTailPromise = readTail(pipeOf(proc.stdout), OUTPUT_TAIL_BYTES)

    // Completion comes from the process exit event only. Stream close is
    // never a completion signal: a background child inheriting the step's
    // stdout/stderr keeps the pipes open indefinitely.
    let exitCode: number
    try {
      exitCode = await proc.exited
    } finally {
      exited = true
      clearTimeout(timeoutTimer)
      killRunningStep = undefined
      // Reap the step's process group even on normal exit so descendants
      // (background children) never outlive the step. Post-exit there is
      // nothing left to shut down gracefully — go straight to SIGKILL.
      killGroup("SIGKILL")
    }

    const drained = await Promise.race([
      Promise.all([stderrTailPromise, stdoutTailPromise]),
      drainDeadline(OUTPUT_DRAIN_DEADLINE_MS),
    ])
    const [stderrTail, stdoutTail] = drained ?? []

    const status: LaunchHookOutcomeStatus = abortedDuringStep
      ? "aborted"
      : timedOut
        ? "timed-out"
        : exitCode === 0
          ? "ok"
          : "failed"

    const logPayload = {
      launchId: options.launchId,
      hook: label,
      phase,
      status,
      exitCode,
      ...(stdoutTail ? { stdoutTail } : {}),
      ...(stderrTail ? { stderrTail } : {}),
    }
    if (status === "ok") {
      logger.info(logPayload, "sessiond: launch hook completed")
    } else {
      logger.warn(logPayload, "sessiond: launch hook failed")
    }

    return {
      name: label,
      phase,
      status,
      exitCode,
      ...(stderrTail ? { stderrTail } : {}),
    }
  }

  return {
    async runBeforeHooks(steps) {
      const outcomes: LaunchHookOutcome[] = []
      for (const [index, step] of steps.entries()) {
        const label = step.name ?? `before[${index}]`
        if (abortRequested !== undefined) {
          // Terminate raced in between steps: skip the rest and surface a
          // synthetic aborted marker so the caller skips the spawn.
          return {
            outcomes,
            aborted: { name: label, phase: "before", status: "aborted" },
          }
        }
        const outcome = await executeStep(step, "before", label)
        outcomes.push(outcome)
        if (outcome.status === "ok") continue
        if (outcome.status === "aborted") return { outcomes, aborted: outcome }
        const policy = step["on-failure"] ?? "abort"
        if (policy === "abort") return { outcomes, aborted: outcome }
        logger.warn(
          { launchId: options.launchId, hook: label, status: outcome.status },
          "sessiond: before-hook failed with warn policy; continuing",
        )
      }
      return { outcomes }
    },

    async runAfterHooks(steps) {
      const outcomes: LaunchHookOutcome[] = []
      // Reverse execution: teardown unwinds most-specific first. Labels
      // stay bound to the declared positions.
      const labeled = steps.map((step, index) => ({
        step,
        label: step.name ?? `after[${index}]`,
      }))
      for (const { step, label } of labeled.reverse()) {
        try {
          outcomes.push(await executeStep(step, "after", label))
        } catch (error) {
          // executeStep never throws by construction, but after-hooks must
          // never block teardown even if that invariant breaks.
          logger.warn(
            { launchId: options.launchId, hook: label, err: error },
            "sessiond: after-hook execution threw; continuing teardown",
          )
          outcomes.push({
            name: label,
            phase: "after",
            status: "spawn-error",
            stderrTail: error instanceof Error ? error.message : String(error),
          })
        }
      }
      return outcomes
    },

    abort(mode) {
      abortRequested = mode
      killRunningStep?.(mode)
    },
  }
}

/** Bounded wait used to race best-effort output drains after process exit. */
function drainDeadline(ms: number): Promise<undefined> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(undefined), ms)
    if (typeof timer.unref === "function") timer.unref()
  })
}

function pipeOf(
  stream: number | ReadableStream<Uint8Array> | undefined,
): ReadableStream<Uint8Array> | null {
  return typeof stream === "object" && stream !== null ? stream : null
}

/** Drain a stream keeping at most the trailing `maxBytes` (mirrors shell-launcher). */
async function readTail(
  stream: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<string | undefined> {
  if (!stream) return undefined
  const decoder = new TextDecoder()
  let buffer = ""
  for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true })
    if (buffer.length > maxBytes) buffer = buffer.slice(-maxBytes)
  }
  buffer += decoder.decode()
  if (buffer.length > maxBytes) buffer = buffer.slice(-maxBytes)
  return buffer.length > 0 ? buffer : undefined
}
