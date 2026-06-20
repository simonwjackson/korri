// korri-web-runtime orchestrator.
//
// Self-contained: optionally probes the game's native render resolution and
// engine headlessly (no display needed — the engine sizes its canvas backing
// store regardless), then spawns gamescope at the computed internal resolution
// wrapping Chromium on gamescope's Xwayland, injects the in-page shims, drives
// the start gate over CDP (trusted input grants user activation), and waits for
// Chromium to exit.

import { composeWebChromiumArgs } from "../core/chromium-args"
import { classifyEngine, type EngineId } from "../core/engine-detect"
import { engineProfile } from "../core/engine-profiles"
import { webCompositorRequest } from "../core/gamescope-request"
import { nextGateAction } from "../core/gate"
import {
  type CanvasMeasurement,
  type Dimensions,
  nativeResolutionFromCanvas,
} from "../core/native-res"
import type { RunConfig } from "./args"
import { type CdpClient, connectCdp } from "./cdp"
import { gamescopeCliArgs } from "./gamescope-cli"
import {
  bootstrapShim,
  FINGERPRINT_EXPR,
  GATE_STATE_EXPR,
  NATIVE_RES_EXPR,
  syntheticGestureShim,
} from "./shims"

const CHROMIUM = process.env.KORRI_WEB_RUNTIME_CHROMIUM ?? "chromium"
const GAMESCOPE = process.env.KORRI_WEB_RUNTIME_GAMESCOPE ?? "gamescope"

function spawnEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env))
    if (v !== undefined) env[k] = v
  // The nixpkgs chromium wrapper injects --ozone-platform=wayland when this is
  // set; we need x11 (gamescope Xwayland), so strip it.
  delete env.NIXOS_OZONE_WL
  return env
}

function tmpProfile(tag: string): string {
  return `/tmp/korri-web-runtime-${tag}-${process.pid}`
}

async function probe(
  config: RunConfig,
): Promise<{ engine: EngineId; native: Dimensions }> {
  const port = 9333
  const profileDir = tmpProfile("probe")
  const proc = Bun.spawn(
    [
      CHROMIUM,
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      `--user-data-dir=${profileDir}`,
      "--remote-debugging-address=127.0.0.1",
      `--remote-debugging-port=${port}`,
      config.locator,
    ],
    { env: spawnEnv(), cwd: "/tmp", stdout: "ignore", stderr: "ignore" },
  )
  try {
    const cdp = await connectCdp(port)
    const native = await waitForNative(cdp)
    const engine =
      config.engine === "auto"
        ? classifyEngine(await cdp.evaluate(FINGERPRINT_EXPR))
        : config.engine
    cdp.close()
    return { engine, native }
  } finally {
    proc.kill()
  }
}

async function waitForNative(cdp: CdpClient): Promise<Dimensions> {
  for (let i = 0; i < 80; i++) {
    const measurement = await cdp.evaluate<CanvasMeasurement | null>(
      NATIVE_RES_EXPR,
    )
    if (measurement) return nativeResolutionFromCanvas(measurement)
    await Bun.sleep(250)
  }
  throw new Error("native resolution probe timed out (no sized canvas)")
}

async function driveGate(cdp: CdpClient, strategy: string): Promise<void> {
  // Deadline-based: large web bundles (e.g. itch GameMaker exports) can take
  // tens of seconds to load over the network before the canvas overlay is a
  // live click target, so keep driving the gate well past first paint.
  const deadline = Date.now() + 120000
  while (Date.now() < deadline) {
    const state = await cdp.evaluate<{
      hasCanvas: boolean
      userActivationHasBeen: boolean | null
    } | null>(GATE_STATE_EXPR)
    if (!state) {
      await Bun.sleep(250)
      continue
    }
    const action = nextGateAction(strategy as never, state)
    if (action.kind === "done") return
    if (action.kind === "wait") {
      await Bun.sleep(250)
      continue
    }
    if (action.kind === "synthetic-events") {
      await cdp.evaluate(syntheticGestureShim())
      await Bun.sleep(400)
      continue
    }
    // trusted-gesture: a real CDP canvas click BOTH grants user activation and
    // dismisses the engine's canvas-drawn focus overlay. Do NOT also send a
    // keypress — a key grants activation without a click landing, which would
    // make the gate look cleared while the overlay persists. With click-only,
    // activation reliably reflects a click that landed, so the loop retries
    // until one does (e.g. once the page has settled past load).
    const rect = await cdp.evaluate<{ x: number; y: number } | null>(
      "(() => { const c = document.querySelector('canvas'); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2 }; })()",
    )
    if (rect) {
      for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
        await cdp.send("Input.dispatchMouseEvent", {
          type,
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          button: type === "mouseMoved" ? "none" : "left",
          buttons: type === "mousePressed" ? 1 : 0,
          clickCount: 1,
        })
      }
    }
    await Bun.sleep(500)
  }
}

export async function run(config: RunConfig): Promise<number> {
  const needsProbe = config.engine === "auto" || config.native === "detect"
  const probed = needsProbe ? await probe(config) : undefined
  const engine = probed?.engine ?? (config.engine as EngineId)
  const native =
    config.native !== "detect" ? config.native : (probed?.native as Dimensions)
  const profile = engineProfile(engine)

  const port = 9222
  const profileDir = tmpProfile("run")
  const chromiumArgs = [
    ...composeWebChromiumArgs({
      locator: config.locator,
      autoplay: config.autoplay,
      extraFlags: config.extraFlags,
    }),
    "--default-background-color=ff000000",
    "--remote-debugging-address=127.0.0.1",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
  ]

  const command = config.gamescope
    ? [
        GAMESCOPE,
        ...gamescopeCliArgs(
          webCompositorRequest({
            native,
            fixedCanvas: profile.fixedCanvas,
            gap: config.gap,
            output: config.output,
            filter: config.filter,
          }),
        ),
        "--",
        CHROMIUM,
        ...chromiumArgs,
      ]
    : [CHROMIUM, ...chromiumArgs]

  // Pin a world-accessible cwd: posix_spawn resolves the inherited working
  // directory, and a private/inaccessible cwd (e.g. another user's home) makes
  // the spawn fail with EACCES even for world-executable binaries.
  const proc = Bun.spawn(command, {
    env: spawnEnv(),
    cwd: "/tmp",
    stdout: "inherit",
    stderr: "inherit",
  })

  const cdp = await connectCdp(port)
  const boot = bootstrapShim({
    killOverflow: profile.killOverflow,
    gate: profile.gate,
  })
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: boot })
  await cdp.send("Emulation.setDefaultBackgroundColorOverride", {
    color: { r: 0, g: 0, b: 0, a: 1 },
  })
  await cdp.evaluate(boot)
  // Load engine-specific shim files passed via --shim <path>.
  for (const shimPath of config.shims) {
    try {
      const source = await Bun.file(shimPath).text()
      await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source })
      await cdp.evaluate(source)
    } catch {
      // A named built-in shim (gamemaker/construct/generic) is a no-op today;
      // a missing external shim path is non-fatal.
    }
  }
  await driveGate(cdp, profile.gate)
  cdp.close()

  return await proc.exited
}
