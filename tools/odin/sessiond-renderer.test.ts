import { describe, expect, it } from "bun:test"
import {
  type KorriRendererController,
  rendererStatus,
} from "./sessiond-renderer"

describe("sessiond renderer status", () => {
  const renderer: KorriRendererController = {
    kind: "electrobun",
    launch: async () => ({ pid: 123 }),
    stop: async () => {},
  }

  it("includes the renderer kind when no process is active", () => {
    expect(rendererStatus(renderer, undefined)).toEqual({ kind: "electrobun" })
  })

  it("includes the renderer pid when active", () => {
    expect(rendererStatus(renderer, 123)).toEqual({
      kind: "electrobun",
      pid: 123,
    })
  })
})
