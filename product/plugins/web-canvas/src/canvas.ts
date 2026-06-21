// Canvas concerns layered on top of the webpage core: optional render-resolution
// override, canvas presentation (background + fit + scaling + rotate), and the
// universal start-gate click. These all assume a single <canvas> game.

import type { CdpClient } from "../../webpage/src/runtime/cdp"
import type { CanvasSettings } from "./settings"
import { CANVAS_PRESENT_EXPR, canvasPresentationShim } from "./shims"

export interface CanvasStartupScript {
  readonly kind: "presentation" | "app-shim"
  readonly source: string
}

export function appShimDocumentSentinel(index: number): string {
  return `__korriCanvasAppShim${index}`
}

function wrapAppShimOncePerDocument(source: string, index: number): string {
  const sentinel = appShimDocumentSentinel(index)
  return `;(() => {\n  const sentinel = ${JSON.stringify(sentinel)};\n  if (Object.prototype.hasOwnProperty.call(window, sentinel)) return;\n  Object.defineProperty(window, sentinel, { value: true, configurable: false });\n  {\n${source}\n  }\n})()`
}

export async function prepareCanvasStartupScripts(
  settings: CanvasSettings,
): Promise<CanvasStartupScript[]> {
  const presentation = canvasPresentationShim({
    background: settings.background ?? "#000",
    scaling: settings.scaling ?? "pixel",
    fit: settings.fit ?? "contain",
    rotate: settings.rotate ?? 0,
  })
  const scripts: CanvasStartupScript[] = [
    { kind: "presentation", source: presentation },
  ]
  for (const [index, shimPath] of (settings.shim ?? []).entries()) {
    try {
      scripts.push({
        kind: "app-shim",
        source: wrapAppShimOncePerDocument(
          await Bun.file(shimPath).text(),
          index,
        ),
      })
    } catch (error) {
      throw new Error(
        `unable to read canvas app shim ${shimPath}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
  return scripts
}

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
  appShims: readonly string[],
  gate: boolean,
): Promise<void> {
  const canvasDeadline = Date.now() + 120000
  while (Date.now() < canvasDeadline && !(await canvasPresent(cdp))) {
    await cdp.evaluate(presentation)
    for (const source of appShims) await cdp.evaluate(source)
    await Bun.sleep(500)
  }
  if (!(await canvasPresent(cdp))) return
  const window = Date.now() + 60000
  while (Date.now() < window) {
    await cdp.evaluate(presentation)
    for (const source of appShims) await cdp.evaluate(source)
    if (gate) await clickCanvasCenter(cdp)
    await Bun.sleep(gate ? 2000 : 1500)
  }
}

export async function applyCanvasConcerns(
  cdp: CdpClient,
  settings: CanvasSettings,
  preparedScripts?: readonly CanvasStartupScript[],
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

  const startupScripts =
    preparedScripts ?? (await prepareCanvasStartupScripts(settings))
  const presentation = startupScripts.find(
    script => script.kind === "presentation",
  )
  if (!presentation)
    throw new Error("canvas presentation shim was not prepared")
  const appShims = startupScripts
    .filter(script => script.kind === "app-shim")
    .map(script => script.source)

  // Run on every future document too (reloads), in addition to the live re-assert.
  for (const script of startupScripts) {
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
      source: script.source,
    })
  }

  await driveStartup(
    cdp,
    presentation.source,
    appShims,
    (settings.gate ?? "auto") === "auto",
  )
}
