import { expect } from "@playwright/test"
import { Then, When } from "./steps"
import type { BddWorld } from "./world"

const PAGE_LOAD_TIMEOUT = 30_000

When("I open {string}", async function (this: BddWorld, path: string) {
  await this.page.goto(`${this.baseUrl}${path}`)
  await this.page.locator("main, [role='main']").first().waitFor({
    timeout: PAGE_LOAD_TIMEOUT,
  })
})

When(
  "I click the {string} button",
  async function (this: BddWorld, buttonText: string) {
    await this.page
      .getByRole("button", { name: buttonText, exact: false })
      .first()
      .click()
  },
)

Then("I should see {string}", async function (this: BddWorld, text: string) {
  await expect(this.page.getByText(text).first()).toBeVisible({
    timeout: PAGE_LOAD_TIMEOUT,
  })
})

Then(
  "I should see the heading {string}",
  async function (this: BddWorld, heading: string) {
    await expect(this.page.getByRole("heading", { name: heading })).toBeVisible(
      {
        timeout: PAGE_LOAD_TIMEOUT,
      },
    )
  },
)

Then(
  "the current URL should contain {string}",
  async function (this: BddWorld, urlPart: string) {
    await expect(this.page).toHaveURL(
      new RegExp(urlPart.replace(/\//g, "\\/")),
      { timeout: PAGE_LOAD_TIMEOUT },
    )
  },
)
