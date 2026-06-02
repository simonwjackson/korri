import { describe, expect, it } from "bun:test"
import { Route } from "./+evier"

describe("/evier route", () => {
  it("registers the Evier development theme route", () => {
    expect(Route.options.component).toBeFunction()
  })
})
