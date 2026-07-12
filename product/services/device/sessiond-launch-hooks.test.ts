import { describe, expect, it } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  createLaunchHooksRunner,
  type LaunchHookOutcome,
} from "./sessiond-launch-hooks"

const silentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

async function withTempDir<T>(body: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "korri-hooks-"))
  try {
    return await body(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function runner(
  overrides: Partial<Parameters<typeof createLaunchHooksRunner>[0]> = {},
) {
  return createLaunchHooksRunner({
    launchId: "launch-hooks-test",
    logger: silentLogger,
    killGraceMs: 100,
    ...overrides,
  })
}

describe("sessiond launch hooks runner", () => {
  it("runs before-hooks in order with phase env and supports multiline run", async () => {
    await withTempDir(async dir => {
      const out = join(dir, "order.log")
      const hooks = runner({
        gameId: "snes/echo.smc",
        launchEnv: { KORRI_TEST_OUT: out, CASCADE_VAR: "from-cascade" },
      })

      const result = await hooks.runBeforeHooks([
        {
          name: "first",
          run: `echo "one:$KORRI_HOOK_PHASE" >> "$KORRI_TEST_OUT"`,
        },
        {
          run: [
            `echo "two:$CASCADE_VAR" >> "$KORRI_TEST_OUT"`,
            `echo "three:$KORRI_GAME_ID:$KORRI_LAUNCH_ID" >> "$KORRI_TEST_OUT"`,
          ].join("\n"),
        },
      ])

      expect(result.aborted).toBeUndefined()
      expect(result.outcomes.map(outcome => outcome.status)).toEqual([
        "ok",
        "ok",
      ])
      const lines = (await readFile(out, "utf8")).trim().split("\n")
      expect(lines).toEqual([
        "one:before",
        "two:from-cascade",
        "three:snes/echo.smc:launch-hooks-test",
      ])
    })
  })

  it("executes after-hooks reversed with phase after", async () => {
    await withTempDir(async dir => {
      const out = join(dir, "after.log")
      const hooks = runner({ launchEnv: { KORRI_TEST_OUT: out } })

      const outcomes = await hooks.runAfterHooks([
        {
          name: "outermost",
          run: `echo "outermost:$KORRI_HOOK_PHASE" >> "$KORRI_TEST_OUT"`,
        },
        {
          name: "innermost",
          run: `echo "innermost:$KORRI_HOOK_PHASE" >> "$KORRI_TEST_OUT"`,
        },
      ])

      expect(outcomes.map(outcome => outcome.name)).toEqual([
        "innermost",
        "outermost",
      ])
      const lines = (await readFile(out, "utf8")).trim().split("\n")
      expect(lines).toEqual(["innermost:after", "outermost:after"])
    })
  })

  it("aborts on before-hook non-zero exit by default, skipping the rest", async () => {
    await withTempDir(async dir => {
      const out = join(dir, "abort.log")
      const hooks = runner({ launchEnv: { KORRI_TEST_OUT: out } })

      const result = await hooks.runBeforeHooks([
        { name: "cap-clocks", run: `echo boom >&2; exit 3` },
        { name: "never-runs", run: `echo skipped >> "$KORRI_TEST_OUT"` },
      ])

      expect(result.aborted).toBeDefined()
      expect(result.aborted?.name).toBe("cap-clocks")
      expect(result.aborted?.phase).toBe("before")
      expect(result.aborted?.status).toBe("failed")
      expect(result.aborted?.exitCode).toBe(3)
      expect(result.aborted?.stderrTail).toContain("boom")
      expect(result.outcomes).toHaveLength(1)
      await expect(readFile(out, "utf8")).rejects.toThrow()
    })
  })

  it("continues past a warn-policy before-hook failure", async () => {
    await withTempDir(async dir => {
      const out = join(dir, "warn.log")
      const hooks = runner({ launchEnv: { KORRI_TEST_OUT: out } })

      const result = await hooks.runBeforeHooks([
        { name: "best-effort", run: "exit 5", "on-failure": "warn" },
        { name: "still-runs", run: `echo ran >> "$KORRI_TEST_OUT"` },
      ])

      expect(result.aborted).toBeUndefined()
      expect(result.outcomes.map(outcome => outcome.status)).toEqual([
        "failed",
        "ok",
      ])
      expect(result.outcomes[0]?.exitCode).toBe(5)
      expect((await readFile(out, "utf8")).trim()).toBe("ran")
    })
  })

  it("kills a before-hook exceeding its timeout and honors abort policy", async () => {
    const hooks = runner()

    const started = Date.now()
    const result = await hooks.runBeforeHooks([
      { name: "hangs", run: "sleep 30", timeout: 0.2 },
    ])

    expect(Date.now() - started).toBeLessThan(5_000)
    expect(result.aborted?.status).toBe("timed-out")
    expect(result.aborted?.name).toBe("hangs")
  })

  it("treats a warn-policy timeout as a warning and continues", async () => {
    await withTempDir(async dir => {
      const out = join(dir, "warn-timeout.log")
      const hooks = runner({ launchEnv: { KORRI_TEST_OUT: out } })

      const result = await hooks.runBeforeHooks([
        { name: "hangs", run: "sleep 30", timeout: 0.2, "on-failure": "warn" },
        { name: "still-runs", run: `echo ran >> "$KORRI_TEST_OUT"` },
      ])

      expect(result.aborted).toBeUndefined()
      expect(result.outcomes.map(outcome => outcome.status)).toEqual([
        "timed-out",
        "ok",
      ])
      expect((await readFile(out, "utf8")).trim()).toBe("ran")
    })
  })

  it("kills the running step's process group on abort and skips the rest", async () => {
    await withTempDir(async dir => {
      const out = join(dir, "abort-signal.log")
      const hooks = runner({ launchEnv: { KORRI_TEST_OUT: out } })

      const running = hooks.runBeforeHooks([
        { name: "long", run: "sleep 30 & wait" },
        { name: "never-runs", run: `echo skipped >> "$KORRI_TEST_OUT"` },
      ])
      await new Promise(resolve => setTimeout(resolve, 100))
      hooks.abort("graceful")

      const started = Date.now()
      const result = await running
      expect(Date.now() - started).toBeLessThan(5_000)
      expect(result.aborted?.status).toBe("aborted")
      expect(result.aborted?.name).toBe("long")
      expect(result.outcomes).toHaveLength(1)
      await expect(readFile(out, "utf8")).rejects.toThrow()
    })
  })

  it("completes promptly and reaps a background child inheriting the step's fds", async () => {
    // A backgrounded `sleep 30` inherits the step's stdout/stderr pipes.
    // Completion must come from the step's own exit — not stream close —
    // and the step's process group must be reaped even on normal exit so
    // the orphaned sleep does not outlive the step.
    await withTempDir(async dir => {
      const pidFile = join(dir, "bg.pid")
      const hooks = runner({ launchEnv: { KORRI_TEST_PID: pidFile } })

      const started = Date.now()
      const result = await hooks.runBeforeHooks([
        {
          name: "forks",
          run: `sleep 30 & echo $! > "$KORRI_TEST_PID"; echo started`,
        },
      ])
      const elapsed = Date.now() - started

      expect(result.aborted).toBeUndefined()
      expect(result.outcomes.map(outcome => outcome.status)).toEqual(["ok"])
      // Bounded: exit is immediate; only the short drain deadline may add.
      expect(elapsed).toBeLessThan(5_000)

      // The background child's process group must be gone. Poll briefly:
      // SIGKILL delivery to the group is asynchronous.
      const backgroundPid = Number((await readFile(pidFile, "utf8")).trim())
      expect(Number.isInteger(backgroundPid)).toBe(true)
      const childGone = () => {
        try {
          process.kill(backgroundPid, 0)
          return false
        } catch {
          return true
        }
      }
      let gone = childGone()
      for (let index = 0; index < 40 && !gone; index += 1) {
        await new Promise(resolve => setTimeout(resolve, 50))
        gone = childGone()
      }
      expect(gone).toBe(true)
    })
  })

  it("scrubs inherited KORRI_* launch-identity vars from the hook env", async () => {
    await withTempDir(async dir => {
      const out = join(dir, "env.log")
      // Simulate sessiond's own environment leaking stale launch identity.
      const hooks = runner({
        baseEnv: {
          ...process.env,
          KORRI_GAME_ID: "stale/game",
          KORRI_LAUNCH_ID: "stale-launch",
          KORRI_HOOK_PHASE: "stale-phase",
        },
        launchEnv: { KORRI_TEST_OUT: out },
      })

      // No gameId on this runner: KORRI_GAME_ID must be unset, not stale.
      const result = await hooks.runBeforeHooks([
        {
          name: "env-probe",
          run: `echo "game=\${KORRI_GAME_ID-unset}:launch=$KORRI_LAUNCH_ID:phase=$KORRI_HOOK_PHASE" >> "$KORRI_TEST_OUT"`,
        },
      ])

      expect(result.outcomes.map(outcome => outcome.status)).toEqual(["ok"])
      expect((await readFile(out, "utf8")).trim()).toBe(
        "game=unset:launch=launch-hooks-test:phase=before",
      )
    })
  })

  it("runs remaining after-hooks when one fails and never throws", async () => {
    await withTempDir(async dir => {
      const out = join(dir, "after-fail.log")
      const hooks = runner({ launchEnv: { KORRI_TEST_OUT: out } })

      const outcomes = await hooks.runAfterHooks([
        { name: "restore-clocks", run: `echo restored >> "$KORRI_TEST_OUT"` },
        { name: "broken", run: "echo nope >&2; exit 9" },
      ])

      // Reversed: broken runs first, restore-clocks still runs after it.
      expect(outcomes.map(outcome => outcome.status)).toEqual(["failed", "ok"])
      expect(outcomes[0]?.exitCode).toBe(9)
      expect(outcomes[0]?.stderrTail).toContain("nope")
      expect((await readFile(out, "utf8")).trim()).toBe("restored")
    })
  })

  it("does not let an after-hook timeout block the remaining after-hooks", async () => {
    await withTempDir(async dir => {
      const out = join(dir, "after-timeout.log")
      const hooks = runner({ launchEnv: { KORRI_TEST_OUT: out } })

      const started = Date.now()
      // Reversed execution: `hangs` (last declared) runs first and times
      // out; `still-runs` must still execute afterwards.
      const outcomes = await hooks.runAfterHooks([
        { name: "still-runs", run: `echo ran >> "$KORRI_TEST_OUT"` },
        { name: "hangs", run: "sleep 30", timeout: 0.2 },
      ])
      const elapsed = Date.now() - started

      expect(outcomes.map(outcome => outcome.status)).toEqual([
        "timed-out",
        "ok",
      ])
      expect(outcomes.map(outcome => outcome.name)).toEqual([
        "hangs",
        "still-runs",
      ])
      expect(elapsed).toBeLessThan(5_000)
      expect((await readFile(out, "utf8")).trim()).toBe("ran")
    })
  })

  it("labels unnamed steps with synthetic before[N]/after[N] labels", async () => {
    const hooks = runner()

    const before = await hooks.runBeforeHooks([
      { run: "true" },
      { run: "true" },
    ])
    const after = await hooks.runAfterHooks([{ run: "true" }, { run: "true" }])

    expect(before.outcomes.map(outcome => outcome.name)).toEqual([
      "before[0]",
      "before[1]",
    ])
    // Reversed execution; labels stay bound to the declared positions.
    expect(after.map(outcome => outcome.name)).toEqual(["after[1]", "after[0]"])
  })

  it("treats empty step lists as no-ops", async () => {
    const hooks = runner()

    const before = await hooks.runBeforeHooks([])
    const after = await hooks.runAfterHooks([])

    expect(before.outcomes).toEqual([])
    expect(before.aborted).toBeUndefined()
    expect(after).toEqual([])
  })

  it("reports spawn errors as structured failures", async () => {
    const hooks = runner({ setsidCommand: "/definitely/not/setsid" })

    const result = await hooks.runBeforeHooks([
      { name: "no-setsid", run: "true" },
    ])

    expect(result.aborted?.status).toBe("spawn-error")
    expect(result.aborted?.name).toBe("no-setsid")
    expect(result.aborted?.stderrTail).toBeDefined()
  })
})

// Type-level guard: outcomes always expose name + phase for hook-failed events.
const _outcomeShape: LaunchHookOutcome = {
  name: "before[0]",
  phase: "before",
  status: "ok",
}
void _outcomeShape
