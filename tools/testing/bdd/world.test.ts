import { describe, expect, test } from "bun:test"
import type { BrowserContext, Page } from "@playwright/test"
import { BddWorld } from "./world"

function createAttachedPage() {
  let screenshotCount = 0
  let pageCloseCount = 0
  let contextCloseCount = 0

  const context = {
    close: async () => {
      contextCloseCount += 1
    },
  } as unknown as BrowserContext

  const page = {
    context: () => context,
    screenshot: async () => {
      screenshotCount += 1
      return Buffer.from([])
    },
    close: async () => {
      pageCloseCount += 1
    },
  } as unknown as Page

  return {
    page,
    context,
    counts: () => ({ screenshotCount, pageCloseCount, contextCloseCount }),
  }
}

describe("BddWorld", () => {
  test("attaches to a runner-owned page without closing it during teardown", async () => {
    const { page, context, counts } = createAttachedPage()
    const world = new BddWorld("http://localhost:3000")

    world.attachToPage(page)

    expect(world.page).toBe(page)
    expect(world.context).toBe(context)
    expect(world.baseUrl).toBe("http://localhost:3000")

    await world.teardown()

    expect(counts()).toEqual({
      screenshotCount: 0,
      pageCloseCount: 0,
      contextCloseCount: 0,
    })
  })

  test("captures the optional teardown screenshot for an attached page", async () => {
    const { page, counts } = createAttachedPage()
    const world = new BddWorld("http://localhost:3000")

    world.attachToPage(page)
    await world.teardown("out/tmp/attached.png")

    expect(counts().screenshotCount).toBe(1)
  })

  test("accepts an explicit base URL override", () => {
    const world = new BddWorld("http://example.test:1234")
    expect(world.baseUrl).toBe("http://example.test:1234")
  })
})
