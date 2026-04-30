import { describe, expect, it } from "bun:test"
import { layoutGraph } from "./dagreLayout"

describe("layoutGraph", () => {
  it("returns empty arrays when given no nodes", () => {
    const result = layoutGraph([], [])
    expect(result.nodes).toEqual([])
    expect(result.edges).toEqual([])
    expect(result.bounds).toEqual({ width: 0, height: 0 })
  })

  it("does not throw when given edges that reference missing nodes", () => {
    const result = layoutGraph(
      [{ id: "a", width: 100, height: 40 }],
      [{ source: "a", target: "missing" }],
    )
    expect(result.nodes).toHaveLength(1)
  })

  it("places an isolated node on the canvas at a finite position", () => {
    const result = layoutGraph([{ id: "solo", width: 120, height: 40 }], [])
    expect(result.nodes).toHaveLength(1)
    expect(Number.isFinite(result.nodes[0]?.x)).toBe(true)
    expect(Number.isFinite(result.nodes[0]?.y)).toBe(true)
  })

  it("orders connected nodes left-to-right by edge direction", () => {
    // job -> brief -> feature -> bdd
    const result = layoutGraph(
      [
        { id: "job:j1", width: 200, height: 60 },
        { id: "brief:b1", width: 200, height: 60 },
        { id: "feature:f1", width: 200, height: 60 },
        { id: "bdd:s1", width: 200, height: 60 },
      ],
      [
        { source: "job:j1", target: "brief:b1" },
        { source: "brief:b1", target: "feature:f1" },
        { source: "feature:f1", target: "bdd:s1" },
      ],
      { rankdir: "LR" },
    )

    const byId = new Map(result.nodes.map(n => [n.id, n]))
    const job = byId.get("job:j1")
    const brief = byId.get("brief:b1")
    const feature = byId.get("feature:f1")
    const bdd = byId.get("bdd:s1")

    expect(job?.x).toBeLessThan(brief?.x ?? Number.POSITIVE_INFINITY)
    expect(brief?.x).toBeLessThan(feature?.x ?? Number.POSITIVE_INFINITY)
    expect(feature?.x).toBeLessThan(bdd?.x ?? Number.POSITIVE_INFINITY)
  })

  it("does not produce overlapping bounding boxes for connected nodes", () => {
    const result = layoutGraph(
      [
        { id: "a", width: 200, height: 60 },
        { id: "b", width: 200, height: 60 },
        { id: "c", width: 200, height: 60 },
      ],
      [
        { source: "a", target: "b" },
        { source: "a", target: "c" },
      ],
    )

    const positions = result.nodes
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const a = positions[i]
        const b = positions[j]
        if (!a || !b) continue
        const horizontalGap = a.x + a.width <= b.x || b.x + b.width <= a.x
        const verticalGap = a.y + a.height <= b.y || b.y + b.height <= a.y
        expect(horizontalGap || verticalGap).toBe(true)
      }
    }
  })
})
