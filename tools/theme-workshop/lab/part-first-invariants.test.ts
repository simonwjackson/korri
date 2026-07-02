import { describe, expect, it } from "bun:test"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import type { Story } from "../types"
import { shiftLabSurfaceAdapter } from "./adapters/shift"

/**
 * Part-first architecture invariants (see
 * docs/solutions/architecture-patterns/lab-parts-are-the-app-2026-07-01.md):
 * parts are the app, devices are mounts. These assertions fail when someone
 * reintroduces a device-anchored edge declaration, a props-injection bypass
 * on the catalog part path, or an event on a part that cannot receive it.
 */

const LAB_ADAPTERS_ROOT = "tools/theme-workshop/lab/adapters"

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      out.push(...walk(path))
      continue
    }
    if (!/\.tsx?$/.test(path) || /\.(test|spec)\.tsx?$/.test(path)) continue
    out.push(path)
  }
  return out
}

function story(layer: Story["layer"], name: string, state?: string): Story {
  return {
    id: `invariant-${layer}-${name}`,
    layer,
    name,
    ...(state ? { state } : {}),
    surface: layer === "page",
    render: () => null,
  }
}

const SHIFT_DEVICE_FACT_PARTS: readonly Story[] = [
  story("page", "Home", "Ready"),
  story("molecule", "Status Bar"),
  story("atom", "Battery"),
]

describe("part-first invariants", () => {
  it("live-mounts every part that declares device events", () => {
    // An event lands in the part's registered registry; a part that declares
    // events but has no live mount spec would silently swallow them.
    for (const part of SHIFT_DEVICE_FACT_PARTS) {
      const events = shiftLabSurfaceAdapter.surfacePartEvents?.(part) ?? []
      expect(events.length).toBeGreaterThan(0)
      const spec = shiftLabSurfaceAdapter.surfacePartMount?.(part, {
        sourceId: "dev",
        inputValues: {},
      })
      expect(spec).toBeTruthy()
      expect((spec?.initialValues.length ?? 0) > 0).toBe(true)
    }
  })

  it("declares no screen-scoped product edges on the Shift adapter", () => {
    // Devices inherit edges from the page part their screen composes;
    // screen-scoped declarations are only for unmigrated surfaces.
    expect(shiftLabSurfaceAdapter.inputsForScreen).toBeUndefined()
    expect(shiftLabSurfaceAdapter.eventsForScreen).toBeUndefined()
  })

  it("provides the shared mount + registry path for placed parts", () => {
    expect(shiftLabSurfaceAdapter.partRegistryRoot).toBeTruthy()
    expect(shiftLabSurfaceAdapter.surfacePartMount).toBeTruthy()
  })

  it("never hand-sets battery props on the catalog part path", () => {
    // The production derivation (deviceStateAtom ->
    // shiftPowerDisplayForDeviceState) is the only way a catalog part shows a
    // battery. Design-pass takes may hand-set props (they are synthetic
    // proposals, not catalog parts), so the ban covers lab/adapters only.
    const offenders = walk(LAB_ADAPTERS_ROOT).flatMap(path => {
      const text = readFileSync(path, "utf8")
      return text.includes("shiftBatteryPropsForPowerReading")
        ? [relative(process.cwd(), path)]
        : []
    })
    expect(offenders).toEqual([])
  })
})
