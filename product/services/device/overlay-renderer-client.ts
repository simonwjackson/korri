/**
 * Live OverlayRendererClient: serializes overlay commands to the renderer's
 * line protocol and writes them to a spawned korri-overlay-renderer process.
 *
 * The encoders are pure (unit-tested); the process wrapper lazily spawns the
 * renderer, reuses it across the session, and respawns if it dies. inputd owns
 * this and passes the renderer the compositor's wayland environment.
 */
import type { OverlayMenuOption } from "./overlay-menu"
import type { OverlayRendererClient } from "./overlay-orchestrator"

export function clampPct(pct: number): number {
  const rounded = Math.round(pct)
  if (rounded < 0) return 0
  if (rounded > 100) return 100
  return rounded
}

export function encodeRing(pct: number): string {
  return `ring ${clampPct(pct)}\n`
}

export function encodeHide(): string {
  return "hide\n"
}

export function encodeMenu(
  options: readonly OverlayMenuOption[],
  selected: number,
): string {
  // Labels are single-line; strip any newline defensively so the protocol stays
  // one command per line.
  const header = `menu ${selected} ${options.length}\n`
  const lines = options
    .map(o => `${o.danger ? 1 : 0} ${o.label.replace(/[\r\n]+/g, " ")}\n`)
    .join("")
  return header + lines
}

export interface RendererProcess {
  readonly write: (data: string) => void
  readonly alive: () => boolean
}

export interface RendererProcessSpawner {
  readonly spawn: () => RendererProcess
}

export function createOverlayRendererProcessClient(
  spawner: RendererProcessSpawner,
): OverlayRendererClient {
  let proc: RendererProcess | null = null

  function send(data: string): void {
    if (!proc || !proc.alive()) proc = spawner.spawn()
    proc.write(data)
  }

  return {
    ring: pct => send(encodeRing(pct)),
    menu: (options, selected) => send(encodeMenu(options, selected)),
    hide: () => send(encodeHide()),
  }
}
