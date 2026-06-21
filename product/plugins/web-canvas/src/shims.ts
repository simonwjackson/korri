// In-page shims for canvas games, injected over CDP.

export interface PresentationOptions {
  readonly background: string
  readonly scaling: "pixel" | "smooth"
  readonly fit: "contain" | "cover" | "stretch"
  readonly rotate: 0 | 90 | 180 | 270
}

// Black-out + scale/center/rotate the single canvas to fill the fullscreen
// surface. Native resolution is read in-page (`canvas.width/height`) and used
// immediately — it never leaves the page. Engines (e.g. GameMaker) continuously
// restyle their canvas, so the fit is re-asserted on a steady interval.
export function canvasPresentationShim(opts: PresentationOptions): string {
  const imageRendering = opts.scaling === "smooth" ? "auto" : "pixelated"
  return `(() => {
  if (window.__korriPresentation) return "already";
  window.__korriPresentation = true;
  const style = document.createElement("style");
  style.textContent = "html,body{margin:0!important;padding:0!important;overflow:hidden!important;background:${opts.background}!important;width:100%!important;height:100%!important}";
  (document.head || document.documentElement).appendChild(style);
  const ROT = ${opts.rotate}, FIT = "${opts.fit}";
  const apply = () => {
    const c = document.querySelector("canvas");
    if (!c || !c.width || !c.height) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const swap = ROT === 90 || ROT === 270;
    const W = swap ? c.height : c.width, H = swap ? c.width : c.height;
    let sc;
    if (FIT === "stretch" && !swap) {
      sc = "scale(" + (vw / c.width) + "," + (vh / c.height) + ")";
    } else {
      const s = FIT === "cover" ? Math.max(vw / W, vh / H) : Math.min(vw / W, vh / H);
      sc = "scale(" + s + ")";
    }
    const t = "translate(-50%,-50%) rotate(" + ROT + "deg) " + sc;
    if (c.style.transform === t && c.style.position === "fixed") return;
    c.style.position = "fixed"; c.style.left = "50%"; c.style.top = "50%";
    c.style.right = "auto"; c.style.bottom = "auto"; c.style.margin = "0";
    c.style.transformOrigin = "center center";
    c.style.transform = t; c.style.imageRendering = "${imageRendering}";
  };
  if (!window.__korriFitTimer) window.__korriFitTimer = setInterval(apply, 200);
  window.addEventListener("resize", apply);
  apply();
  return "presentation";
})()`
}

// Self-contained canvas-presence reader; reload-safe (no dependency on a prior
// injection surviving engine-driven document reloads).
export const CANVAS_PRESENT_EXPR =
  '(() => ({ hasCanvas: !!document.querySelector("canvas") }))()'
