import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"

const VIRTUAL_ROUTES = "product/apps/portal/routes/__virtual.ts"

describe("portal screen route", () => {
  it("registers /screen as the production dual-screen surface entry", () => {
    const source = readFileSync(VIRTUAL_ROUTES, "utf8")

    expect(source).toContain('route("/screen", "+screen.tsx")')
  })
})
