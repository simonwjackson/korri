import { describe, expect, it } from "bun:test"
import { createMicrotaskBatchQueue } from "./microtask-batch-queue"

const waitForMicrotask = () => Promise.resolve()

describe("createMicrotaskBatchQueue", () => {
  it("flushes items pushed in the same microtask as a single batch", async () => {
    const batches: Array<readonly number[]> = []
    const queue = createMicrotaskBatchQueue<number>(async items => {
      batches.push(items)
    })

    queue.push(1)
    queue.push(2)
    queue.push(3)

    await waitForMicrotask()
    await waitForMicrotask()

    expect(batches).toEqual([[1, 2, 3]])
  })

  it("starts a new batch on a later microtask", async () => {
    const batches: Array<readonly string[]> = []
    const queue = createMicrotaskBatchQueue<string>(async items => {
      batches.push(items)
    })

    queue.push("first")
    await waitForMicrotask()
    await waitForMicrotask()

    queue.push("second")
    await waitForMicrotask()
    await waitForMicrotask()

    expect(batches).toEqual([["first"], ["second"]])
  })
})
