// Canvas concerns layered on top of the webpage core: optional render-resolution
// override, canvas presentation (background + fit + scaling + rotate), and the
// universal start-gate click. These all assume a single <canvas> game.

import type { CdpClient } from "../../webpage/src/runtime/cdp"
import type { CanvasSettings } from "./settings"
import { CANVAS_PRESENT_EXPR, canvasPresentationShim } from "./shims"

async function canvasPresent(cdp: CdpClient): Promise<boolean> {
  const state = await cdp.evaluate<{ hasCanvas: boolean } | null>(
    CANVAS_PRESENT_EXPR,
  )
  return state?.hasCanvas === true
}

async function clickCanvasCenter(cdp: CdpClient): Promise<void> {
  const rect = await cdp.evaluate<{ x: number; y: number } | null>(
    "(() => { const c = document.querySelector('canvas'); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2 }; })()",
  )
  if (!rect) return
  // Separate down/up in time: engines debounce same-tick press+release.
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

// Universal gate: one trusted canvas click grants user activation (audio) and
// fires a real mousedown (dismisses overlay gates like GameMaker's). The overlay
// only becomes a live target after the engine loads — tens of seconds over the
// network — so click through a startup window until it lands.
// Through the startup window: re-assert the presentation shim on the LIVE
// document (it is idempotent per-document and survives engine-driven reloads via
// its internal interval) and, when gating, click the canvas until it lands. A
// single early inject is unreliable because the engine commits/reloads its
// document after we connect.
async function driveStartup(
  cdp: CdpClient,
  presentation: string,
  gate: boolean,
): Promise<void> {
  const canvasDeadline = Date.now() + 120000
  while (Date.now() < canvasDeadline && !(await canvasPresent(cdp))) {
    await cdp.evaluate(presentation)
    await Bun.sleep(500)
  }
  if (!(await canvasPresent(cdp))) return
  const window = Date.now() + 60000
  while (Date.now() < window) {
    await cdp.evaluate(presentation)
    if (gate) await clickCanvasCenter(cdp)
    await Bun.sleep(gate ? 2000 : 1500)
  }
}

export async function applyCanvasConcerns(
  cdp: CdpClient,
  settings: CanvasSettings,
): Promise<void> {
  // Optional render-resolution override: force the viewport the page sees, which
  // responsive engines use to size their canvas. Default reads the canvas in-page.
  if (settings.resolution) {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: settings.resolution.width,
      height: settings.resolution.height,
      deviceScaleFactor: 1,
      mobile: false,
    })
  }

  const presentation = canvasPresentationShim({
    background: settings.background ?? "#000",
    scaling: settings.scaling ?? "pixel",
    fit: settings.fit ?? "contain",
    rotate: settings.rotate ?? 0,
  })
  // Run on every future document too (reloads), in addition to the live re-assert.
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: presentation,
  })

  for (const shimPath of settings.shim ?? []) {
    try {
      const source = await Bun.file(shimPath).text()
      await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source })
    } catch {
      // missing/optional app shim is non-fatal
    }
  }

  await driveStartup(cdp, presentation, (settings.gate ?? "auto") === "auto")
}
