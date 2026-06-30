import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { useState } from "react"
import type { Story } from "../../types"
import { LabContext, type LabContextValue } from "../Lab.context"
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
  initialCanvasView: "compose",
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
}: {
  readonly initial: readonly LabObjectInstance[]
  readonly command?: LabWorkshopCommandSignal | null
  readonly selectedId?: string | null
}) {
  const [instances, setInstances] = useState(initial)
  return (
    <LabContext.Provider value={context}>
      <LabWorkshopBoard
        instances={instances}
        stories={stories}
        tool="select"
        command={command}
        screenId={null}
        selectedId={selectedId}
        onSelect={() => undefined}
        onInstancesChange={setInstances}
      />
      <div data-testid="dump">{JSON.stringify(instances)}</div>
    </LabContext.Provider>
  )
}

function dumped(): readonly LabObjectInstance[] {
  return JSON.parse(screen.getByTestId("dump").textContent ?? "[]")
}

function instance(
  id: string,
  extra: Partial<LabObjectInstance> = {},
): LabObjectInstance {
  return {
    id,
    storyId: "pill",
    sourceId: "dev",
    stateGroupValues: {},
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

describe("LabWorkshopBoard placement", () => {
  it("persists a grid-pattern position for a newly added part, anchored to the view", async () => {
    setLabPlacementPattern("grid")
    render(
      <Harness
        initial={[instance("far", { x: -5000, y: -5000 }), instance("new")]}
      />,
    )

    await waitFor(() => {
      const added = dumped().find(item => item.id === "new")
      expect(added?.x).toBeTypeOf("number")
    })

    const expected = placeNext(
      "grid",
      [{ x: -5000, y: -5000, w: PLACEMENT_CELL.w, h: PLACEMENT_CELL.h }],
      anchor,
      PLACEMENT_CELL,
    )
    const added = dumped().find(item => item.id === "new")
    expect({ x: added?.x, y: added?.y }).toEqual(expected)
    // The far, already-positioned card is left exactly where it was.
    expect(dumped().find(item => item.id === "far")).toMatchObject({
      x: -5000,
      y: -5000,
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
})
