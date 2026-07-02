import { describe, expect, it } from "bun:test"
import { pickViolations, picoRoots } from "./pico-pick-coverage"

/**
 * Pick-coverage invariant: every design-bearing raw HTML leaf in pico pages,
 * organisms, and molecules must be a pickable part (a kit component or a tag
 * spreading a design-part attr). Atoms are the floor and are exempt. A
 * regression here means the lab picker can no longer select some rendered
 * element — the exact defect that motivated the atom-floor decomposition.
 */
describe("pico pick coverage", () => {
  it("has no untagged design leaves in pages/organisms/molecules", () => {
    const violations = pickViolations(picoRoots("product/surfaces/web/pico"))
    if (violations.length > 0) {
      const sample = violations
        .slice(0, 20)
        .map(v => `${v.file}: <${v.tag} class="${v.className}">`)
        .join("\n")
      throw new Error(
        `${violations.length} untagged design leaves (pick-mode cannot select these):\n${sample}`,
      )
    }
    expect(violations.length).toBe(0)
  })
})
