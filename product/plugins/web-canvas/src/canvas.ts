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
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: presentation,
  })
  await cdp.evaluate(presentation)

  for (const shimPath of settings.shim ?? []) {
    try {
      const source = await Bun.file(shimPath).text()
      await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source })
      await cdp.evaluate(source)
    } catch {
      // missing/optional app shim is non-fatal
    }
  }

  if ((settings.gate ?? "auto") === "auto") await driveGate(cdp)
}
