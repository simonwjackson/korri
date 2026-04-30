import { readFile } from "node:fs/promises"
import { Hono } from "hono"
import { FEATURE_MAP_PATH } from "../paths"

/*
 * GET /api/feature-map — read the generated map JSON.
 *
 * The map is a build artifact; this route never writes it. Returns 404
 * with a structured payload when the file does not exist (Unit 4 wires
 * a "Generate now" CTA against this case).
 */
export function featureMapRoute() {
  const app = new Hono()

  app.get("/feature-map", async c => {
    try {
      const raw = await readFile(FEATURE_MAP_PATH, "utf-8")
      c.header("Cache-Control", "no-store")
      c.header("Content-Type", "application/json; charset=utf-8")
      return c.body(raw)
    } catch (err) {
      if (isFileNotFound(err)) {
        return c.json(
          {
            error: "feature-map-not-generated",
            message:
              "feature-map.json does not exist yet. Run `just generate-feature-map` or POST /api/regenerate.",
          },
          404,
        )
      }
      throw err
    }
  })

  return app
}

function isFileNotFound(err: unknown): err is NodeJS.ErrnoException {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as NodeJS.ErrnoException).code === "ENOENT"
  )
}
