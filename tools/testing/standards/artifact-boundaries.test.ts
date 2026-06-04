import { describe, expect, it } from "bun:test"
import { dirname, join, normalize } from "node:path"

import {
  REPO_ROOT,
  readSource,
  repoRelative,
  sourceFiles,
} from "./source-files"

const ARTIFACT_PROTOCOL_ROOT = join(
  REPO_ROOT,
  "product",
  "platform",
  "protocol",
  "artifact",
)
const ACQUISITION_PROTOCOL_ROOT = join(
  REPO_ROOT,
  "product",
  "platform",
  "protocol",
  "acquisition",
)
const ACQUISITION_ROOT = join(REPO_ROOT, "product", "platform", "acquisition")
const LIBRARY_ROOT = join(REPO_ROOT, "product", "platform", "library")

function importSpecifiers(source: string): readonly string[] {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
  const specifiers: string[] = []
  for (const match of withoutComments.matchAll(
    /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g,
  )) {
    const specifier = match[1] ?? match[2]
    if (specifier) specifiers.push(specifier)
  }
  return specifiers
}

function resolvedRelativeImport(fromFile: string, specifier: string): string {
  return repoRelative(normalize(join(dirname(fromFile), specifier)))
}

function importsPath(
  source: string,
  fromFile: string,
  pathPrefix: string,
): boolean {
  const aliases = [
    pathPrefix,
    pathPrefix.replace("product/platform", "@platform"),
    pathPrefix.replace("product/", "@product/"),
  ]

  return importSpecifiers(source).some(specifier => {
    if (
      aliases.some(
        alias => specifier === alias || specifier.startsWith(`${alias}/`),
      )
    ) {
      return true
    }

    return (
      specifier.startsWith(".") &&
      resolvedRelativeImport(fromFile, specifier).startsWith(`${pathPrefix}/`)
    )
  })
}

function importsAnyPath(
  source: string,
  fromFile: string,
  pathPrefixes: readonly string[],
): boolean {
  return pathPrefixes.some(pathPrefix =>
    importsPath(source, fromFile, pathPrefix),
  )
}

describe("standards: artifact boundaries", () => {
  it("detects product and platform alias imports in boundary samples", () => {
    const fromFile = join(ARTIFACT_PROTOCOL_ROOT, "sample.ts")

    expect(
      importsPath(
        'import { thing } from "@product/platform/acquisition/service"',
        fromFile,
        "product/platform/acquisition",
      ),
    ).toBe(true)
    expect(
      importsPath(
        'import { thing } from "@platform/library/config"',
        fromFile,
        "product/platform/library",
      ),
    ).toBe(true)
  })

  it("keeps durable artifact protocol independent from acquisition, library, and app code", () => {
    const violations = sourceFiles(ARTIFACT_PROTOCOL_ROOT)
      .filter(file =>
        importsAnyPath(readSource(file), file, [
          "product/platform/acquisition",
          "product/platform/library",
          "product/apps",
        ]),
      )
      .map(repoRelative)

    expect(violations).toEqual([])
  })

  it("keeps acquisition protocol staging types separate from library state", () => {
    const violations = sourceFiles(ACQUISITION_PROTOCOL_ROOT)
      .filter(file =>
        importsPath(readSource(file), file, "product/platform/library"),
      )
      .map(repoRelative)

    expect(violations).toEqual([])
  })

  it("allows acquisition protocol to depend on durable artifact protocol, not the reverse", () => {
    const artifactProtocolViolations = sourceFiles(ARTIFACT_PROTOCOL_ROOT)
      .filter(file =>
        importsPath(
          readSource(file),
          file,
          "product/platform/protocol/acquisition",
        ),
      )
      .map(repoRelative)
    const acquisitionArtifactFiles = sourceFiles(ACQUISITION_PROTOCOL_ROOT)
      .filter(file =>
        importsPath(
          readSource(file),
          file,
          "product/platform/protocol/artifact",
        ),
      )
      .map(repoRelative)

    expect(artifactProtocolViolations).toEqual([])
    expect(acquisitionArtifactFiles).toContain(
      "product/platform/protocol/acquisition/artifact-acquisition.ts",
    )
  })

  it("keeps acquisition runtime and library runtime from importing each other", () => {
    const acquisitionViolations = sourceFiles(ACQUISITION_ROOT)
      .filter(file =>
        importsPath(readSource(file), file, "product/platform/library"),
      )
      .map(repoRelative)
    const libraryViolations = sourceFiles(LIBRARY_ROOT)
      .filter(file =>
        importsPath(readSource(file), file, "product/platform/acquisition"),
      )
      .map(repoRelative)

    expect(acquisitionViolations).toEqual([])
    expect(libraryViolations).toEqual([])
  })
})
