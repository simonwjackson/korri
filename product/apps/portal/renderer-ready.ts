export interface RendererReadyTarget {
  readonly location: { readonly href: string }
  readonly fetch?: typeof fetch
}

export function notifyRendererReady(target: RendererReadyTarget): void {
  const send = target.fetch
  if (typeof send !== "function") return

  send("/__korri/renderer-ready", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ href: target.location.href }),
  }).catch(() => {})
}
