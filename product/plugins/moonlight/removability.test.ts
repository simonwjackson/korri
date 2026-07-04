import { describe, expect, it } from "bun:test"

/**
 * Removability gate (R1/R8): the Moonlight plugin must be deletable with the app
 * still building. That requires that no shipped code depends on it. Shipped code
 * is everything under product/** except test files, the plugin's own directory,
 * and the plugin-host composition root (the one place allowed to enumerate
 * plugins). This test greps for any such import and fails if one appears.
 */
function shippedImportersOf(patterns: readonly string[]): readonly string[] {
  const result = Bun.spawnSync([
    "grep",
    "-rln",
    "-E",
    patterns.join("|"),
    "product",
    "--include=*.ts",
    "--include=*.tsx",
  ])
  const stdout = result.stdout.toString("utf8").trim()
  if (stdout === "") return []
  return stdout
    .split("\n")
    .filter(path => path.length > 0)
    .filter(path => !/\.test\.tsx?$/.test(path))
    .filter(path => !path.startsWith("product/plugins/moonlight/"))
    .filter(path => !path.startsWith("product/plugin-host/"))
    .sort()
}

describe("Moonlight plugin removability", () => {
  it("has no shipped importer of the plugin package", () => {
    expect(shippedImportersOf(["@product/plugins/moonlight"])).toEqual([])
  })

  it("has no shipped importer of retired @platform/stream Moonlight modules", () => {
    expect(
      shippedImportersOf([
        "@platform/stream/moonlight-control",
        "@platform/stream/moonlight-launch-spec",
        "@platform/stream/moonlight-runtime-watch",
      ]),
    ).toEqual([])
  })
})
