/**
 * Concrete Bun.spawn glue behind the overlay ports. Thin adapters (no unit
 * tests): the renderer is a child process we write the line protocol to, and
 * the intercept port runs busctl / gdbus monitor. inputd owns these and passes
 * the compositor wayland + system-bus environment through.
 */
import type {
  RendererProcess,
  RendererProcessSpawner,
} from "./overlay-renderer-client"
import type { InterceptSubprocess } from "./overlay-intercept-live"

type Env = Record<string, string | undefined>

export function createBunRendererSpawner(opts: {
  readonly bin: string
  readonly env: Env
}): RendererProcessSpawner {
  return {
    spawn(onLine?: (line: string) => void): RendererProcess {
      const child = Bun.spawn([opts.bin], {
        stdin: "pipe",
        stdout: onLine ? "pipe" : "ignore",
        stderr: "ignore",
        env: opts.env,
      })
      if (onLine && child.stdout) {
        const reader = (child.stdout as ReadableStream<Uint8Array>).getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        void (async () => {
          try {
            for (;;) {
              const { done, value } = await reader.read()
              if (done) break
              buffer += decoder.decode(value, { stream: true })
              let idx: number
              while ((idx = buffer.indexOf("\n")) >= 0) {
                onLine(buffer.slice(0, idx))
                buffer = buffer.slice(idx + 1)
              }
            }
          } catch {
            // reader cancelled on child exit; ignore.
          }
        })()
      }
      // Track liveness via the exited promise rather than reading exitCode,
      // which is a more reliable signal that the child is still up (a flaky
      // liveness check caused the client to respawn and stack overlays).
      let dead = false
      void child.exited.then(
        () => {
          dead = true
        },
        () => {
          dead = true
        },
      )
      const sink = child.stdin
      return {
        write(data: string) {
          try {
            sink.write(data)
            sink.flush()
          } catch {
            dead = true
          }
        },
        alive: () => !dead,
        kill() {
          try {
            child.kill()
          } catch {
            // already gone
          }
        },
      }
    },
  }
}

export function createBunInterceptSubprocess(opts: {
  readonly env: Env
}): InterceptSubprocess {
  return {
    async run(command, args) {
      const child = Bun.spawn([command, ...args], {
        stdout: "ignore",
        stderr: "ignore",
        env: opts.env,
      })
      await child.exited
    },
    spawnLines(command, args, onLine) {
      // The monitor (gdbus) is long-lived and load-bearing: if it dies, nav goes
      // silent forever. Respawn it on unexpected exit (with a short backoff) so
      // the overlay's input channel self-heals; stop() disables respawning.
      let stopped = false
      let current: Bun.Subprocess<"ignore", "pipe", "ignore"> | null = null

      const start = (): void => {
        if (stopped) return
        let child: Bun.Subprocess<"ignore", "pipe", "ignore">
        try {
          child = Bun.spawn([command, ...args], {
            stdout: "pipe",
            stderr: "ignore",
            env: opts.env,
          })
        } catch {
          // Spawn failed (e.g. binary missing): back off and retry rather than
          // degrading to a permanently dead subscription.
          if (!stopped) setTimeout(start, 1_000)
          return
        }
        current = child
        const reader = child.stdout.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        void (async () => {
          try {
            for (;;) {
              const { done, value } = await reader.read()
              if (done) break
              buffer += decoder.decode(value, { stream: true })
              let idx: number
              while ((idx = buffer.indexOf("\n")) >= 0) {
                onLine(buffer.slice(0, idx))
                buffer = buffer.slice(idx + 1)
              }
            }
          } catch {
            // reader cancelled on stop() or child exit; ignore.
          }
        })()
        void child.exited.then(
          () => {
            if (!stopped) setTimeout(start, 1_000)
          },
          () => {
            if (!stopped) setTimeout(start, 1_000)
          },
        )
      }

      start()
      return () => {
        stopped = true
        try {
          current?.kill()
        } catch {
          // already gone
        }
      }
    },
  }
}
