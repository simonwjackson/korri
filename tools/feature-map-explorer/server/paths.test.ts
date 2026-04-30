import { describe, expect, it } from "bun:test"
import path from "node:path"
import {
  assertWritablePath,
  PathError,
  REPO_ROOT,
  resolveRepoPath,
} from "./paths"

describe("resolveRepoPath", () => {
  it("resolves a normal repo-relative path under REPO_ROOT", () => {
    const result = resolveRepoPath("docs/jobs/safe-game-resume.md")
    expect(result.repoRelativePath).toBe("docs/jobs/safe-game-resume.md")
    expect(result.absolutePath).toBe(
      path.join(REPO_ROOT, "docs/jobs/safe-game-resume.md"),
    )
  })

  it("collapses single-dot segments to the same resolution", () => {
    const a = resolveRepoPath("docs/jobs/safe-game-resume.md")
    const b = resolveRepoPath("docs/jobs/./safe-game-resume.md")
    expect(b.absolutePath).toBe(a.absolutePath)
    expect(b.repoRelativePath).toBe(a.repoRelativePath)
  })

  it("rejects absolute paths", () => {
    expect(() => resolveRepoPath("/etc/passwd")).toThrow(PathError)
    try {
      resolveRepoPath("/etc/passwd")
    } catch (err) {
      expect(err).toBeInstanceOf(PathError)
      expect((err as PathError).code).toBe("absolute")
    }
  })

  it("rejects traversal segments even when they would resolve inside repo", () => {
    // /repo/docs/jobs/../../etc/passwd → /repo/etc/passwd (still inside)
    // We reject this because the input itself contains `..` segments.
    expect(() => resolveRepoPath("docs/jobs/../../etc/passwd")).toThrow(
      PathError,
    )
    try {
      resolveRepoPath("docs/jobs/../../etc/passwd")
    } catch (err) {
      expect((err as PathError).code).toBe("traversal")
    }
  })

  it("rejects traversal that would escape the repo root", () => {
    expect(() => resolveRepoPath("../somefile")).toThrow(PathError)
    try {
      resolveRepoPath("../somefile")
    } catch (err) {
      expect((err as PathError).code).toBe("traversal")
    }
  })

  it("rejects empty input", () => {
    expect(() => resolveRepoPath("")).toThrow(PathError)
  })
})

describe("assertWritablePath", () => {
  it("accepts docs/jobs/*.md", () => {
    expect(() => assertWritablePath("docs/jobs/foo.md")).not.toThrow()
    expect(() =>
      assertWritablePath("docs/jobs/safe-game-resume.md"),
    ).not.toThrow()
  })

  it("accepts korri/products/*/features/*/brief.md", () => {
    expect(() =>
      assertWritablePath("korri/products/app/features/resume/brief.md"),
    ).not.toThrow()
    expect(() =>
      assertWritablePath("korri/products/app/features/welcome/brief.md"),
    ).not.toThrow()
  })

  it("rejects nested job paths beyond docs/jobs/", () => {
    expect(() => assertWritablePath("docs/feature-map.md")).toThrow(PathError)
    expect(() => assertWritablePath("docs/jobs/sub/foo.md")).toThrow(PathError)
  })

  it("rejects feature .feature files", () => {
    expect(() =>
      assertWritablePath(
        "korri/products/app/features/resume/e2e/safe-game-resume.feature",
      ),
    ).toThrow(PathError)
  })

  it("rejects repo-root README and source code", () => {
    expect(() => assertWritablePath("README.md")).toThrow(PathError)
    expect(() =>
      assertWritablePath("korri/products/app/features/resume/index.tsx"),
    ).toThrow(PathError)
  })
})
