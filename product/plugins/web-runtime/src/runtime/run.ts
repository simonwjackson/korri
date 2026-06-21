// korri-web-runtime — runs a web game in bare kiosk Chromium and drives it.
//
// Deliberately minimal and universal: the only input is the URL. There are no
// per-game flags, no engine selection, no native-resolution handling, and NO
// gamescope. Scaling happens in-page (the canvas fits the fullscreen surface),
// and the start gate is cleared with one universal trusted click — which covers
// essentially every audio web game, since the gate is a browser user-activation
// rule, not an engine quirk. gamescope, if ever wanted, wraps this from outside.

import { composeWebChromiumArgs } from "../core/chromium-args"
import type { RunConfig } from "./args"
import { type CdpClient, connectCdp } from "./cdp"
import { bootstrapShim, fitCanvasShim, GATE_STATE_EXPR } from "./shims"

const CHROMIUM = process.env.KORRI_WEB_RUNTIME_CHROMIUM ?? "chromium"

function spawnEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env))
    if (v !== undefined) env[k] = v
  // The nixpkgs chromium wrapper forces a wayland hint when this is set; we set
  // the platform explicitly, so strip it to avoid conflicting flags.
  delete env.NIXOS_OZONE_WL
  return env
}

async function canvasPresent(cdp: CdpClient): Promise<boolean> {
  const state = await cdp.evaluate<{ hasCanvas: boolean } | null>(
    GATE_STATE_EXPR,
  )
  return state?.hasCanvas === true
}

async function clickCanvasCenter(cdp: CdpClient): Promise<void> {
  const rect = await cdp.evaluate<{ x: number; y: number } | null>(
    "(() => { const c = document.querySelector('canvas'); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2 }; })()",
  )
  if (!rect) return
  // Separate down/up in time: engines debounce same-tick press+release and will
  // not register it as a real click.
  for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
    await cdp.send("Input.dispatchMouseEvent", {
      type,
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      button: type === "mouseMoved" ? "none" : "left",
      buttons: type === "mousePressed" ? 1 : 0,
      clickCount: 1,
    })
    await Bun.sleep(60)
  }
}

// Universal gate: a trusted canvas click grants user activation (audio) AND fires
// a real mousedown (dismisses overlay-style gates like GameMaker's). The overlay
// only becomes a live target after the engine loads — which over the network can
// be tens of seconds — so click through a startup window until it lands.
async function driveGate(cdp: CdpClient): Promise<void> {
  const canvasDeadline = Date.now() + 120000
  while (Date.now() < canvasDeadline && !(await canvasPresent(cdp))) {
    await Bun.sleep(500)
  }
  if (!(await canvasPresent(cdp))) return
  const clickWindow = Date.now() + 60000
  while (Date.now() < clickWindow) {
    await clickCanvasCenter(cdp)
    await Bun.sleep(2000)
  }
}

export async function run(config: RunConfig): Promise<number> {
  const port = 9222
  const profileDir = `/tmp/korri-web-runtime-${process.pid}`
  const args = [
    ...composeWebChromiumArgs({
      locator: config.locator,
      autoplay: config.autoplay,
      extraFlags: config.extraFlags,
      ozonePlatform: "wayland",
    }),
    "--default-background-color=ff000000",
    "--remote-debugging-address=127.0.0.1",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
  ]

  // Pin a world-accessible cwd: posix_spawn resolves the inherited cwd, and a
  // private one (e.g. another user's home) makes the spawn fail with EACCES.
  const proc = Bun.spawn([CHROMIUM, ...args], {
    env: spawnEnv(),
    cwd: "/tmp",
    stdout: "inherit",
    stderr: "inherit",
  })

  const cdp = await connectCdp(port)
  const boot = bootstrapShim({ killOverflow: true, gate: "trusted-click" })
  const fit = fitCanvasShim()
  for (const source of [boot, fit]) {
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source })
  }
  await cdp.send("Emulation.setDefaultBackgroundColorOverride", {
    color: { r: 0, g: 0, b: 0, a: 1 },
  })
  await cdp.evaluate(boot)
  await cdp.evaluate(fit)
  // Optional app-specific shims (e.g. a level-loader) passed via --shim <path>.
  for (const shimPath of config.shims) {
    try {
      const source = await Bun.file(shimPath).text()
      await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source })
      await cdp.evaluate(source)
    } catch {
      // missing/optional shim is non-fatal
    }
  }
  await driveGate(cdp)
  cdp.close()

  return await proc.exited
}
