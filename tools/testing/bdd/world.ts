import type { Browser, BrowserContext, Page } from "@playwright/test"

const DEFAULT_PORTAL_URL =
  process.env.PLAYWRIGHT_TEST_BASE_URL ||
  `http://localhost:${process.env.KORRI_PORT_PORTAL || "3000"}`

const DEFAULT_VIEWPORT = { width: 1440, height: 1024 }

export class BddWorld {
  context!: BrowserContext
  page!: Page
  readonly baseUrl: string

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? DEFAULT_PORTAL_URL
  }

  resetState(): void {
    // Intentionally empty. Feature-specific step definitions own their setup.
  }

  async setup(browser: Browser): Promise<void> {
    this.context = await browser.newContext({ viewport: DEFAULT_VIEWPORT })
    this.page = await this.context.newPage()
  }

  async teardown(screenshotPath?: string): Promise<void> {
    if (screenshotPath) {
      await this.page.screenshot({ path: screenshotPath, fullPage: true })
    }
    await this.page.close()
    await this.context.close()
  }
}
