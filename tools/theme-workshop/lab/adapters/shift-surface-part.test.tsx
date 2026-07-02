import { afterEach, describe, expect, it } from "bun:test"
import { unknownDeviceState } from "@platform/device/device-facts"
import { deviceStateAtom } from "@platform/react/device/device-atoms"
import { ShiftPartSurface } from "@product/surfaces/web/shift/mount-shift-part"
import {
  getShiftLiveLaunch,
  setShiftLiveLaunch,
} from "@product/surfaces/web/shift/shift-live-coordinate"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import type { Story } from "../../types"
import {
  clearLabSurfaceRegistries,
  eachLabSurfaceRegistryForScope,
} from "../model/lab-surface-registries"
import { LabPartMount } from "../part-mount/LabPartMount"
import { shiftSurfacePartEvents } from "./shift-edges"
import {
  renderShiftSurfacePart,
  shiftSurfacePartMount,
} from "./shift-surface-part"

/**
 * Proves the Workshop's per-object source/state dropdowns swap real data: a
 * placed Shift Home part renders the chosen fixture library and data state
 * through the real catalog edge, not a baked snapshot.
 */
const homeStory: Story = {
  id: "shift-home",
  layer: "page",
  name: "Home",
  surface: true,
  render: () => null,
}

const gameDetailStory: Story = {
  id: "shift-game-detail-continue",
  layer: "page",
  name: "Game Detail",
  surface: true,
  state: "Continue",
  render: () => <div>Game Detail selected page</div>,
}

const batteryStory: Story = {
  id: "shift-atom-shiftbattery-battery",
  layer: "atom",
  name: "Battery",
  render: () => <div>Pre-baked battery snapshot</div>,
}

const statusBarStory: Story = {
  id: "shift-molecule-shiftstatusbar-status-bar",
  layer: "molecule",
  name: "Status Bar",
  render: () => <div>Pre-baked status bar snapshot</div>,
}

afterEach(() => {
  cleanup()
  clearLabSurfaceRegistries()
})

function mountSpec(
  story: Story,
  binding: Parameters<typeof shiftSurfacePartMount>[1],
  scopeId = "object-part",
) {
  const spec = shiftSurfacePartMount(story, binding)
  if (!spec) throw new Error(`Expected a live mount spec for ${story.name}`)
  return render(
    <LabPartMount
      Root={ShiftPartSurface}
      spec={spec}
      bindingKey={JSON.stringify(binding)}
      scopeId={scopeId}
    />,
  )
}

describe("renderShiftSurfacePart (Workshop edge render)", () => {
  it("renders the dev library at Ready", async () => {
    render(
      <div>
        {renderShiftSurfacePart(homeStory, {
          sourceId: "dev",
          inputValues: { variant: "Ready" },
        })}
      </div>,
    )
    await waitFor(() => {
      expect(screen.queryByText("No games found.")).toBeNull()
    })
  })

  it("renders the cozy library swapped in at the edge", async () => {
    render(
      <div>
        {renderShiftSurfacePart(homeStory, {
          sourceId: "cozy",
          inputValues: { variant: "Ready" },
        })}
      </div>,
    )
    await waitFor(() => {
      expect(screen.getByText("Aurora Drift")).toBeTruthy()
    })
  })

  it("renders the retro library swapped in at the edge", async () => {
    render(
      <div>
        {renderShiftSurfacePart(homeStory, {
          sourceId: "retro",
          inputValues: { variant: "Ready" },
        })}
      </div>,
    )
    await waitFor(() => {
      expect(screen.getByText("Pixel Quest")).toBeTruthy()
    })
  })

  it("honors the chosen data state (Empty) through the edge", async () => {
    render(
      <div>
        {renderShiftSurfacePart(homeStory, {
          sourceId: "cozy",
          inputValues: { variant: "Empty" },
        })}
      </div>,
    )
    await waitFor(() => {
      expect(screen.getByText("No games found.")).toBeTruthy()
    })
  })

  it("produces launch feedback by pressing Play in a render-only Compose object", async () => {
    render(
      <div>
        {renderShiftSurfacePart(homeStory, {
          sourceId: "cozy",
          inputValues: { variant: "Ready" },
        })}
      </div>,
    )

    const firstGame = await screen.findByRole("button", {
      name: /Aurora Drift/i,
    })
    fireEvent.click(firstGame)

    await waitFor(() => {
      expect(screen.getByText("Now playing")).toBeTruthy()
    })
  })

  it("does not publish the launch coordinate from a render-only Compose object", async () => {
    // A board object renders the real composition but supplies no coordinate
    // owner, so it must not race the capture singleton another surface owns.
    setShiftLiveLaunch("Launching")
    render(
      <div>
        {renderShiftSurfacePart(homeStory, {
          sourceId: "cozy",
          inputValues: { variant: "Ready" },
        })}
      </div>,
    )
    await waitFor(() => {
      expect(screen.getByText("Aurora Drift")).toBeTruthy()
    })
    expect(getShiftLiveLaunch()).toBe("Launching")
  })

  it("renders a selected non-Home page part instead of always rendering Home", async () => {
    render(
      <div>
        {renderShiftSurfacePart(gameDetailStory, {
          sourceId: "cozy",
          inputValues: { action: "Continue" },
        })}
      </div>,
    )

    await waitFor(() => {
      expect(screen.getByText("Game Detail selected page")).toBeTruthy()
    })
    expect(screen.queryByRole("button", { name: /Aurora Drift/i })).toBeNull()
  })

  it("combines Data×Foreground: a busy foreground blocks on the Ready page", async () => {
    render(
      <div>
        {renderShiftSurfacePart(homeStory, {
          sourceId: "cozy",
          inputValues: { variant: "Ready", foreground: "Running" },
        })}
      </div>,
    )
    await waitFor(() => {
      expect(screen.getByText("Another game is running")).toBeTruthy()
    })
  })

  it("drives the isolated Battery atom through the production derivation", () => {
    const { container } = mountSpec(batteryStory, {
      sourceId: "dev",
      inputValues: { power: { percent: 64, charging: true } },
    })

    expect(screen.queryByText("Pre-baked battery snapshot")).toBeNull()
    expect(container.querySelector(".lucide-battery-charging")).toBeTruthy()
  })

  it("hides the isolated Battery when device state is Unknown, like production", () => {
    const { container } = mountSpec(batteryStory, {
      sourceId: "dev",
      inputValues: { power: { percent: 64, charging: false } },
    })
    expect(container.querySelector("[class*='lucide-battery']")).toBeTruthy()

    act(() => {
      eachLabSurfaceRegistryForScope("object-part", ({ registry }) =>
        registry.set(deviceStateAtom, unknownDeviceState()),
      )
    })

    expect(container.querySelector("[class*='lucide-battery']")).toBeNull()
  })

  it("does not present a Stale device state as a fresh battery", () => {
    const { container } = mountSpec(batteryStory, {
      sourceId: "dev",
      inputValues: { power: { percent: 64, charging: false } },
    })

    act(() => {
      eachLabSurfaceRegistryForScope("object-part", ({ registry }) =>
        registry.set(deviceStateAtom, {
          observedAt: "2026-07-01T00:00:00.000Z",
          battery: {
            _tag: "Stale",
            lastKnown: {
              _tag: "Ready",
              percent: 64,
              status: "Discharging",
              charging: false,
              supplies: [],
              observedAt: "2026-07-01T00:00:00.000Z",
            },
            message: "battery read timed out",
            observedAt: "2026-07-01T00:00:00.000Z",
          },
        }),
      )
    })

    // Production hides a stale battery rather than presenting it as fresh.
    expect(container.querySelector("[class*='lucide-battery']")).toBeNull()
  })

  it("drives Status Bar power through its real Battery child via device state", () => {
    const { container } = mountSpec(statusBarStory, {
      sourceId: "dev",
      inputValues: { power: { percent: 12, charging: false } },
    })

    expect(screen.queryByText("Pre-baked status bar snapshot")).toBeNull()
    expect(container.querySelector(".lucide-battery-low")).toBeTruthy()
  })

  it("drives Status Bar clock text through the real Status Bar molecule", () => {
    mountSpec(statusBarStory, {
      sourceId: "dev",
      inputValues: { clock: "2026-06-30T23:08:00.000Z" },
    })

    expect(screen.queryByText("Pre-baked status bar snapshot")).toBeNull()
    expect(screen.getByText("11:08 PM")).toBeTruthy()
  })

  it("drives Status Bar network status through the real Status Bar molecule", () => {
    const { container } = mountSpec(statusBarStory, {
      sourceId: "dev",
      inputValues: { network: { _tag: "Disconnected" } },
    })

    expect(screen.queryByText("Pre-baked status bar snapshot")).toBeNull()
    expect(container.querySelector(".lucide-wifi-off")).toBeTruthy()
  })

  it("canonicalizes a malformed battery event payload instead of crashing", () => {
    const { container } = mountSpec(batteryStory, {
      sourceId: "dev",
      inputValues: { power: { percent: 12, charging: false } },
    })
    expect(container.querySelector(".lucide-battery-low")).toBeTruthy()

    const battery = shiftSurfacePartEvents(batteryStory).find(
      event => event.id === "battery",
    )
    expect(battery).toBeTruthy()
    act(() => {
      battery?.emit("garbage", { scopeId: "object-part" })
    })

    // Falls back to the canonical default reading (64%, not charging).
    expect(container.querySelector("[class*='lucide-battery']")).toBeTruthy()
    expect(container.querySelector(".lucide-battery-low")).toBeNull()
  })

  it("swaps a placed Library variant's data at the real games input", async () => {
    const libraryGridStory: Story = {
      id: "shift-library-grid-ready",
      layer: "page",
      name: "Library — Grid",
      surface: true,
      state: "Ready",
      render: () => <div>Pre-baked library snapshot</div>,
    }

    render(
      <div>
        {renderShiftSurfacePart(libraryGridStory, {
          sourceId: "cozy",
          inputValues: {},
        })}
      </div>,
    )

    expect(screen.queryByText("Pre-baked library snapshot")).toBeNull()
    expect(await screen.findByText("Aurora Drift")).toBeTruthy()
  })

  it("renders a Library variant's Empty state through the real component", () => {
    const emptyStory: Story = {
      id: "shift-library-grid-empty",
      layer: "page",
      name: "Library — Grid",
      surface: true,
      state: "Empty",
      render: () => null,
    }

    const { container } = render(
      <div>
        {renderShiftSurfacePart(emptyStory, {
          sourceId: "cozy",
          inputValues: {},
        })}
      </div>,
    )

    expect(container.querySelector(".shift-lib-empty")).toBeTruthy()
  })

  it("exposes battery-only events on the Battery atom and both on Status Bar", () => {
    expect(shiftSurfacePartEvents(batteryStory).map(event => event.id)).toEqual(
      ["battery"],
    )
    expect(
      shiftSurfacePartEvents(statusBarStory).map(event => event.id),
    ).toEqual(["battery", "network"])
  })

  it("feeds Home power through the full Home page's real Status Bar", async () => {
    const { container } = render(
      <div>
        {renderShiftSurfacePart(homeStory, {
          sourceId: "cozy",
          inputValues: {
            variant: "Ready",
            foreground: "Ready",
            power: { percent: 64, charging: true },
          },
        })}
      </div>,
    )

    await waitFor(() => {
      expect(screen.getByText("Aurora Drift")).toBeTruthy()
    })
    expect(container.querySelector(".lucide-battery-charging")).toBeTruthy()
  })

  it("feeds Home clock text through the full Home page's real Status Bar", async () => {
    render(
      <div>
        {renderShiftSurfacePart(homeStory, {
          sourceId: "cozy",
          inputValues: {
            variant: "Ready",
            foreground: "Ready",
            clock: "2026-06-30T09:41:00.000Z",
          },
        })}
      </div>,
    )

    await waitFor(() => {
      expect(screen.getByText("Aurora Drift")).toBeTruthy()
    })
    expect(screen.getByText("9:41 AM")).toBeTruthy()
  })

  it("feeds Home network status through the full Home page's real Status Bar", async () => {
    const { container } = render(
      <div>
        {renderShiftSurfacePart(homeStory, {
          sourceId: "cozy",
          inputValues: {
            variant: "Ready",
            foreground: "Ready",
            network: { _tag: "Disconnected" },
          },
        })}
      </div>,
    )

    await waitFor(() => {
      expect(screen.getByText("Aurora Drift")).toBeTruthy()
    })
    expect(container.querySelector(".lucide-wifi-off")).toBeTruthy()
  })
})
