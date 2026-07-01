import { describe, expect, it } from "bun:test"
import {
  activePreviewTarget,
  previewSelectionFromEventTarget,
  selectPreviewTargetIndex,
} from "./lab-preview-selection"

describe("lab preview selection", () => {
  it("reads the clicked part stack from nearest child to parent", () => {
    const page = document.createElement("section")
    page.setAttribute("data-korri-part", "shift.home")
    page.setAttribute("data-korri-layer", "page")
    page.setAttribute("data-korri-name", "Home")
    const organism = document.createElement("div")
    organism.setAttribute("data-korri-part", "shift.cine-hero")
    organism.setAttribute("data-korri-layer", "organism")
    organism.setAttribute("data-korri-name", "Hero")
    organism.setAttribute("data-korri-instance-id", "hollow-knight")
    const atom = document.createElement("button")
    atom.setAttribute("data-korri-part", "shift.launch-button")
    atom.setAttribute("data-korri-layer", "atom")
    atom.setAttribute("data-korri-name", "Launch Button")

    page.append(organism)
    organism.append(atom)

    const selection = previewSelectionFromEventTarget(atom, "thor:primary")

    expect(selection?.scopeId).toBe("thor:primary")
    expect(selection?.activeIndex).toBe(0)
    expect(selection?.targets).toEqual([
      { partId: "shift.launch-button", layer: "atom", name: "Launch Button" },
      {
        partId: "shift.cine-hero",
        layer: "organism",
        name: "Hero",
        instanceId: "hollow-knight",
      },
      { partId: "shift.home", layer: "page", name: "Home" },
    ])
  })

  it("selects a parent target from the same stack", () => {
    const parent = document.createElement("div")
    parent.setAttribute("data-korri-part", "shift.status-bar")
    parent.setAttribute("data-korri-layer", "molecule")
    parent.setAttribute("data-korri-name", "Status Bar")
    const child = document.createElement("svg")
    child.setAttribute("data-korri-part", "shift.battery")
    child.setAttribute("data-korri-layer", "atom")
    child.setAttribute("data-korri-name", "Battery")
    parent.append(child)

    const selection = previewSelectionFromEventTarget(child, "thor:primary")
    if (!selection) throw new Error("expected selection")

    expect(activePreviewTarget(selection)?.name).toBe("Battery")
    expect(
      activePreviewTarget(selectPreviewTargetIndex(selection, 1))?.name,
    ).toBe("Status Bar")
  })
})
