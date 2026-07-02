import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { useState } from "react"
import type { Story } from "../../types"
import type { LabDesignPassStoryMeta } from "../design-pass/design-pass-model"
import { LabContext, type LabContextValue } from "../Lab.context"
import type { LabCanvasObject } from "../model/lab-canvas-object"
import {
  PLACEMENT_CELL,
  placeNext,
  repackPositions,
} from "../model/lab-canvas-placement"
import {
  DEFAULT_CAMERA,
  frameCameraOn,
  type LabObjectInstance,
  type LabWorkshopCommandSignal,
} from "../model/lab-canvas-state"
import {
  resetLabPlacementPatternForTest,
  setLabPlacementPattern,
} from "../model/lab-placement-store"
import type { LabPreviewSelection } from "../model/lab-preview-selection"
import { LabWorkshopBoard } from "./LabWorkshopBoard"

const VIEWPORT = { width: 1000, height: 600 }

const pill: Story = {
  id: "pill",
  layer: "atom",
  name: "Pill",
  render: () => <span>pill</span>,
}
const stories = new Map([[pill.id, pill]])

const calibration: LabContextValue["calibration"] = {
  setPxPerMm: () => undefined,
  patchDevice: () => undefined,
  addDevice: () => undefined,
  removeDevice: () => undefined,
  setKnob: () => undefined,
  reset: () => undefined,
  storageKey: "test",
}

const context: LabContextValue = {
  adapter: {
    id: "test",
    devices: [],
    makeSeedInitialValues: async () => ({}),
    mountSurface: () => ({ router: {}, dispose: () => undefined }),
  } as unknown as LabContextValue["adapter"],
  initialValues: {},
  themeId: "test",
  surfacePath: "/",
  screens: [],
  selection: { kind: "set", ids: [] },
  devices: [],
  selectedDevices: [],
  pxPerMm: 1,
  knobValues: {},
  calibration,
  setDevicesSegment: () => undefined,
  setThemeId: () => undefined,
  setSurfacePath: () => undefined,
}

function Harness({
  initial,
  command = null,
  selectedId = null,
  pickMode = false,
  onSelect = () => undefined,
  onInnerSelect = () => undefined,
  designPassMetaById = new Map(),
  onDeleteTake = () => undefined,
  onPromoteTake = () => undefined,
}: {
  readonly initial: readonly LabCanvasObject[]
  readonly command?: LabWorkshopCommandSignal | null
  readonly selectedId?: string | null
  readonly pickMode?: boolean
  readonly onSelect?: (id: string | null) => void
  readonly onInnerSelect?: (selection: LabPreviewSelection | null) => void
  readonly designPassMetaById?: ReadonlyMap<string, LabDesignPassStoryMeta>
  readonly onDeleteTake?: (storyId: string) => void
  readonly onPromoteTake?: (storyId: string) => void
}) {
  const [instances, setInstances] =
    useState<readonly LabCanvasObject[]>(initial)
  return (
    <LabContext.Provider value={context}>
      <LabWorkshopBoard
        objects={instances}
        stories={stories}
        designPassMetaById={designPassMetaById}
        tool="select"
        command={command}
        screenId={null}
        selectedId={selectedId}
        pickMode={pickMode}
        innerSelection={
          pickMode ? { scopeId: "first", targets: [], activeIndex: 0 } : null
        }
        onSelect={onSelect}
        onInnerSelect={onInnerSelect}
        onDeleteTake={onDeleteTake}
        onPromoteTake={onPromoteTake}
        sourceId="dev"
        stateId="ready"
        onObjectsChange={setInstances}
      />
      <div data-testid="dump">{JSON.stringify(instances)}</div>
    </LabContext.Provider>
  )
}

function dumped(): readonly LabCanvasObject[] {
  return JSON.parse(screen.getByTestId("dump").textContent ?? "[]")
}

function instance(
  id: string,
  extra: Partial<LabObjectInstance> = {},
): LabObjectInstance {
  return {
    kind: "placed-part",
    id,
    storyId: "pill",
    sourceId: "dev",
    inputValues: {},
    ...extra,
  }
}

let rafDescriptor: PropertyDescriptor | undefined
let cafDescriptor: PropertyDescriptor | undefined

beforeEach(() => {
  resetLabPlacementPatternForTest()
  rafDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "requestAnimationFrame",
  )
  cafDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "cancelAnimationFrame",
  )
  // Run the tween synchronously so the camera reaches its target deterministically.
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    value: (cb: FrameRequestCallback) => {
      cb(0)
      return 0
    },
  })
  Object.defineProperty(globalThis, "cancelAnimationFrame", {
    configurable: true,
    value: () => undefined,
  })
  // happy-dom has no pointer-capture implementation; the board's pan path
  // calls these on real browsers.
  if (!HTMLElement.prototype.setPointerCapture) {
    HTMLElement.prototype.setPointerCapture = () => undefined
    HTMLElement.prototype.releasePointerCapture = () => undefined
    HTMLElement.prototype.hasPointerCapture = () => false
  }
  spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    top: 0,
    left: 0,
    right: VIEWPORT.width,
    bottom: VIEWPORT.height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect)
})

afterEach(() => {
  cleanup()
  mock.restore()
  resetLabPlacementPatternForTest()
  if (rafDescriptor) {
    Object.defineProperty(globalThis, "requestAnimationFrame", rafDescriptor)
  }
  if (cafDescriptor) {
    Object.defineProperty(globalThis, "cancelAnimationFrame", cafDescriptor)
  }
})

const anchor = {
  x: VIEWPORT.width / 2 - DEFAULT_CAMERA.x,
  y: VIEWPORT.height / 2 - DEFAULT_CAMERA.y,
}

describe("LabWorkshopBoard interaction bar", () => {
  it("attaches the ask controls to the selected placed part", () => {
    render(
      <Harness
        initial={[instance("first", { x: 20, y: 30 })]}
        selectedId="first"
      />,
    )

    expect(screen.getByLabelText("Design with Pill")).toBeTruthy()
    expect(screen.getByLabelText("Design intent for Pill")).toHaveProperty(
      "value",
      "Make this feel less cramped",
    )
    expect(screen.getByLabelText("Generate 3 takes for Pill")).toBeTruthy()
  })

  it("offers true delete only for Take cards", () => {
    const deleted: string[] = []
    render(
      <Harness
        initial={[instance("first", { x: 20, y: 30 })]}
        selectedId="first"
        designPassMetaById={
          new Map([
            [
              "pill",
              {
                role: "take",
                passId: "test-pass",
                passName: "Test pass",
              },
            ],
          ])
        }
        onDeleteTake={storyId => deleted.push(storyId)}
      />,
    )

    fireEvent.click(screen.getByLabelText("Delete Take Pill"))

    expect(deleted).toEqual(["pill"])
  })

  it("promotes Take cards", () => {
    const promoted: string[] = []
    render(
      <Harness
        initial={[instance("first", { x: 20, y: 30 })]}
        selectedId="first"
        designPassMetaById={
          new Map([
            [
              "pill",
              {
                role: "take",
                passId: "test-pass",
                passName: "Test pass",
              },
            ],
          ])
        }
        onPromoteTake={storyId => promoted.push(storyId)}
      />,
    )

    fireEvent.click(screen.getByLabelText("Promote Take Pill"))

    expect(promoted).toEqual(["pill"])
  })

  it("shows promoted Take cards as ordinary part cards", () => {
    render(
      <Harness
        initial={[instance("first", { x: 20, y: 30 })]}
        selectedId="first"
        designPassMetaById={
          new Map([
            [
              "pill",
              {
                role: "take",
                passId: "test-pass",
                passName: "Test pass",
                promoted: true,
              },
            ],
          ])
        }
      />,
    )

    expect(screen.queryByLabelText("Promote Take Pill")).toBeNull()
    expect(screen.queryByText("Promoted")).toBeNull()
    expect(screen.queryByText("Take")).toBeNull()
  })

  it("hides the ask controls when no placed part is selected", () => {
    render(<Harness initial={[instance("first", { x: 20, y: 30 })]} />)

    expect(screen.queryByLabelText("Design with Pill")).toBeNull()
  })
})

describe("LabWorkshopBoard placement", () => {
  it("continues the grid lattice from the cluster's top-left, on the same row", async () => {
    setLabPlacementPattern("grid")
    render(
      <Harness
        initial={[instance("first", { x: 0, y: 0 }), instance("new")]}
      />,
    )

    await waitFor(() => {
      const added = dumped().find(item => item.id === "new")
      expect(added?.x).toBeTypeOf("number")
    })

    // Anchor is the existing card's top-left (0,0); slot 0 is taken, so the new
    // card lands one column to the right on the SAME row — no diagonal drift.
    const expected = placeNext(
      "grid",
      [{ x: 0, y: 0, w: PLACEMENT_CELL.w, h: PLACEMENT_CELL.h }],
      { x: 0, y: 0 },
      PLACEMENT_CELL,
    )
    const added = dumped().find(item => item.id === "new")
    expect({ x: added?.x, y: added?.y }).toEqual(expected)
    expect(added?.y).toBe(0)
    expect((added?.x ?? 0) > 0).toBe(true)
    // The first, already-positioned card is left exactly where it was.
    expect(dumped().find(item => item.id === "first")).toMatchObject({
      x: 0,
      y: 0,
    })
  })

  it("repacks with the active pattern when Tidy runs", async () => {
    setLabPlacementPattern("spiral")
    render(
      <Harness
        initial={[
          instance("a", { x: 10, y: 10 }),
          instance("b", { x: 20, y: 20 }),
        ]}
        command={{ id: 1, command: "tidy" }}
      />,
    )

    const expected = repackPositions("spiral", 2, anchor, PLACEMENT_CELL)
    await waitFor(() => {
      expect(dumped().find(item => item.id === "a")?.x).toBe(expected[0]?.x)
    })
    expect(dumped().map(item => ({ x: item.x, y: item.y }))).toEqual([
      expected[0],
      expected[1],
    ])
  })

  it("tidies mixed live-device and placed-part bounds without overlap", async () => {
    setLabPlacementPattern("grid")
    render(
      <Harness
        initial={[
          {
            kind: "live-device",
            id: "device",
            deviceId: "thor",
            inputValues: {},
            measuredSize: { w: 900, h: 480 },
            x: 10,
            y: 10,
          },
          instance("part", { x: 20, y: 20 }),
        ]}
        command={{ id: 1, command: "tidy" }}
      />,
    )

    await waitFor(() => {
      expect(dumped().find(item => item.id === "device")?.x).not.toBe(10)
    })
    const device = dumped().find(item => item.id === "device")
    const part = dumped().find(item => item.id === "part")
    expect(device?.x).toBeTypeOf("number")
    expect(part?.x).toBeGreaterThanOrEqual((device?.x ?? 0) + 900)
  })
})

describe("LabWorkshopBoard pinch zoom", () => {
  function cam(): HTMLElement {
    return document.querySelector(".pt-cam") as HTMLElement
  }
  function zoomLayer(): HTMLElement {
    return document.querySelector(".pt-cam-zoom") as HTMLElement
  }
  function board(): Element {
    return document.querySelector(".pt-board-free") as Element
  }
  function touch(
    type: "pointerDown" | "pointerMove" | "pointerUp",
    pointerId: number,
    clientX: number,
    clientY: number,
  ) {
    fireEvent[type](board(), {
      pointerId,
      pointerType: "touch",
      clientX,
      clientY,
    })
  }

  it("zooms around the pinch midpoint as the fingers spread", () => {
    render(<Harness initial={[instance("one", { x: 100, y: 40 })]} />)

    touch("pointerDown", 1, 400, 300)
    touch("pointerDown", 2, 600, 300)
    // Spread: A moves left, widening the gap to 300px (ratio 1.5) and moving
    // the midpoint to (450, 300).
    touch("pointerMove", 1, 300, 300)

    // scale 1.5; world point under the start midpoint (476, 276) pinned under
    // the moving midpoint: 450 - 476*1.5 = -264, 300 - 276*1.5 = -114.
    expect(zoomLayer().style.zoom).toBe("1.5")
    expect(cam().style.transform).toBe("translate(-264px, -114px)")
  })

  it("keeps pan and zoom on separate layers so the anchor math holds", () => {
    // `zoom` multiplies the element's own computed lengths: if the camera
    // translate shared the zoomed element, the pan offset itself would be
    // scaled and every zoom anchor would drift. The translate layer must
    // carry no zoom, and the zoom layer no transform.
    render(<Harness initial={[instance("one", { x: 100, y: 40 })]} />)

    touch("pointerDown", 1, 400, 300)
    touch("pointerDown", 2, 600, 300)
    touch("pointerMove", 1, 300, 300)

    expect(cam().style.zoom ?? "").toBe("")
    expect(zoomLayer().style.transform ?? "").toBe("")
    expect(zoomLayer().parentElement).toBe(cam())
  })

  it("pans with a two-finger drag without changing scale", () => {
    render(<Harness initial={[instance("one", { x: 100, y: 40 })]} />)

    touch("pointerDown", 1, 400, 300)
    touch("pointerDown", 2, 600, 300)
    touch("pointerMove", 1, 500, 300)
    touch("pointerMove", 2, 700, 300)

    // Distance is back to 200 (ratio 1); midpoint moved +100 — the camera
    // projects absolutely from the gesture start, so no drift accumulates.
    expect(zoomLayer().style.zoom).toBe("1")
    expect(cam().style.transform).toBe("translate(124px, 24px)")
  })

  it("ends the pinch when a finger lifts", () => {
    render(<Harness initial={[instance("one", { x: 100, y: 40 })]} />)

    touch("pointerDown", 1, 400, 300)
    touch("pointerDown", 2, 600, 300)
    touch("pointerMove", 1, 300, 300)
    const frozen = cam().style.transform
    touch("pointerUp", 2, 600, 300)

    touch("pointerMove", 1, 100, 300)
    expect(cam().style.transform).toBe(frozen)
    expect(zoomLayer().style.zoom).toBe("1.5")
  })

  it("bails out of the pinch when a third finger lands", () => {
    render(<Harness initial={[instance("one", { x: 100, y: 40 })]} />)

    touch("pointerDown", 1, 400, 300)
    touch("pointerDown", 2, 600, 300)
    touch("pointerDown", 3, 500, 400)
    touch("pointerMove", 1, 300, 300)

    expect(zoomLayer().style.zoom).toBe("1")
    expect(cam().style.transform).toBe(
      `translate(${DEFAULT_CAMERA.x}px, ${DEFAULT_CAMERA.y}px)`,
    )
  })
})

describe("LabWorkshopBoard selection framing", () => {
  function cameraTransform(): string {
    const cam = document.querySelector(".pt-cam") as HTMLElement | null
    return cam?.style.transform ?? ""
  }

  it("frames a selected off-screen card", async () => {
    render(
      <Harness
        initial={[instance("off", { x: 2000, y: 2000 })]}
        selectedId="off"
      />,
    )

    const target = frameCameraOn(
      DEFAULT_CAMERA,
      { x: 2000, y: 2000, w: PLACEMENT_CELL.w, h: PLACEMENT_CELL.h },
      { w: VIEWPORT.width, h: VIEWPORT.height },
    )
    await waitFor(() => {
      expect(cameraTransform()).toBe(`translate(${target.x}px, ${target.y}px)`)
    })
  })

  it("leaves the camera put when the selected card is already visible", async () => {
    render(
      <Harness
        initial={[instance("here", { x: 100, y: 40 })]}
        selectedId="here"
      />,
    )

    // A short settle window; the camera must remain at the default.
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(cameraTransform()).toBe(
      `translate(${DEFAULT_CAMERA.x}px, ${DEFAULT_CAMERA.y}px)`,
    )
  })

  it("clears only inner selection on empty-board clicks while picking", () => {
    const selected: (string | null)[] = []
    const inner: (LabPreviewSelection | null)[] = []
    render(
      <Harness
        initial={[instance("first", { x: 100, y: 40 })]}
        selectedId="first"
        pickMode
        onSelect={id => selected.push(id)}
        onInnerSelect={selection => inner.push(selection)}
      />,
    )

    fireEvent.pointerDown(document.querySelector(".pt-board-free") as Element)

    expect(selected).toEqual([])
    expect(inner).toEqual([null])
  })
})
