import { describe, expect, it } from "bun:test"
import { readdirSync, statSync } from "node:fs"
import {
  existingRoots,
  readSource,
  repoRelative,
  sourceFiles,
} from "./source-files"

const retiredCatalogReadTerms = [
  "app.library.list",
  "app.library.snapshot",
  "app.source.list",
  "libraryItemsAtom",
  "LibraryListState",
  "LibraryListStateRoot",
]

const allowedTermFiles = new Set([
  "tools/testing/standards/catalog-api-boundaries.test.ts",
])

describe("catalog API boundaries", () => {
  it("keeps the old list/source catalog read contracts retired", () => {
    const offenders = sourceFilesInScope()
      .map(path => ({ path, source: readSource(path) }))
      .flatMap(({ path, source }) =>
        retiredCatalogReadTerms
          .filter(term => source.includes(term))
          .map(term => `${repoRelative(path)} contains ${term}`),
      )
      .filter(
        offender => !allowedTermFiles.has(offender.split(" contains ")[0]),
      )

    expect(offenders).toEqual([])
  })
})

function sourceFilesInScope() {
  const scopedFiles = existingRoots(["product", "packages", "tools"]).flatMap(
    root => sourceFiles(root),
  )
  const rootFiles = readdirSync(".").filter(
    path => statSync(path).isFile() && /\.(ts|tsx)$/.test(path),
  )
  return [...scopedFiles, ...rootFiles]
}
