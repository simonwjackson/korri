import { describe, expect, test } from "bun:test"
import { DataError, isApiError, NotFoundError, ValidationError } from "./errors"

describe("RPC Error Schemas", () => {
  test("DataError creates with correct tag and fields", () => {
    const err = new DataError({
      reason: "Unavailable",
      message: "Data source unavailable",
    })

    expect(err._tag).toBe("DataError")
    expect(err.reason).toBe("Unavailable")
    expect(err.message).toBe("Data source unavailable")
  })

  test("DataError supports optional code field", () => {
    const err = new DataError({
      reason: "ReadFailed",
      message: "read failed",
      code: "E_READ",
    })

    expect(err.code).toBe("E_READ")
  })

  test("shared typed errors carry discriminant tags", () => {
    const errors = [
      new DataError({ reason: "WriteFailed", message: "write failed" }),
      new NotFoundError({ message: "not found" }),
      new ValidationError({ message: "bad input" }),
    ]

    for (const err of errors) {
      expect(isApiError(err)).toBe(true)
      expect(typeof err._tag).toBe("string")
    }
  })

  test("errors are instanceof Error", () => {
    const err = new DataError({
      reason: "ReadFailed",
      message: "test",
    })

    expect(err instanceof Error).toBe(true)
  })
})
