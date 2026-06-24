export type DeviceSelection =
  | { readonly kind: "all" }
  | { readonly kind: "set"; readonly ids: readonly string[] }

export function parseDeviceSegment(
  segment: string | undefined,
  knownDeviceIds: readonly string[],
): DeviceSelection {
  const raw = segment?.trim()
  if (!raw || raw === "all") return { kind: "all" }

  const known = new Set(knownDeviceIds)
  const ids: string[] = []
  const seen = new Set<string>()
  for (const id of raw.split(",")) {
    const normalized = id.trim()
    if (!normalized || !known.has(normalized) || seen.has(normalized)) continue
    seen.add(normalized)
    ids.push(normalized)
  }

  return ids.length > 0 ? { kind: "set", ids } : { kind: "all" }
}

export function selectedDevicesForSegment(
  segment: string | undefined,
  knownDeviceIds: readonly string[],
): readonly string[] {
  const selection = parseDeviceSegment(segment, knownDeviceIds)
  return selection.kind === "all" ? knownDeviceIds : selection.ids
}

export function deviceSegmentForSelection(
  selection: DeviceSelection,
  knownDeviceIds: readonly string[],
): string {
  if (selection.kind === "all") return "all"

  const known = new Set(knownDeviceIds)
  const ids: string[] = []
  const seen = new Set<string>()
  for (const id of selection.ids) {
    if (!known.has(id) || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }

  return ids.length > 0 ? ids.join(",") : "all"
}

export function normalizeSurfacePath(path: string | undefined): string {
  const trimmed = path?.trim()
  if (!trimmed || trimmed === "/") return "/"
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`
}

export function surfacePathToSplat(path: string | undefined): string {
  const normalized = normalizeSurfacePath(path)
  return normalized === "/" ? "" : normalized.replace(/^\/+/, "")
}
