import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { Hono } from "hono"
import { REPO_ROOT } from "../paths"
import { filesRoute } from "./files.route"

/*
 * Integration tests for the files route. These mount the Hono router via
 * `app.fetch()` instead of booting a real HTTP server — Hono's standard
 * test pattern.
 *
 * The fixture lives under `out/tmp/feature-map-explorer-test/` (gitignored)
 * so a successful or failing test cannot leak into source control.
 */

const FIXTURE_DIR = path.join(REPO_ROOT, "out/tmp/feature-map-explorer-test")
const FIXTURE_NAME = "fixture.md"
const FIXTURE_ABSOLUTE = path.join(FIXTURE_DIR, FIXTURE_NAME)
const FIXTURE_REPO_RELATIVE = path
  .relative(REPO_ROOT, FIXTURE_ABSOLUTE)
  .split(path.sep)
  .join("/")
const FIXTURE_INITIAL_BODY = "# fixture\noriginal\n"

let app: Hono

beforeAll(async () => {
  await rm(FIXTURE_DIR, { recursive: true, force: true })
  await mkdir(FIXTURE_DIR, { recursive: true })
  await writeFile(FIXTURE_ABSOLUTE, FIXTURE_INITIAL_BODY, "utf-8")

  app = new Hono()
  app.route("/api", filesRoute())
})

afterAll(async () => {
  await rm(FIXTURE_DIR, { recursive: true, force: true })
})

describe("PUT /api/file allowlist", () => {
  it("returns 403 for a non-allowlisted path and does not modify the file", async () => {
    const before = await stat(FIXTURE_ABSOLUTE)

    const res = await app.fetch(
      new Request("http://test/api/file", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: FIXTURE_REPO_RELATIVE,
          body: "# rewritten\n",
          frontmatter: {},
        }),
      }),
    )

    expect(res.status).toBe(403)
    const payload = (await res.json()) as { error: string }
    expect(payload.error).toBe("not-allowlisted")

    const after = await stat(FIXTURE_ABSOLUTE)
    expect(after.mtimeMs).toBe(before.mtimeMs)

    const content = await readFile(FIXTURE_ABSOLUTE, "utf-8")
    expect(content).toBe(FIXTURE_INITIAL_BODY)
  })

  it("returns 403 for an absolute path", async () => {
    const res = await app.fetch(
      new Request("http://test/api/file", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: "/etc/passwd",
          body: "x",
        }),
      }),
    )

    expect(res.status).toBe(403)
    const payload = (await res.json()) as { error: string }
    expect(payload.error).toBe("absolute")
  })

  it("returns 403 for a traversal path", async () => {
    const res = await app.fetch(
      new Request("http://test/api/file", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: "docs/jobs/../../etc/passwd",
          body: "x",
        }),
      }),
    )

    expect(res.status).toBe(403)
    const payload = (await res.json()) as { error: string }
    expect(payload.error).toBe("traversal")
  })

  it("returns 400 when the request body is malformed", async () => {
    const res = await app.fetch(
      new Request("http://test/api/file", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "docs/jobs/foo.md" }),
      }),
    )
    expect(res.status).toBe(400)
  })
})

describe("GET /api/file", () => {
  it("returns 400 when the path query is missing", async () => {
    const res = await app.fetch(
      new Request("http://test/api/file", { method: "GET" }),
    )
    expect(res.status).toBe(400)
  })

  it("returns 403 for a traversal path query", async () => {
    const res = await app.fetch(
      new Request(`http://test/api/file?path=${encodeURIComponent("../foo")}`, {
        method: "GET",
      }),
    )
    expect(res.status).toBe(403)
  })

  it("reads an existing file and parses frontmatter", async () => {
    const res = await app.fetch(
      new Request(
        `http://test/api/file?path=${encodeURIComponent(FIXTURE_REPO_RELATIVE)}`,
        { method: "GET" },
      ),
    )

    expect(res.status).toBe(200)
    const payload = (await res.json()) as {
      path: string
      frontmatter: Record<string, unknown>
      body: string
    }
    expect(payload.path).toBe(FIXTURE_REPO_RELATIVE)
    expect(payload.body).toContain("original")
  })
})
