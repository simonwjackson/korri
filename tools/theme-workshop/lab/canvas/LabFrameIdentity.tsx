/**
 * Per-frame route identity — the compact address (path + search) a frame is
 * currently showing, read from that frame's own router. Shown when frames are
 * un-synced so each device advertises where it sits (e.g. /library?lens=favorites).
 * Route-only by design: it reads the frame's location, not the shared coordinate
 * singleton, which keeps it per-frame and cheap.
 */
export function LabFrameIdentity({
  path,
  search,
}: {
  readonly path: string
  readonly search?: string
}) {
  const query =
    search && search !== "?"
      ? search.startsWith("?")
        ? search
        : `?${search}`
      : ""
  return (
    <code className="lab-frame-identity" aria-label="Frame route">
      {`${path}${query}`}
    </code>
  )
}
