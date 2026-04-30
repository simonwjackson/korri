import { readFile, rename, writeFile } from "node:fs/promises"
import matter from "gray-matter"
import { Hono } from "hono"
import { assertWritablePath, PathError, resolveRepoPath } from "../paths"

/*
 * GET /api/file?path=…   — read a markdown file, parse frontmatter
 * PUT /api/file          — write a markdown file (allowlisted paths only)
 *
 * All path handling goes through `resolveRepoPath` and `assertWritablePath`.
 * Writes are atomic (temp + rename). Reads are allowed for any repo-relative
 * path that resolves under REPO_ROOT — narrower allowlisting is enforced on
 * write only, since the rail/inspector may want to surface read-only context
 * (e.g. a `.feature` file's contents) without granting edit rights.
 */

type WriteRequestBody = {
  path?: unknown
  frontmatter?: unknown
  body?: unknown
}

export function filesRoute() {
  const app = new Hono()

  app.get("/file", async c => {
    const requested = c.req.query("path")
    if (!requested) {
      return c.json({ error: "missing-path" }, 400)
    }

    try {
      const resolved = resolveRepoPath(requested)
      const raw = await readFile(resolved.absolutePath, "utf-8")
      const parsed = matter(raw)

      return c.json({
        path: resolved.repoRelativePath,
        frontmatter: parsed.data,
        body: parsed.content,
        raw,
      })
    } catch (err) {
      if (err instanceof PathError) {
        return c.json({ error: err.code, message: err.message }, 403)
      }
      if (isFileNotFound(err)) {
        return c.json({ error: "not-found", path: requested }, 404)
      }
      throw err
    }
  })

  app.put("/file", async c => {
    let body: WriteRequestBody
    try {
      body = await c.req.json<WriteRequestBody>()
    } catch {
      return c.json({ error: "invalid-json" }, 400)
    }

    if (typeof body.path !== "string" || typeof body.body !== "string") {
      return c.json(
        {
          error: "invalid-body",
          message:
            "expected { path: string, body: string, frontmatter?: object }",
        },
        400,
      )
    }

    const frontmatter =
      body.frontmatter && typeof body.frontmatter === "object"
        ? (body.frontmatter as Record<string, unknown>)
        : {}

    try {
      const resolved = resolveRepoPath(body.path)
      assertWritablePath(resolved.repoRelativePath)

      const serialized = matter.stringify(body.body, frontmatter)
      const tempPath = `${resolved.absolutePath}.tmp-${Date.now()}-${process.pid}`

      await writeFile(tempPath, serialized, "utf-8")
      await rename(tempPath, resolved.absolutePath)

      return c.body(null, 204)
    } catch (err) {
      if (err instanceof PathError) {
        return c.json({ error: err.code, message: err.message }, 403)
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
