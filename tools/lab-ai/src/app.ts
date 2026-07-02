import { registerProvider } from "@flue/runtime"
import { flue } from "@flue/runtime/routing"
import { Hono } from "hono"

// Reuse the local Pi ChatGPT/Codex login for the `openai-codex` provider so the
// lab can drive GPT-5.x through an existing subscription instead of a separate
// API key. The Codex Responses API derives the account id from the token, so
// the OAuth access token doubles as the credential. Supply it out-of-band via
// OPENAI_CODEX_TOKEN (see scripts/run-workflow.sh); never commit the token.
const codexToken = process.env.OPENAI_CODEX_TOKEN
if (codexToken) {
  registerProvider("openai-codex", { apiKey: codexToken })
}

const app = new Hono()
app.route("/", flue())

export default app
