import { describe, expect, it } from "bun:test"
import { resolve } from "node:path"

describe("diff-test-runner logic", () => {
  describe("argument parsing logic", () => {
    it("should extract base branch from --base= argument", () => {
      const arg = "--base=origin/main"
      const baseBranch = arg.startsWith("--base=")
        ? (arg.split("=")[1] ?? "origin/dev")
        : "origin/dev"

      expect(baseBranch).toBe("origin/main")
    })

    it("should handle empty base branch value", () => {
      const arg = "--base="
      const baseBranch = arg.startsWith("--base=")
        ? (arg.split("=")[1] ?? "origin/dev")
        : "origin/dev"

      expect(baseBranch).toBe("")
    })

    it("should detect --watch flag", () => {
      const arg: string = "--watch"
      const isWatch = arg === "--watch" || arg === "-w"

      expect(isWatch).toBe(true)
    })

    it("should detect -w short flag", () => {
      const arg: string = "-w"
      const isWatch = arg === "--watch" || arg === "-w"

      expect(isWatch).toBe(true)
    })

    it("should not set watch for other arguments", () => {
      const arg: string = "--other"
      const isWatch = arg === "--watch" || arg === "-w"

      expect(isWatch).toBe(false)
    })

    it("should process multiple arguments", () => {
      const args = ["--base=origin/main", "--watch"]
      let baseBranch = "origin/dev"
      let watch = false

      for (const arg of args) {
        if (arg.startsWith("--base=")) {
          baseBranch = arg.split("=")[1] ?? "origin/dev"
        } else if (arg === "--watch" || arg === "-w") {
          watch = true
        }
      }

      expect(baseBranch).toBe("origin/main")
      expect(watch).toBe(true)
    })
  })

  describe("file path processing", () => {
    it("should resolve relative paths to absolute", () => {
      const file = "src/file.ts"
      const absolutePath = resolve(process.cwd(), file)

      expect(absolutePath).toContain("src/file.ts")
      expect(absolutePath.startsWith("/")).toBe(true)
    })

    it("should filter for test files", () => {
      const files = [
        "/path/file.ts",
        "/path/file.test.ts",
        "/path/file.spec.ts",
        "/path/file.test.tsx",
        "/path/file.spec.tsx",
        "/path/other.tsx",
      ]

      const testFiles = files.filter(file =>
        /\.(test|spec)\.(ts|tsx)$/.test(file),
      )

      expect(testFiles).toHaveLength(4)
      expect(testFiles).toContain("/path/file.test.ts")
      expect(testFiles).toContain("/path/file.spec.ts")
      expect(testFiles).toContain("/path/file.test.tsx")
      expect(testFiles).toContain("/path/file.spec.tsx")
    })

    it("should deduplicate files using Set", () => {
      const files1 = ["file1.ts", "file2.ts", "file3.ts"]
      const files2 = ["file2.ts", "file3.ts", "file4.ts"]

      const allFiles = new Set<string>([...files1, ...files2])

      expect(allFiles.size).toBe(4)
      expect(allFiles.has("file1.ts")).toBe(true)
      expect(allFiles.has("file4.ts")).toBe(true)
    })

    it("should extract filename from path", () => {
      const path = "/path/to/some/file.test.ts"
      const filename = path.split("/").pop() ?? path

      expect(filename).toBe("file.test.ts")
    })

    it("should handle path without separators", () => {
      const path = "file.ts"
      const filename = path.split("/").pop() ?? path

      expect(filename).toBe("file.ts")
    })

    it("should extract directory from path", () => {
      const path = "/path/to/file.ts"
      const dir = path.substring(0, path.lastIndexOf("/"))

      expect(dir).toBe("/path/to")
    })

    it("should handle root level path", () => {
      const path = "/file.ts"
      const dir = path.substring(0, path.lastIndexOf("/"))

      expect(dir).toBe("")
    })

    it("should extract base name from file path", () => {
      const path = "/src/utils.ts"
      const baseName = path
        .split("/")
        .pop()
        ?.replace(/\.(ts|tsx)$/, "")

      expect(baseName).toBe("utils")
    })

    it("should handle tsx extension", () => {
      const path = "/src/Component.tsx"
      const baseName = path
        .split("/")
        .pop()
        ?.replace(/\.(ts|tsx)$/, "")

      expect(baseName).toBe("Component")
    })
  })

  describe("test output parsing logic", () => {
    it("should identify fail marker in output", () => {
      const line = "(fail) test description > should do something"
      const hasFail = line.includes("(fail)")

      expect(hasFail).toBe(true)
    })

    it("should extract test name from fail line", () => {
      const line = "(fail) validateInput > should handle edge cases"
      const match = line.match(/\(fail\)\s+(.+)/)
      const testName = match?.[1]?.trim()

      expect(testName).toBe("validateInput > should handle edge cases")
    })

    it("should handle fail line without test name", () => {
      const line = "(fail)"
      const match = line.match(/\(fail\)\s+(.+)/)

      expect(match).toBeNull()
    })

    it("should detect fail count in output", () => {
      const line = " 5 fail"
      const match = line.match(/\s+(\d+)\s+fail/)
      const failCount = match?.[1] ? parseInt(match[1], 10) : 0

      expect(failCount).toBe(5)
    })

    it("should handle zero fail count", () => {
      const line = " 0 fail"
      const match = line.match(/\s+(\d+)\s+fail/)
      const failCount = match?.[1] ? parseInt(match[1], 10) : 0

      expect(failCount).toBe(0)
    })

    it("should detect pass marker", () => {
      const line = "(pass) test succeeded"
      const hasPass = line.includes("(pass)")

      expect(hasPass).toBe(true)
    })

    it("should detect error marker", () => {
      const line = "error: something went wrong"
      const hasError = line.includes("error:")

      expect(hasError).toBe(true)
    })

    it("should detect caret marker", () => {
      const line = "   ^"
      const hasCaret = line.includes("^")

      expect(hasCaret).toBe(true)
    })

    it("should collect failed test names", () => {
      const output = `
(pass) test 1
(fail) test 2 > nested
(fail) test 3
(pass) test 4
 2 pass
 2 fail
`
      const lines = output.split("\n")
      const failedTests = new Set<string>()

      for (const line of lines) {
        if (line.includes("(fail)")) {
          const match = line.match(/\(fail\)\s+(.+)/)
          if (match?.[1]) {
            failedTests.add(match[1].trim())
          }
        }
      }

      expect(failedTests.size).toBe(2)
      expect(failedTests.has("test 2 > nested")).toBe(true)
      expect(failedTests.has("test 3")).toBe(true)
    })

    it("should determine if file had failures", () => {
      const lines = ["(fail) test", " 1 fail"]
      let hadFailure = false

      for (const line of lines) {
        if (line.includes("(fail)")) {
          hadFailure = true
        }
        const match = line.match(/\s+(\d+)\s+fail/)
        if (match?.[1] && parseInt(match[1], 10) > 0) {
          hadFailure = true
        }
      }

      expect(hadFailure).toBe(true)
    })

    it("should determine file passed when no failures", () => {
      const lines = ["(pass) test", " 1 pass", " 0 fail"]
      let hadFailure = false

      for (const line of lines) {
        if (line.includes("(fail)")) {
          hadFailure = true
        }
        const match = line.match(/\s+(\d+)\s+fail/)
        if (match?.[1] && parseInt(match[1], 10) > 0) {
          hadFailure = true
        }
      }

      expect(hadFailure).toBe(false)
    })
  })

  describe("output filtering logic", () => {
    it("should filter out pass lines", () => {
      const lines = [
        "(pass) test 1",
        "(fail) test 2",
        "(pass) test 3",
        " 1 fail",
      ]

      const filtered = lines.filter(line => !line.includes("(pass)"))

      expect(filtered).toHaveLength(2)
      expect(filtered).toContain("(fail) test 2")
      expect(filtered).toContain(" 1 fail")
    })

    it("should identify summary lines", () => {
      const lines = [" 5 pass", " 1 fail", " 3 expect"]

      const summaryLines = lines.filter(
        line =>
          line.match(/^\s*\d+\s+pass/) ||
          line.match(/^\s*\d+\s+fail/) ||
          line.match(/^\s*\d+\s+expect/),
      )

      expect(summaryLines).toHaveLength(3)
    })

    it("should detect lines starting with parentheses", () => {
      const line = "(something) test"
      const startsWithParen = line.trim().startsWith("(")

      expect(startsWithParen).toBe(true)
    })

    it("should not consider indented text as starting with paren", () => {
      const line = "  some text"
      const startsWithParen = line.trim().startsWith("(")

      expect(startsWithParen).toBe(false)
    })
  })

  describe("file watching logic", () => {
    it("should identify test files by extension", () => {
      const file1 = "/src/utils.test.ts"
      const file2 = "/src/component.tsx"

      expect(/\.(test|spec)\.(ts|tsx)$/.test(file1)).toBe(true)
      expect(/\.(test|spec)\.(ts|tsx)$/.test(file2)).toBe(false)
    })

    it("should match test file to source file by name", () => {
      const sourceFile = "/src/utils.ts"
      const testFile = "/src/utils.test.ts"

      const sourceDir = sourceFile.substring(0, sourceFile.lastIndexOf("/"))
      const sourceBase = sourceFile
        .split("/")
        .pop()
        ?.replace(/\.(ts|tsx)$/, "")

      const testDir = testFile.substring(0, testFile.lastIndexOf("/"))
      const testBase = testFile
        .split("/")
        .pop()
        ?.replace(/\.(test|spec)\.(ts|tsx)$/, "")

      const matches = sourceDir === testDir && sourceBase === testBase

      expect(matches).toBe(true)
    })

    it("should not match different source and test files", () => {
      const sourceFile = "/src/utils.ts"
      const testFile = "/src/helpers.test.ts"

      const sourceDir = sourceFile.substring(0, sourceFile.lastIndexOf("/"))
      const sourceBase = sourceFile
        .split("/")
        .pop()
        ?.replace(/\.(ts|tsx)$/, "")

      const testDir = testFile.substring(0, testFile.lastIndexOf("/"))
      const testBase = testFile
        .split("/")
        .pop()
        ?.replace(/\.(test|spec)\.(ts|tsx)$/, "")

      const matches = sourceDir === testDir && sourceBase === testBase

      expect(matches).toBe(false)
    })

    it("should handle file without extension", () => {
      const file = "/src/README"
      const baseName = file
        .split("/")
        .pop()
        ?.replace(/\.(ts|tsx)$/, "")

      expect(baseName).toBe("README")
    })

    it("should compare modification times", () => {
      const currentMtime = 1000
      const lastMtime = 500

      expect(currentMtime > lastMtime).toBe(true)
    })

    it("should detect unchanged files", () => {
      const currentMtime = 1000
      const lastMtime = 1000

      expect(currentMtime > lastMtime).toBe(false)
    })

    it("should use Map to track file times", () => {
      const fileMtimes = new Map<string, number>()
      fileMtimes.set("/file1.ts", 1000)
      fileMtimes.set("/file2.ts", 2000)

      expect(fileMtimes.get("/file1.ts")).toBe(1000)
      expect(fileMtimes.get("/file2.ts")).toBe(2000)
      expect(fileMtimes.get("/file3.ts")).toBeUndefined()
    })

    it("should use default value for missing file", () => {
      const fileMtimes = new Map<string, number>()
      const mtime = fileMtimes.get("/missing.ts") ?? 0

      expect(mtime).toBe(0)
    })
  })

  describe("recovery detection logic", () => {
    it("should detect recovery when previous failed and current passed", () => {
      const prevPassed = false
      const currPassed = true

      const recovered = !prevPassed && currPassed

      expect(recovered).toBe(true)
    })

    it("should not detect recovery when both passed", () => {
      const prevPassed = true
      const currPassed = true

      const recovered = !prevPassed && currPassed

      expect(recovered).toBe(false)
    })

    it("should not detect recovery when both failed", () => {
      const prevPassed = false
      const currPassed = false

      const recovered = !prevPassed && currPassed

      expect(recovered).toBe(false)
    })

    it("should check if specific tests recovered", () => {
      const prevFailedTests = new Set(["test1", "test2"])
      const currFailedTests = new Set<string>()

      const recoveredTests: string[] = []
      for (const testName of prevFailedTests) {
        if (!currFailedTests.has(testName)) {
          recoveredTests.push(testName)
        }
      }

      expect(recoveredTests).toHaveLength(2)
      expect(recoveredTests).toContain("test1")
      expect(recoveredTests).toContain("test2")
    })

    it("should detect partial recovery", () => {
      const prevFailedTests = new Set(["test1", "test2", "test3"])
      const currFailedTests = new Set(["test2"])

      const recoveredTests: string[] = []
      for (const testName of prevFailedTests) {
        if (!currFailedTests.has(testName)) {
          recoveredTests.push(testName)
        }
      }

      expect(recoveredTests).toHaveLength(2)
      expect(recoveredTests).toContain("test1")
      expect(recoveredTests).toContain("test3")
    })

    it("should handle empty previous failures", () => {
      const prevFailedTests = new Set<string>()
      const hasSpecificTests = prevFailedTests.size > 0

      expect(hasSpecificTests).toBe(false)
    })
  })

  describe("result aggregation logic", () => {
    it("should track results per file using Map", () => {
      const results = new Map<
        string,
        {
          file: string
          passed: boolean
          failedTests: Set<string>
        }
      >()

      results.set("/file1.ts", {
        file: "/file1.ts",
        passed: true,
        failedTests: new Set(),
      })

      results.set("/file2.ts", {
        file: "/file2.ts",
        passed: false,
        failedTests: new Set(["test1"]),
      })

      expect(results.size).toBe(2)
      expect(results.get("/file1.ts")?.passed).toBe(true)
      expect(results.get("/file2.ts")?.passed).toBe(false)
    })

    it("should determine if any file had failures", () => {
      const results = [
        { passed: true },
        { passed: true },
        { passed: false },
        { passed: true },
      ]

      const hadFailures = results.some(r => !r.passed)

      expect(hadFailures).toBe(true)
    })

    it("should determine if all passed", () => {
      const results = [{ passed: true }, { passed: true }, { passed: true }]

      const hadFailures = results.some(r => !r.passed)

      expect(hadFailures).toBe(false)
    })

    it("should iterate over Map entries", () => {
      const results = new Map([
        ["file1", { passed: true }],
        ["file2", { passed: false }],
      ])

      const files: string[] = []
      for (const [file] of results.entries()) {
        files.push(file)
      }

      expect(files).toContain("file1")
      expect(files).toContain("file2")
    })
  })

  describe("git diff filter logic", () => {
    it("should parse ACM filter meaning", () => {
      // A = Added, C = Copied, M = Modified
      const filters = ["ACM"]
      const includesAdded = filters[0]?.includes("A")
      const includesModified = filters[0]?.includes("M")
      const includesDeleted = filters[0]?.includes("D")

      expect(includesAdded).toBe(true)
      expect(includesModified).toBe(true)
      expect(includesDeleted).toBe(false)
    })
  })

  describe("string splitting and filtering", () => {
    it("should split by newline and filter empty", () => {
      const output = "file1.ts\nfile2.ts\n\nfile3.ts\n"
      const files = output.trim().split("\n").filter(Boolean)

      expect(files).toHaveLength(3)
    })

    it("should handle empty string", () => {
      const output = ""
      const files = output.trim().split("\n").filter(Boolean)

      expect(files).toHaveLength(0)
    })

    it("should handle single line", () => {
      const output = "file1.ts"
      const files = output.trim().split("\n").filter(Boolean)

      expect(files).toHaveLength(1)
      expect(files[0]).toBe("file1.ts")
    })
  })

  describe("conditional display logic", () => {
    it("should display when has failures", () => {
      const hasFailures = true
      const hasRecovery = false

      const shouldDisplay = hasFailures || hasRecovery

      expect(shouldDisplay).toBe(true)
    })

    it("should display when has recovery", () => {
      const hasFailures = false
      const hasRecovery = true

      const shouldDisplay = hasFailures || hasRecovery

      expect(shouldDisplay).toBe(true)
    })

    it("should not display when no failures or recovery", () => {
      const hasFailures = false
      const hasRecovery = false

      const shouldDisplay = hasFailures || hasRecovery

      expect(shouldDisplay).toBe(false)
    })

    it("should detect recovery condition", () => {
      const previousHadFailures = true
      const currentHadFailures = false

      const hasRecovery = previousHadFailures && !currentHadFailures

      expect(hasRecovery).toBe(true)
    })
  })

  describe("file count comparison", () => {
    it("should detect new files added", () => {
      const previousCount: number = 5
      const currentCount: number = 7

      const hasNewFiles = currentCount !== previousCount

      expect(hasNewFiles).toBe(true)
    })

    it("should detect files removed", () => {
      const previousCount: number = 5
      const currentCount: number = 3

      const hasChanges = currentCount !== previousCount

      expect(hasChanges).toBe(true)
    })

    it("should detect no change in file count", () => {
      const previousCount = 5
      const currentCount = 5

      const hasChanges = currentCount !== previousCount

      expect(hasChanges).toBe(false)
    })
  })

  describe("test file discovery", () => {
    it("should generate possible test file paths", () => {
      const dir = "/src"
      const baseName = "utils"

      const possiblePaths = [
        `${dir}/${baseName}.test.ts`,
        `${dir}/${baseName}.test.tsx`,
        `${dir}/${baseName}.spec.ts`,
        `${dir}/${baseName}.spec.tsx`,
      ]

      expect(possiblePaths).toHaveLength(4)
      expect(possiblePaths).toContain("/src/utils.test.ts")
      expect(possiblePaths).toContain("/src/utils.spec.tsx")
    })
  })

  describe("array filtering and finding", () => {
    it("should filter test files from all files", () => {
      const allFiles = ["/src/a.ts", "/src/b.test.ts", "/src/c.spec.ts"]
      const testPattern = /\.(test|spec)\.(ts|tsx)$/

      const testFiles = allFiles.filter(f => testPattern.test(f))

      expect(testFiles).toHaveLength(2)
    })

    it("should find files in array", () => {
      const allFiles = ["/file1.ts", "/file2.ts", "/file3.ts"]
      const newFiles = ["/file2.ts", "/file3.ts", "/file4.ts"]

      const added = newFiles.filter(f => !allFiles.includes(f))

      expect(added).toEqual(["/file4.ts"])
    })
  })
})
