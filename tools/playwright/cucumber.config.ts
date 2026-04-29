import { setDefaultTimeout } from "@cucumber/cucumber"

setDefaultTimeout(30_000)

export const worldParameters = {
  baseUrl: process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000",
}
