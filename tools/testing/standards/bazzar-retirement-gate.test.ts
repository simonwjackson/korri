import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"

const INVENTORY_PATH = "docs/research/bazzar-migration-inventory.md"
const inventory = readFileSync(INVENTORY_PATH, "utf8")

const originAcceptanceExamples = ["AE1", "AE2", "AE3", "AE4", "AE5", "AE6"]
const planRequirements = Array.from(
  { length: 28 },
  (_, index) => `R${index + 1}`,
)

describe("standards: Bazzar retirement gate", () => {
  it("documents traceability for every requirement and origin acceptance example", () => {
    expect(inventory).toContain(
      "## Final migration traceability and retirement gate",
    )
    expect(inventory).toContain("Standalone Bazzar retirement decision")
    expect(inventory).toContain("do not retire standalone Bazzar yet")
    expect(inventory).toContain(
      "blocked until the remaining strict live CLI parity work in `task-005` is closed",
    )

    for (const requirement of planRequirements) {
      expect(inventory).toContain(`| ${requirement} |`)
    }

    for (const acceptanceExample of originAcceptanceExamples) {
      expect(inventory).toContain(`| ${acceptanceExample} |`)
    }
  })

  it("records the quarantined-provider exception as the only active provider-set compatibility exception", () => {
    expect(inventory).toContain(
      "Provider-set compatibility exception: quarantined `.mjs` providers remain excluded from active Korri results.",
    )
    for (const provider of [
      "coolrom",
      "retrostic",
      "romhustler",
      "steamgriddb",
      "wowroms",
    ]) {
      expect(inventory).toContain(`| \`${provider}\` |`)
    }
  })
})
