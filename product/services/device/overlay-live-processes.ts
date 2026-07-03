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
    spawn(): RendererProcess {
      const child = Bun.spawn([opts.bin], {
        stdin: "pipe",
        stdout: "ignore",
        stderr: "ignore",
        env: opts.env,
      })
      const sink = child.stdin
      return {
        write(data: string) {
          sink.write(data)
          sink.flush()
        },
        alive: () => child.exitCode === null && !child.killed,
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
      const child = Bun.spawn([command, ...args], {
        stdout: "pipe",
        stderr: "ignore",
        env: opts.env,
      })
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
          // reader cancelled on stop(); ignore.
        }
      })()
      return () => {
        try {
          child.kill()
        } catch {
          // already gone
        }
      }
    },
  }
}
