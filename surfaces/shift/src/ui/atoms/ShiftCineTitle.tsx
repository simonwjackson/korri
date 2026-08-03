import type { ReactNode } from "react"

/** The focused game's title — the cinematic hero's headline. */
export function ShiftCineTitle({ children }: { readonly children: ReactNode }) {
  return <h1 className="shift-cine-title">{children}</h1>
}
