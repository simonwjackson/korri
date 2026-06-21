// In-page bootstrap snippets injected by korri-web-runtime over CDP.
//
// These run inside the game page (via Page.addScriptToEvaluateOnNewDocument and a
// one-shot Runtime.evaluate for the already-loaded document). They are
// engine-agnostic plumbing: black background, optional scrollbar/overflow kill,
// and reporters the bin reads back (native resolution, engine fingerprint, gate
// state). Engine-specific automation (e.g. YFS level loading) ships as a separate
// shim file passed by `--shim <path>`.

import type { GateStrategy } from "../core/gate"

export interface BootstrapOptions {
  readonly killOverflow: boolean
  readonly gate: GateStrategy
}

// Reporter + black-bg + optional overflow-kill. Idempotent.
export function bootstrapShim(opts: BootstrapOptions): string {
  return `(() => {
  if (!window.__korriBootstrapped) {
    window.__korriBootstrapped = true;
    const style = document.createElement("style");
    style.textContent = "html,body{margin:0!important;padding:0!important;background:#000!important;${opts.killOverflow ? "overflow:hidden!important;" : ""}width:100%!important;height:100%!important}";
    (document.head || document.documentElement).appendChild(style);
  }
  window.__korriNativeRes = () => {
    const c = document.querySelector("canvas");
    if (!c || !c.width || !c.height) return null;
    let gl = null;
    try { const ctx = c.getContext("webgl2") || c.getContext("webgl"); if (ctx && ctx.drawingBufferWidth) gl = { width: ctx.drawingBufferWidth, height: ctx.drawingBufferHeight }; } catch (e) {}
    return { backingStore: { width: c.width, height: c.height }, drawingBuffer: gl };
  };
  window.__korriFingerprint = () => ({
    globals: ["GameMaker_Init","g_pBuiltIn","_GMrunner","C3","C3_GetObjectRefTable","cr_createRuntime","unityInstance","createUnityInstance","UnityLoader","Godot","Phaser","Module","pico8_buttons","_cartdat"].filter(n => { try { return typeof window[n] !== "undefined" } catch (e) { return false } }),
    title: document.title || "",
    canvasIds: [...document.querySelectorAll("canvas")].map(c => c.id),
    scriptSrcs: [...document.scripts].map(s => s.src || ""),
  });
  window.__korriGateState = () => ({
    hasCanvas: !!document.querySelector("canvas"),
    userActivationHasBeen: navigator.userActivation ? navigator.userActivation.hasBeenActive : null,
  });
  return "ok";
})()`
}

// Self-contained reader expressions. Inlined (not dependent on bootstrap having
// run) so they survive engine-driven document reloads that wipe injected globals.
export const NATIVE_RES_EXPR = `(() => { const c = document.querySelector("canvas"); if (!c || !c.width || !c.height) return null; let gl = null; try { const ctx = c.getContext("webgl2") || c.getContext("webgl"); if (ctx && ctx.drawingBufferWidth) gl = { width: ctx.drawingBufferWidth, height: ctx.drawingBufferHeight }; } catch (e) {} return { backingStore: { width: c.width, height: c.height }, drawingBuffer: gl }; })()`

export const FINGERPRINT_EXPR = `(() => ({ globals: ["GameMaker_Init","g_pBuiltIn","_GMrunner","C3","C3_GetObjectRefTable","cr_createRuntime","unityInstance","createUnityInstance","UnityLoader","Godot","Phaser","Module","pico8_buttons","_cartdat"].filter(n => { try { return typeof window[n] !== "undefined" } catch (e) { return false } }), title: document.title || "", canvasIds: [...document.querySelectorAll("canvas")].map(c => c.id), scriptSrcs: [...document.scripts].map(s => s.src || "") }))()`

export const GATE_STATE_EXPR = `(() => ({ hasCanvas: !!document.querySelector("canvas"), userActivationHasBeen: navigator.userActivation ? navigator.userActivation.hasBeenActive : null }))()`

// CSS-fit: scale the single canvas to fill the viewport (aspect-preserving,
// centered, pixelated) and re-apply on resize / engine canvas changes. Used on
// the no-gamescope path, where the host compositor just gives a fullscreen
// surface and scaling happens in-page — so native resolution never leaves the page.
export function fitCanvasShim(): string {
  return `(() => {
  let mo;
  const apply = () => {
    const c = document.querySelector("canvas");
    if (!c || !c.width || !c.height) return;
    const s = Math.min(window.innerWidth / c.width, window.innerHeight / c.height);
    const t = "translate(-50%,-50%) scale(" + s + ")";
    if (c.style.transform === t && c.style.position === "fixed") return;
    if (mo) mo.disconnect();
    c.style.position = "fixed"; c.style.left = "50%"; c.style.top = "50%";
    c.style.margin = "0"; c.style.transformOrigin = "center center";
    c.style.transform = t; c.style.imageRendering = "pixelated";
    if (mo) mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["width", "height", "style"] });
  };
  try { new ResizeObserver(apply).observe(document.documentElement); } catch (e) {}
  mo = new MutationObserver(apply);
  mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["width", "height", "style"] });
  window.addEventListener("resize", apply);
  apply();
  return "fit";
})()`
}

// Synthetic activation for engines whose load flow accepts untrusted DOM events
// (e.g. Construct). The trusted-click path uses real CDP Input instead.
export function syntheticGestureShim(): string {
  return `(() => {
  const c = document.querySelector("canvas");
  if (!c) return "no-canvas";
  const r = c.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  for (const type of ["pointerdown","mousedown","pointerup","mouseup","click"]) {
    const ev = type.startsWith("pointer") && typeof PointerEvent === "function"
      ? new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 1, pointerType: "mouse", isPrimary: true })
      : new MouseEvent(type.replace(/^pointer/, "mouse"), { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
    c.dispatchEvent(ev);
  }
  for (const type of ["keydown","keyup"]) c.dispatchEvent(new KeyboardEvent(type, { bubbles: true, key: "Enter", code: "Enter", keyCode: 13 }));
  return "dispatched";
})()`
}
