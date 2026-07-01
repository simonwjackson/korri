import { afterEach, describe, expect, it } from "bun:test"
import { useAtomValue } from "@effect/atom-react"
import { ShiftPartSurface } from "@product/surfaces/web/shift/mount-shift-part"
import { shiftClockIsoAtom } from "@product/surfaces/web/shift/shift-clock-state"
import { act, cleanup, render, screen } from "@testing-library/react"
import {
  clearLabSurfaceRegistries,
  eachLabSurfaceRegistryForScope,
  type LabSurfaceRegistryEntry,
  registerLabSurfaceRegistry,
} from "../model/lab-surface-registries"
import type { LabSurfacePartMountSpec } from "../surface-registry"
import { LabPartMount } from "./LabPartMount"

/**
 * Proves a placed part mounts through the SAME real mount + scoped registry
 * path a live device uses: the part's subtree reads real atoms from a fresh
 * registry, the registry is registered in the lab hub under the object's
 * scope, and edges (axis/input/event writes) drive the real atoms live.
 */

const ISO_A = "2026-06-30T09:41:00.000Z"
const ISO_B = "2026-06-30T23:08:00.000Z"

function ClockText({ prefix }: { readonly prefix: string }) {
  return (
    <div>
      {prefix}:{useAtomValue(shiftClockIsoAtom)}
    </div>
  )
}

function clockSpec(prefix: string, iso: string): LabSurfacePartMountSpec {
  return {
    initialValues: [[shiftClockIsoAtom, iso]] as unknown as ReadonlyArray<
      readonly [
        import("effect/unstable/reactivity/Atom").Atom<unknown>,
        unknown,
      ]
    >,
    node: <ClockText prefix={prefix} />,
  }
}

function entriesForScope(scopeId: string): LabSurfaceRegistryEntry[] {
  const found: LabSurfaceRegistryEntry[] = []
  eachLabSurfaceRegistryForScope(scopeId, entry => found.push(entry))
  return found
}

afterEach(() => {
  cleanup()
  clearLabSurfaceRegistries()
})

describe("LabPartMount", () => {
  it("mounts the part's real subtree on a registered scoped registry", () => {
    render(
      <LabPartMount
        Root={ShiftPartSurface}
        spec={clockSpec("part", ISO_A)}
        bindingKey="a"
        scopeId="object-1"
      />,
    )

    expect(screen.getByText(`part:${ISO_A}`)).toBeTruthy()
    expect(entriesForScope("object-1")).toHaveLength(1)
  })

  it("drives the mounted part live through the registered registry", () => {
    render(
      <LabPartMount
        Root={ShiftPartSurface}
        spec={clockSpec("part", ISO_A)}
        bindingKey="a"
        scopeId="object-1"
      />,
    )

    act(() => {
      eachLabSurfaceRegistryForScope("object-1", ({ registry }) =>
        registry.set(shiftClockIsoAtom, ISO_B),
      )
    })

    expect(screen.getByText(`part:${ISO_B}`)).toBeTruthy()
  })

  it("unregisters its registry on unmount", () => {
    const { unmount } = render(
      <LabPartMount
        Root={ShiftPartSurface}
        spec={clockSpec("part", ISO_A)}
        bindingKey="a"
        scopeId="object-1"
      />,
    )
    expect(entriesForScope("object-1")).toHaveLength(1)

    unmount()

    expect(entriesForScope("object-1")).toHaveLength(0)
  })

  it("gives two placed parts independent scoped registries", () => {
    render(
      <>
        <LabPartMount
          Root={ShiftPartSurface}
          spec={clockSpec("one", ISO_A)}
          bindingKey="a"
          scopeId="object-1"
        />
        <LabPartMount
          Root={ShiftPartSurface}
          spec={clockSpec("two", ISO_A)}
          bindingKey="a"
          scopeId="object-2"
        />
      </>,
    )

    act(() => {
      eachLabSurfaceRegistryForScope("object-1", ({ registry }) =>
        registry.set(shiftClockIsoAtom, ISO_B),
      )
    })

    expect(screen.getByText(`one:${ISO_B}`)).toBeTruthy()
    expect(screen.getByText(`two:${ISO_A}`)).toBeTruthy()
  })

  it("re-seeds the live registry on binding change without re-registering", () => {
    const { rerender } = render(
      <LabPartMount
        Root={ShiftPartSurface}
        spec={clockSpec("part", ISO_A)}
        bindingKey="a"
        scopeId="object-1"
      />,
    )
    const before = entriesForScope("object-1")
    expect(before).toHaveLength(1)

    rerender(
      <LabPartMount
        Root={ShiftPartSurface}
        spec={clockSpec("part", ISO_B)}
        bindingKey="b"
        scopeId="object-1"
      />,
    )

    expect(screen.getByText(`part:${ISO_B}`)).toBeTruthy()
    const after = entriesForScope("object-1")
    expect(after).toHaveLength(1)
    expect(after[0]?.registry).toBe(before[0]?.registry)
  })

  it("keeps the mount-time seed for release even after re-seeding", () => {
    const { rerender } = render(
      <LabPartMount
        Root={ShiftPartSurface}
        spec={clockSpec("part", ISO_A)}
        bindingKey="a"
        scopeId="object-1"
      />,
    )
    rerender(
      <LabPartMount
        Root={ShiftPartSurface}
        spec={clockSpec("part", ISO_B)}
        bindingKey="b"
        scopeId="object-1"
      />,
    )

    const [entry] = entriesForScope("object-1")
    expect(entry?.seed.get(shiftClockIsoAtom)).toBe(ISO_A)
  })

  it("does not clobber another scope's registered registry", () => {
    const deviceEntry: LabSurfaceRegistryEntry = {
      scopeId: "device-1",
      registry: {} as LabSurfaceRegistryEntry["registry"],
      seed: new Map(),
    }
    registerLabSurfaceRegistry(deviceEntry)

    const { unmount } = render(
      <LabPartMount
        Root={ShiftPartSurface}
        spec={clockSpec("part", ISO_A)}
        bindingKey="a"
        scopeId="object-1"
      />,
    )
    expect(entriesForScope("device-1")).toHaveLength(1)
    expect(entriesForScope("object-1")).toHaveLength(1)

    unmount()

    expect(entriesForScope("device-1")).toHaveLength(1)
  })
})
