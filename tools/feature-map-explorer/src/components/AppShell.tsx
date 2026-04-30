import type { ReactNode } from "react"

/*
 * Three-column dev-tool shell:
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ TopBar (full width)                          │  48px row
 *   ├───────────┬──────────────────────┬───────────┤
 *   │ LeftRail  │ Canvas               │ Inspector │  flex row
 *   │ 280px     │ flex                 │ 360px     │
 *   └───────────┴──────────────────────┴───────────┘
 *
 * The shell is purely structural. Children compose the actual content
 * (TopBar, LeftRail, Canvas, Inspector). State and data fetching land in
 * Unit 4 — at that point this component becomes the Root that hosts the
 * feature-map provider.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="grid h-dvh w-dvw bg-bg text-text"
      style={{
        gridTemplateColumns: "280px minmax(0, 1fr) 360px",
        gridTemplateRows: "48px minmax(0, 1fr)",
      }}
    >
      {children}
    </div>
  )
}
