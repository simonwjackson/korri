import { afterEach, describe, expect, test } from "bun:test"
import { act, waitFor } from "@testing-library/react"
import type { SurfaceModel } from "@contracts/surface/korri-surface"
import {
  createFixtureHost,
  fixtureModel,
} from "../src/fixtures/fixture-host"
import { shiftSurface } from "../src/mount"

const model = (overrides: Partial<SurfaceModel> = {}): SurfaceModel => ({
  ...fixtureModel,
  ...overrides,
})

const mounted: Array<ReturnType<typeof shiftSurface.mount>> = []

afterEach(async () => {
  for (const instance of mounted.splice(0)) {
    await act(async () => instance.unmount())
  }
  document.body.replaceChildren()
})

describe("shiftSurface mount contract", () => {
  test("mount renders the supplied model and preserves the supplied host", async () => {
    const host = createFixtureHost()
    const container = document.createElement("div")
    document.body.append(container)

    let instance: ReturnType<typeof shiftSurface.mount>
    await act(async () => {
      instance = shiftSurface.mount(container, model(), host)
      mounted.push(instance)
    })

    expect(container.textContent).toContain("Skate 3")
    container
      .querySelector<HTMLButtonElement>('button[aria-label="Skate 3"]')
      ?.click()

    expect(host.calls).toEqual(["launch:now-playing:L1"])
  })

  test("update replaces the visible model and later commands use the updated ids", async () => {
    const host = createFixtureHost()
    const container = document.createElement("div")
    document.body.append(container)
    const next = model({
      catalog: {
        _tag: "Ready",
        games: [
          {
            id: "local-game:lumines",
            title: "Lumines",
            section: "This device",
          },
        ],
      },
    })

    let instance: ReturnType<typeof shiftSurface.mount>
    await act(async () => {
      instance = shiftSurface.mount(container, model(), host)
      mounted.push(instance)
    })
    await act(async () => instance.update(next))

    await waitFor(() => {
      expect(container.textContent).toContain("Lumines")
      expect(container.textContent).not.toContain("Skate 3")
    })
    container
      .querySelector<HTMLButtonElement>('button[aria-label="Lumines"]')
      ?.click()

    expect(host.calls).toEqual(["launch:local-game:lumines"])
  })

  test("unmount removes content and subscriptions", async () => {
    const host = createFixtureHost()
    const container = document.createElement("div")
    document.body.append(container)

    let instance: ReturnType<typeof shiftSurface.mount>
    await act(async () => {
      instance = shiftSurface.mount(
        container,
        model({
          status: {
            _tag: "Problem",
            kicker: "Couldn't start",
            reason: "offline",
            canRetry: false,
          },
        }),
        host,
      )
    })

    expect(container.textContent).toContain("offline")
    await act(async () => instance.unmount())
    expect(container.textContent).toBe("")

    act(() => host.press("back"))
    expect(host.calls).toEqual([])
  })
})
