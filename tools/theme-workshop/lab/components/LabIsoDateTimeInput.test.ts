import { describe, expect, it } from "bun:test"
import {
  dateTimeLocalValueToIso,
  isoToDateTimeLocalValue,
} from "./LabIsoDateTimeInput"

describe("LabIsoDateTimeInput helpers", () => {
  it("renders an ISO date as a UTC datetime-local value", () => {
    expect(isoToDateTimeLocalValue("2026-06-30T16:24:00.000Z")).toBe(
      "2026-06-30T16:24",
    )
  })

  it("stores datetime-local input as an ISO UTC date", () => {
    expect(dateTimeLocalValueToIso("2026-06-30T16:24")).toBe(
      "2026-06-30T16:24:00.000Z",
    )
  })

  it("ignores invalid values", () => {
    expect(isoToDateTimeLocalValue("nope")).toBe("")
    expect(dateTimeLocalValueToIso("nope")).toBeNull()
  })
})
