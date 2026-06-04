#!/usr/bin/env bun
/**
 * Diff-based Test Runner
 *
 * Watches and tests only files that have changed from a base branch.
 *
 * Usage:
 *   bun run tools/testing/runners/diff-test-runner.ts
 *   bun run tools/testing/runners/diff-test-runner.ts --base=origin/main
 *
 * Features:
 *   - Compares current branch against base branch (default: origin/dev)
 *   - Identifies new/modified test files using git diff
 *   - Runs initial test pass on startup
 *   - Watches all changed files and re-runs tests on any change
 */

import { execSync, spawn } from "node:child_process"
import { access } from "node:fs/promises"
import { resolve } from "node:path"
import { logger } from "@platform/logger"
import chokidar from "chokidar"

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  blue: "\x1b[34m",
}

const log = {
  info: (msg: string) => logger.info(`${colors.cyan}i${colors.reset} ${msg}`),
  success: (msg: string) =>
    logger.info(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg: string) => logger.error(`${colors.red}✗${colors.reset} ${msg}`),
  warn: (msg: string) => logger.warn(`${colors.yellow}!${colors.reset} ${msg}`),
  header: (msg: string) =>
    logger.info(`\n${colors.bright}${colors.blue}${msg}${colors.reset}\n`),
}

type Options = {
  baseBranch: string
  watch: boolean
}

type TestResult = {
  file: string
  passed: boolean
  failedTests: Set<string>
  output: string
}

type TestRunResult = {
  results: Map<string, TestResult>
  hadFailures: boolean
}

function parseArgs(): Options {
  const args = process.argv.slice(2)
  let baseBranch = "origin/dev"
  let watch = false

  for (const arg of args) {
    if (arg.startsWith("--base=")) {
      baseBranch = arg.split("=")[1]
    } else if (arg === "--watch" || arg === "-w") {
      watch = true
    } else if (arg === "--help" || arg === "-h") {
      logger.info(`
Usage: bun run diff-test-runner.ts [options]

Options:
  --base=<branch>    Base branch to compare against (default: origin/dev)
  --watch, -w        Watch for changes and re-run tests (default: one-shot)
  --help, -h         Show this help message

Examples:
  bun run diff-test-runner.ts                      # One-shot execution
  bun run diff-test-runner.ts --watch              # Watch mode
  bun run diff-test-runner.ts --base=origin/main   # Different base branch
      `)
      process.exit(0)
    }
  }

  return { baseBranch, watch }
}

function getChangedFiles(baseBranch: string): {
  allFiles: string[]
  testFiles: string[]
} {
  try {
    // Verify base branch exists
    execSync(`git rev-parse --verify ${baseBranch}`, { stdio: "pipe" })
  } catch {
    log.error(
      `Base branch '${baseBranch}' does not exist or is not accessible.`,
    )
    log.info(
      `Run 'git fetch' to update remote branches or specify a different base branch.`,
    )
    process.exit(1)
  }

  try {
    // Get committed changes from branch
    const committedOutput = execSync(
      `git diff ${baseBranch}...HEAD --name-only --diff-filter=ACM`,
      {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      },
    )

    // Get staged changes
    const stagedOutput = execSync(
      `git diff --cached --name-only --diff-filter=ACM`,
      {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      },
    )

    // Get unstaged changes
    const unstagedOutput = execSync(`git diff --name-only --diff-filter=ACM`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    })

    // Get untracked files (excluding ignored files)
    const untrackedOutput = execSync(
      `git ls-files --others --exclude-standard`,
      {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      },
    )

    // Combine and deduplicate all changed files
    const allChangedFiles = new Set<string>([
      ...committedOutput.trim().split("\n").filter(Boolean),
      ...stagedOutput.trim().split("\n").filter(Boolean),
      ...unstagedOutput.trim().split("\n").filter(Boolean),
      ...untrackedOutput.trim().split("\n").filter(Boolean),
    ])

    const allFiles = Array.from(allChangedFiles).map(file =>
      resolve(process.cwd(), file),
    )

    // Filter for test files
    const testFiles = allFiles.filter(file =>
      /\.(test|spec)\.(ts|tsx)$/.test(file),
    )

    return { allFiles, testFiles }
  } catch (error) {
    log.error(`Failed to get changed files: ${error}`)
    process.exit(1)
  }
}

function parseTestOutput(output: string, testFiles: string[]): TestRunResult {
  const results = new Map<string, TestResult>()
  let hadFailures = false

  // Parse output to extract test failures
  // Bun test output shows failures with "(fail)" and summary like "1 fail"
  const lines = output.split("\n")

  for (const file of testFiles) {
    const _fileName = file.split("/").pop() || file
    const failedTests = new Set<string>()
    let fileHadFailure = false

    // Look for test failures in output
    // Bun shows failures like: "(fail) test description > nested test"
    // And summary like: " 24 pass" and " 1 fail"
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Check for failure marker: "(fail) test name"
      if (line.includes("(fail)")) {
        fileHadFailure = true
        // Extract test name from line like: "(fail) validateNumericInput > should handle numbers with commas"
        const testNameMatch = line.match(/\(fail\)\s+(.+)/)
        if (testNameMatch) {
          failedTests.add(testNameMatch[1].trim())
        }
      }

      // Also check the summary line for fail count
      // Pattern: " 1 fail" or " 5 fail" (but not " 0 fail")
      const failMatch = line.match(/\s+(\d+)\s+fail/)
      if (failMatch && parseInt(failMatch[1], 10) > 0) {
        fileHadFailure = true
      }
    }

    results.set(file, {
      file,
      passed: !fileHadFailure,
      failedTests,
      output,
    })

    if (fileHadFailure) {
      hadFailures = true
    }
  }

  return { results, hadFailures }
}

function displayTestResults(
  currentResult: TestRunResult,
  previousResult: TestRunResult | null,
): void {
  // If there are failures, show filtered output (only failures)
  if (currentResult.hadFailures) {
    // Get the first result's output (they all have the same output since it's combined)
    const firstResult = currentResult.results.values().next().value
    if (firstResult?.output) {
      // Filter output to remove passing test lines
      const lines = firstResult.output.split("\n")
      const filteredLines: string[] = []
      let inErrorBlock = false
      let _skipUntilBlankLine = false

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]

        // Skip lines with "(pass)"
        if (line.includes("(pass)")) {
          continue
        }

        // Detect start of error block (line with error indicator or "^")
        if (line.includes("^") || line.includes("error:")) {
          inErrorBlock = true
        }

        // Detect "(fail)" marker
        if (line.includes("(fail)")) {
          inErrorBlock = true
          _skipUntilBlankLine = false
        }

        // After a fail marker, show everything until we hit the summary
        if (
          line.match(/^\s*\d+\s+pass/) ||
          line.match(/^\s*\d+\s+fail/) ||
          line.match(/^\s*\d+\s+expect/)
        ) {
          // This is the summary section, show it
          filteredLines.push(line)
          continue
        }

        // Show the line if we're in an error block or it's a non-pass test line
        if (inErrorBlock || !line.trim().startsWith("(")) {
          filteredLines.push(line)
        }
      }

      logger.info(filteredLines.join("\n"))
    }
    return
  }

  // No failures - check if any tests recovered
  if (previousResult?.hadFailures) {
    const recoveredTests: string[] = []

    // Check each file that was previously failing
    for (const [file, prevResult] of previousResult.results.entries()) {
      if (!prevResult.passed) {
        const currResult = currentResult.results.get(file)
        if (currResult?.passed) {
          // This file recovered!
          if (prevResult.failedTests.size > 0) {
            // Show specific test names that recovered
            for (const testName of prevResult.failedTests) {
              recoveredTests.push(
                `  ${colors.green}✓${colors.reset} ${testName}`,
              )
            }
          } else {
            // Show file recovery if we didn't track specific tests
            const fileName = file.split("/").pop() || file
            recoveredTests.push(
              `  ${colors.green}✓${colors.reset} ${fileName} (all tests passing)`,
            )
          }
        }
      }
    }

    if (recoveredTests.length > 0) {
      logger.info("Tests recovered:")
      recoveredTests.forEach(test => {
        logger.info(test)
      })
      logger.info("")
    }
  }

  // If no failures and nothing recovered, stay silent
}

function runTests(
  testFiles: string[],
  mode: "initial" | "watch" = "initial",
): Promise<TestRunResult | undefined> {
  return new Promise((resolve, reject) => {
    if (mode === "initial") {
      // Initial run: show everything (inherit stdio)
      const testProcess = spawn("bun", ["test", ...testFiles], {
        stdio: "inherit",
        cwd: process.cwd(),
      })

      testProcess.on("close", _code => {
        resolve(undefined)
      })

      testProcess.on("error", error => {
        reject(error)
      })
    } else {
      // Watch mode: capture output for conditional display
      let stdout = ""
      let stderr = ""

      const testProcess = spawn("bun", ["test", ...testFiles], {
        stdio: ["inherit", "pipe", "pipe"],
        cwd: process.cwd(),
      })

      testProcess.stdout?.on("data", data => {
        stdout += data.toString()
      })

      testProcess.stderr?.on("data", data => {
        stderr += data.toString()
      })

      testProcess.on("close", _code => {
        const output = stdout + stderr
        const result = parseTestOutput(output, testFiles)
        resolve(result)
      })

      testProcess.on("error", error => {
        reject(error)
      })
    }
  })
}

async function watchFiles(
  baseBranch: string,
  initialAllFiles: string[],
  initialTestFiles: string[],
  initialTestResult: TestRunResult | null = null,
): Promise<void> {
  log.header("Watching for changes...")
  log.info(
    `Watching ${colors.bright}${initialAllFiles.length}${colors.reset} changed files`,
  )
  log.info(
    `Will re-run ${colors.bright}${initialTestFiles.length}${colors.reset} test files on any change`,
  )
  log.info(`Press ${colors.bright}Ctrl+C${colors.reset} to exit\n`)

  let allFiles = [...initialAllFiles]
  let testFiles = [...initialTestFiles]
  let isRunning = false
  let lastFileCount = allFiles.length
  let previousTestResult: TestRunResult | null = initialTestResult

  // Helper function to find related test files for a source file
  const findRelatedTests = async (changedFile: string): Promise<string[]> => {
    const isTestFile = /\.(test|spec)\.(ts|tsx)$/.test(changedFile)

    if (isTestFile) {
      // Changed file is a test, run only that test
      return [changedFile]
    }

    // Changed file is a source file, find matching test file(s)
    const dir = changedFile.substring(0, changedFile.lastIndexOf("/"))
    const baseName = changedFile
      .split("/")
      .pop()
      ?.replace(/\.(ts|tsx)$/, "")

    if (!baseName) {
      // If we have test files, run them all; otherwise don't run anything
      return testFiles.length > 0 ? testFiles : []
    }

    // First, look for test files in our tracked testFiles array
    const matchingTrackedTests = testFiles.filter(testFile => {
      const testDir = testFile.substring(0, testFile.lastIndexOf("/"))
      const testBaseName = testFile
        .split("/")
        .pop()
        ?.replace(/\.(test|spec)\.(ts|tsx)$/, "")

      return testDir === dir && testBaseName === baseName
    })

    if (matchingTrackedTests.length > 0) {
      return matchingTrackedTests
    }

    // If not found in tracked files, look for test files on disk
    const possibleTestFiles = [
      `${dir}/${baseName}.test.ts`,
      `${dir}/${baseName}.test.tsx`,
      `${dir}/${baseName}.spec.ts`,
      `${dir}/${baseName}.spec.tsx`,
    ]

    // Check file existence in parallel using fs.access()
    const existenceChecks = await Promise.all(
      possibleTestFiles.map(async testFile => {
        try {
          await access(testFile)
          return testFile
        } catch {
          return null
        }
      }),
    )

    const existingTestFiles = existenceChecks.filter(
      (file): file is string => file !== null,
    )

    // If we found test files on disk, return them; otherwise don't run any tests
    return existingTestFiles.length > 0 ? existingTestFiles : []
  }

  // Set up chokidar watcher for file changes
  const watcher = chokidar.watch(allFiles, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 50,
    },
  })

  // Handle file changes
  watcher.on("change", async (changedFile: string) => {
    if (isRunning) return

    const fileName = changedFile.split("/").pop() || changedFile
    const relatedTests = await findRelatedTests(changedFile)

    if (relatedTests.length === 0) {
      log.info(`${colors.dim}File changed: ${fileName}${colors.reset}`)
      log.warn(`No test file found for ${fileName}`)
      log.info(`${colors.dim}Skipping test run${colors.reset}\n`)
      return
    }

    isRunning = true
    try {
      const result = await runTests(relatedTests, "watch")
      if (result) {
        // Check if we need to display anything
        const hasFailures = result.hadFailures
        const hasRecovery =
          previousTestResult?.hadFailures && !result.hadFailures

        // Only show output if there are failures or recoveries
        if (hasFailures || hasRecovery) {
          log.info(`${colors.dim}File changed: ${fileName}${colors.reset}`)

          if (relatedTests.length < testFiles.length) {
            const testNames = relatedTests
              .map(t => t.split("/").pop())
              .join(", ")
            log.info(
              `${colors.dim}Running related test(s): ${testNames}${colors.reset}`,
            )
          }

          log.header("Re-running tests...")
          displayTestResults(result, previousTestResult)
        }

        previousTestResult = result
      }
    } catch (error) {
      log.error(`Test execution failed: ${error}`)
    } finally {
      isRunning = false
    }
  })

  // Check for new files periodically (git diff is source of truth)
  const newFileCheckInterval = setInterval(async () => {
    if (isRunning) return

    try {
      const { allFiles: newAllFiles, testFiles: newTestFiles } =
        getChangedFiles(baseBranch)

      // Check if file count changed OR if files themselves changed
      if (
        newAllFiles.length !== lastFileCount ||
        newTestFiles.length !== testFiles.length
      ) {
        // New or removed files detected!
        const addedFiles = newAllFiles.filter(f => !allFiles.includes(f))
        const addedTestFiles = newTestFiles.filter(f => !testFiles.includes(f))

        if (addedFiles.length > 0) {
          log.info(
            `${colors.green}+${colors.reset} Detected ${colors.bright}${addedFiles.length}${colors.reset} new file(s)`,
          )

          // Show which files were added
          addedFiles.forEach(file => {
            const fileName = file.split("/").pop() || file
            logger.info(`  ${colors.dim}+ ${fileName}${colors.reset}`)
          })

          // Add new files to watcher
          watcher.add(addedFiles)

          // Update tracked files
          allFiles = newAllFiles
          testFiles = newTestFiles
          lastFileCount = newAllFiles.length

          if (addedTestFiles.length > 0) {
            // Run tests immediately for new test files
            isRunning = true
            try {
              const result = await runTests(testFiles, "watch")
              if (result) {
                // Check if we need to display anything
                const hasFailures = result.hadFailures
                const hasRecovery =
                  previousTestResult?.hadFailures && !result.hadFailures

                // Only show output if there are failures or recoveries
                if (hasFailures || hasRecovery) {
                  log.info(
                    `${colors.green}+${colors.reset} Added ${colors.bright}${addedTestFiles.length}${colors.reset} test file(s) to watch list`,
                  )
                  log.header("Running tests for new files...")
                  displayTestResults(result, previousTestResult)
                }

                previousTestResult = result
              }
            } catch (error) {
              log.error(`Test execution failed: ${error}`)
            } finally {
              isRunning = false
            }
          }
        }
      }
    } catch (error) {
      // Log errors during new file detection for debugging
      log.warn(`Error checking for new files: ${error}`)
    }
  }, 2000)

  // Keep process alive and clean up on exit
  process.on("SIGINT", async () => {
    clearInterval(newFileCheckInterval)
    await watcher.close()
    log.info("\nStopped watching")
    process.exit(0)
  })

  // Keep process alive
  await new Promise(() => {})
}

async function main() {
  const options = parseArgs()

  log.header("Diff-Based Test Runner")
  log.info(`Base branch: ${colors.bright}${options.baseBranch}${colors.reset}`)

  // Get changed files
  const { allFiles, testFiles } = getChangedFiles(options.baseBranch)

  if (allFiles.length === 0) {
    log.warn(
      "No changed files found. Your branch is up to date with the base branch.",
    )
    if (options.watch) {
      log.info("Watching for new files...\n")
    } else {
      process.exit(0)
    }
  } else {
    log.success(
      `Found ${colors.bright}${allFiles.length}${colors.reset} changed files`,
    )
  }

  if (testFiles.length === 0) {
    if (options.watch) {
      log.warn("No test files found yet. Watching for new test files...\n")
    } else {
      log.warn("No test files found.")
      process.exit(0)
    }
  } else {
    log.success(
      `Found ${colors.bright}${testFiles.length}${colors.reset} test files\n`,
    )

    // Show test files
    log.info("Test files to run:")
    testFiles.forEach(file => {
      const relativePath = file.replace(`${process.cwd()}/`, "")
      logger.info(`  ${colors.dim}${relativePath}${colors.reset}`)
    })
    logger.info("")

    // Run initial test pass
    log.header("Running initial test pass...")
    try {
      await runTests(testFiles)
      log.success("Initial test pass completed\n")
    } catch (error) {
      log.error(`Initial test pass failed: ${error}`)
    }
  }

  // Enter watch mode only if --watch flag is set
  if (options.watch) {
    // Establish baseline for watch mode by running tests once more in watch mode
    // This captures the initial state to compare against
    let initialWatchResult: TestRunResult | null = null
    if (testFiles.length > 0) {
      log.info("Establishing watch baseline...\n")
      const result = await runTests(testFiles, "watch")
      if (result) {
        initialWatchResult = result
        // Only show output if there are failures in the baseline
        if (result.hadFailures) {
          log.warn("Tests are currently failing. Will notify when fixed.\n")
        }
      }
    }
    await watchFiles(
      options.baseBranch,
      allFiles,
      testFiles,
      initialWatchResult,
    )
  }
}

// Run if called directly
if (import.meta.main) {
  main().catch(error => {
    log.error(`Fatal error: ${error}`)
    process.exit(1)
  })
}
