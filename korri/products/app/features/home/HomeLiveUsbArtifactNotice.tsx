type LiveUsbArtifact = "product" | "developer"

export function HomeLiveUsbArtifactNotice({
  artifact,
}: {
  readonly artifact?: LiveUsbArtifact
}) {
  if (artifact !== "developer") return null

  return (
    <aside
      aria-label="Live USB artifact"
      className="pointer-events-none fixed right-4 top-4 z-50 rounded-full border border-amber-300/50 bg-amber-950/90 px-4 py-2 text-sm font-semibold tracking-wide text-amber-100 shadow-lg shadow-black/30"
    >
      <span>Developer ISO</span>
      <span className="ml-2 text-amber-200/80">broad persistence</span>
    </aside>
  )
}
