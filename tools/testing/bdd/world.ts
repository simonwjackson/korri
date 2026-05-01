import type { Browser, BrowserContext, Page } from "@playwright/test"

const DEFAULT_PORTAL_URL =
  process.env.PLAYWRIGHT_TEST_BASE_URL ||
  `http://localhost:${process.env.KORRI_PORT_PORTAL || "3000"}`

const DEFAULT_VIEWPORT = { width: 1440, height: 1024 }

export class BddWorld {
  context!: BrowserContext
  page!: Page
  readonly baseUrl: string
  private ownsBrowserContext = false

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? DEFAULT_PORTAL_URL
  }

  resetState(): void {
    // Intentionally empty. Feature-specific step definitions own their setup.
  }

  /**
   * Create a fresh browser context + page for normal E2E execution.
   *
   * Generated Playwright BDD wrappers call this once per scenario.
   */
  async setup(browser: Browser): Promise<void> {
    this.context = await browser.newContext({ viewport: DEFAULT_VIEWPORT })
    this.page = await this.context.newPage()
    this.ownsBrowserContext = true
  }

  /**
   * Attach to a runner-owned page instead of creating a new browser context.
   *
   * Argo demos provide the page being recorded; BDD steps must execute against
   * that page without closing it during teardown.
   */
  attachToPage(page: Page, context: BrowserContext = page.context()): void {
    this.page = page
    this.context = context
    this.ownsBrowserContext = false
  }

  async teardown(screenshotPath?: string): Promise<void> {
    if (screenshotPath) {
      await this.page.screenshot({ path: screenshotPath, fullPage: true })
    }

    if (!this.ownsBrowserContext) return

    await this.page.close()
    await this.context.close()
  }
}
