import { afterEach, describe, expect, it, mock } from "bun:test"
import { cleanup, render, screen } from "@testing-library/react"
import {
  SHIFT_STORE_UNGETABLE_MESSAGE,
  ShiftStoreDetail,
  shiftStoreEntryGetable,
} from "./ShiftStoreDetail"
import type { ShiftStoreEntry } from "./shift-store-entry"

afterEach(() => cleanup())

const baseEntry: ShiftStoreEntry = {
  id: "@local:coolrom:mario",
  title: "Super Mario All-Stars",
  artUrl: "art.png",
  sources: ["CoolROM"],
  genre: "Platformer",
  platform: "SNES",
  developer: "Nintendo",
  status: "available",
  providerId: "@local:coolrom",
  providerItemId: "mario",
  claimUrl: "https://roms.example.com/mario",
  system: "snes",
}

describe("shiftStoreEntryGetable", () => {
  it("offers Get only when the claim carries a library system", () => {
    expect(shiftStoreEntryGetable(baseEntry)).toBe(true)
    const { system: _system, ...rest } = baseEntry
    expect(shiftStoreEntryGetable(rest)).toBe(false)
    expect(shiftStoreEntryGetable({ ...rest, status: "ready" })).toBe(true)
  })
})

describe("ShiftStoreDetail unGetable state", () => {
  it("shows Get for claims with a system", () => {
    render(<ShiftStoreDetail entry={baseEntry} onPrimary={mock()} />)
    expect(screen.getByRole("button", { name: /get/i })).toBeTruthy()
    expect(screen.queryByText(SHIFT_STORE_UNGETABLE_MESSAGE)).toBeNull()
  })

  it("explains instead of offering Get when the source omits the console", () => {
    const { system: _system, ...withoutSystem } = baseEntry
    render(<ShiftStoreDetail entry={withoutSystem} onPrimary={mock()} />)
    expect(screen.queryByRole("button", { name: /get/i })).toBeNull()
    expect(screen.getByText(SHIFT_STORE_UNGETABLE_MESSAGE)).toBeTruthy()
  })
})
