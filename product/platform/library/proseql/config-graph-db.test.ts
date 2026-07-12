// biome-ignore-all lint/style/noNonNullAssertion: test cases request exact temporary root counts.
import { describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  KORRI_RETROARCH_APP_ID,
  KORRI_RETROARCH_PLUGIN_ID,
  retroarchReadableLaunchIntegration,
} from "@product/plugins/retroarch"
import { Effect } from "effect"
import {
  KORRI_CONFIG_EXTENSIONS,
  makeKorriConfigGraphConfig,
  openKorriConfigGraph,
  REMOVABLE_CONFIG_COLLECTIONS,
} from "./config-graph-db"
import { LOCAL_HOST_KEY } from "./library-db"
import { createLibraryRepository } from "./library-repository"

async function withTempRoots<T>(
  count: number,
  fn: (roots: string[]) => Promise<T>,
): Promise<T> {
  const roots: string[] = []
  for (let i = 0; i < count; i += 1) {
    roots.push(await mkdtemp(join(tmpdir(), `korri-config-graph-${i}-`)))
  }
  try {
    return await fn(roots)
  } finally {
    await Promise.all(
      roots.map(root => rm(root, { recursive: true, force: true })),
    )
  }
}

describe("makeKorriConfigGraphConfig", () => {
  it("declares one read-only documentGraph source over ordered roots", () => {
    const config = makeKorriConfigGraphConfig([
      { root: "/platform", optional: false },
      { root: "/local" },
    ])
    expect(config.sources.length).toBe(1)
    const src = config.sources[0]
    expect(src?.kind).toBe("documentGraph")
    expect(src?.collections).toBe("all")
    expect(src?.onFragmentError).toBe("skip-fragment")
    expect(src?.roots.map(root => root.root)).toEqual(["/platform", "/local"])
    expect(src?.roots[0]?.optional).toBe(false)
    expect(src?.roots[1]?.optional).toBe(true)
  })

  it("includes opt-in korri fragment globs for every supported extension", () => {
    const config = makeKorriConfigGraphConfig([{ root: "/x" }])
    const include = config.sources[0]?.include as readonly string[]
    for (const ext of KORRI_CONFIG_EXTENSIONS) {
      expect(include).toContain(`**/korri.${ext}`)
      expect(include).toContain(`**/*.korri.${ext}`)
    }
  })

  it("declares the same canonical collections as the writable db", () => {
    const config = makeKorriConfigGraphConfig([{ root: "/x" }])
    expect(Object.keys(config.collections).sort()).toEqual([
      "collections",
      "hooks",
      "host",
      "launchers",
      "library",
      "profiles",
      "provider-links",
      "providers",
      "runtimes",
      "storage",
      "systems",
      "users",
    ])
  })
})

describe("openKorriConfigGraph — empty graph", () => {
  it("treats no roots as a valid empty graph", async () => {
    const counts = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const db = yield* openKorriConfigGraph({ roots: [] })
          return {
            launchers: (yield* Effect.promise(
              () => db.launchers.query().runPromise,
            )).length,
            library: (yield* Effect.promise(
              () => db.library.query().runPromise,
            )).length,
          }
        }),
      ),
    )
    expect(counts).toEqual({ launchers: 0, library: 0 })
  })

  it("treats empty roots with no opt-in files as a valid empty graph", async () => {
    await withTempRoots(2, async roots => {
      await writeFile(join(roots[0]!, "notes.txt"), "ignore me", "utf8")
      const count = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriConfigGraph({
              roots: roots.map(root => ({ root })),
            })
            return (yield* Effect.promise(() => db.library.query().runPromise))
              .length
          }),
        ),
      )
      expect(count).toBe(0)
    })
  })
})

describe("openKorriConfigGraph — ordered overlay", () => {
  it("merges sections contributed by different roots through opt-in files", async () => {
    await withTempRoots(2, async ([rootA, rootB]) => {
      await writeFile(
        join(rootA!, "korri.yaml"),
        [
          "storage:",
          "  roms:",
          "    root: /roms",
          "providers:",
          '  "@korri:roms":',
          "    title: Local ROM library",
          "systems:",
          "  snes:",
          "    name: Super Nintendo",
          "runtimes:",
          "  snes9x:",
          "    kind: libretro-core",
          "    path: /cores/snes9x_libretro.so",
          "launchers:",
          `  "${KORRI_RETROARCH_APP_ID}":`,
          `    plugin: "${KORRI_RETROARCH_PLUGIN_ID}"`,
          "    command: retroarch",
          '    args: ["-L", "{runtime.path}", "{content.path}"]',
          "    settings:",
          "      plugin:",
          "        paths:",
          "          systemDirectory: /bios",
          "",
        ].join("\n"),
        "utf8",
      )
      await writeFile(
        join(rootB!, "library.korri.yaml"),
        [
          "library:",
          "  zelda:",
          "    title: Zelda",
          "    releases:",
          "      - id: snes",
          "        system: snes",
          "        target:",
          "          kind: file",
          "          storage: roms",
          "          path: snes/zelda.sfc",
          "        launch:",
          `          use: "${KORRI_RETROARCH_APP_ID}"`,
          "          runtime: snes9x",
          "",
        ].join("\n"),
        "utf8",
      )

      const loaded = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriConfigGraph({
              roots: [{ root: rootA! }, { root: rootB! }],
            })
            const repository = createLibraryRepository(db, {
              launchIntegrations: [retroarchReadableLaunchIntegration],
            })
            return {
              app: yield* db.launchers.findById(KORRI_RETROARCH_APP_ID),
              item: yield* db.library.findById("zelda"),
              launch: yield* repository.resolveLaunchForPlayable("zelda"),
            }
          }),
        ),
      )

      expect(loaded.app.command).toBe("retroarch")
      expect(loaded.item.title).toBe("Zelda")
      expect(loaded.launch.spec.args).toContain("/cores/snes9x_libretro.so")
      expect(loaded.launch.spec.args).toContain("/roms/snes/zelda.sfc")
    })
  })

  it("deep-merges nested objects and lets later roots win on scalars", async () => {
    await withTempRoots(2, async ([rootA, rootB]) => {
      await writeFile(
        join(rootA!, "korri.yaml"),
        [
          "launchers:",
          `  "${KORRI_RETROARCH_APP_ID}":`,
          `    plugin: "${KORRI_RETROARCH_PLUGIN_ID}"`,
          "    command: retroarch",
          '    args: ["-L", "{runtime.path}", "{content.path}"]',
          "    settings:",
          "      plugin:",
          "        paths:",
          "          systemDirectory: /bios",
          "    launch:",
          "      with:",
          '        "@example:wrapper":',
          "          backend:",
          "            type: drm",
          "",
        ].join("\n"),
        "utf8",
      )
      await writeFile(
        join(rootB!, "overlay.korri.yaml"),
        [
          "launchers:",
          `  "${KORRI_RETROARCH_APP_ID}":`,
          "    command: retroarch-override",
          "    launch:",
          "      with:",
          '        "@example:wrapper":',
          "          app:",
          "            environment:",
          "              WAYLAND_DISPLAY: null",
          "",
        ].join("\n"),
        "utf8",
      )

      const app = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriConfigGraph({
              roots: [{ root: rootA! }, { root: rootB! }],
            })
            return yield* db.launchers.findById(KORRI_RETROARCH_APP_ID)
          }),
        ),
      )

      expect(app.command).toBe("retroarch-override")
      const wrapper = app.launch?.with?.["@example:wrapper"] as
        | {
            readonly backend?: { readonly type?: string }
            readonly app?: {
              readonly environment?: Readonly<Record<string, string | null>>
            }
          }
        | undefined
      expect(wrapper?.backend?.type).toBe("drm")
      expect(wrapper?.app?.environment).toEqual({ WAYLAND_DISPLAY: null })
    })
  })
})

describe("openKorriConfigGraph — cross-format parity", () => {
  it("produces identical records for YAML and JSON fragments", async () => {
    await withTempRoots(2, async ([yamlRoot, jsonRoot]) => {
      await writeFile(
        join(yamlRoot!, "korri.yaml"),
        ["systems:", "  snes:", "    name: Super Nintendo", ""].join("\n"),
        "utf8",
      )
      await writeFile(
        join(jsonRoot!, "config.korri.json"),
        `${JSON.stringify({ systems: { genesis: { name: "Sega Genesis" } } }, null, 2)}\n`,
        "utf8",
      )

      const systems = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriConfigGraph({
              roots: [{ root: yamlRoot! }, { root: jsonRoot! }],
            })
            return {
              snes: yield* db.systems.findById("snes"),
              genesis: yield* db.systems.findById("genesis"),
            }
          }),
        ),
      )

      expect(systems.snes.name).toBe("Super Nintendo")
      expect(systems.genesis.name).toBe("Sega Genesis")
    })
  })
})

describe("openKorriConfigGraph — discovery boundaries", () => {
  it("ignores files that are not opt-in korri fragments", async () => {
    await withTempRoots(1, async ([root]) => {
      await writeFile(
        join(root!, "library.yaml"),
        ["systems:", "  snes:", "    name: Super Nintendo", ""].join("\n"),
        "utf8",
      )
      await writeFile(
        join(root!, "random.json"),
        `${JSON.stringify({ systems: { genesis: { name: "Genesis" } } })}\n`,
        "utf8",
      )

      const count = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriConfigGraph({ roots: [{ root: root! }] })
            return (yield* Effect.promise(() => db.systems.query().runPromise))
              .length
          }),
        ),
      )
      expect(count).toBe(0)
    })
  })
})

describe("openKorriConfigGraph — host singleton", () => {
  it("exposes a plain host block under the local key without double wrapping", async () => {
    await withTempRoots(1, async ([root]) => {
      await writeFile(
        join(root!, "korri.yaml"),
        ["host:", "  title: Config Graph Host", ""].join("\n"),
        "utf8",
      )

      const host = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriConfigGraph({ roots: [{ root: root! }] })
            return yield* db.host.findById(LOCAL_HOST_KEY)
          }),
        ),
      )

      expect(host.title).toBe("Config Graph Host")
    })
  })
})

describe("openKorriConfigGraph — fragment-error containment", () => {
  it("skips a fragment that violates the strict schema and surfaces a diagnostic", async () => {
    await withTempRoots(1, async ([root]) => {
      await mkdir(root!, { recursive: true })
      await writeFile(
        join(root!, "korri.yaml"),
        ["host:", "  title: AKA", "  role: desktop", ""].join("\n"),
        "utf8",
      )
      await writeFile(
        join(root!, "good.korri.yaml"),
        [
          "library:",
          "  zelda:",
          "    title: Zelda",
          "    releases:",
          "      - id: snes",
          "        system: snes",
          "        target:",
          "          kind: file",
          "          storage: roms",
          "          path: snes/zelda.sfc",
          "",
        ].join("\n"),
        "utf8",
      )

      const loaded = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriConfigGraph({ roots: [{ root: root! }] })
            return {
              item: yield* db.library.findById("zelda"),
              hosts: yield* Effect.promise(() => db.host.query().runPromise),
              diagnostics: yield* db.$documentGraph.getDiagnostics(),
            }
          }),
        ),
      )

      // The broken fragment is skipped, not fatal: the rest of the graph
      // still builds and the skip is observable as a diagnostic.
      expect(loaded.item.title).toBe("Zelda")
      expect(loaded.hosts.length).toBe(0)
      expect(
        loaded.diagnostics.some(
          diagnostic =>
            diagnostic.action === "skipped-fragment" &&
            diagnostic.path?.endsWith("korri.yaml") === true,
        ),
      ).toBe(true)
    })
  })

  it("skips a fragment with an unknown top-level collection", async () => {
    await withTempRoots(1, async ([root]) => {
      await writeFile(
        join(root!, "korri.yaml"),
        ["launchTargets:", "  legacy:", "    gameId: x", ""].join("\n"),
        "utf8",
      )
      const diagnostics = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriConfigGraph({ roots: [{ root: root! }] })
            return yield* db.$documentGraph.getDiagnostics()
          }),
        ),
      )
      expect(
        diagnostics.some(
          diagnostic => diagnostic.action === "skipped-fragment",
        ),
      ).toBe(true)
    })
  })

  it("still fails to open when a non-optional root is missing", async () => {
    await withTempRoots(1, async ([root]) => {
      const exit = await Effect.runPromiseExit(
        Effect.scoped(
          openKorriConfigGraph({
            roots: [{ root: join(root!, "missing"), optional: false }],
          }),
        ),
      )
      expect(exit._tag).toBe("Failure")
    })
  })
})

describe("openKorriConfigGraph — collection-scoped trust", () => {
  const trustedHostFragment = [
    "host:",
    "  moonlight:",
    "    command: trusted-moonlight",
    "",
  ].join("\n")

  const cardFragment = [
    "host:",
    "  moonlight:",
    "    command: evil-moonlight",
    "library:",
    "  zelda:",
    "    title: Card Zelda",
    "    releases:",
    "      - id: snes",
    "        system: snes",
    "        target:",
    "          kind: file",
    "          storage: roms",
    "          path: snes/zelda.sfc",
    "",
  ].join("\n")

  it("drops execution-privileged sections from a restricted root but keeps its data", async () => {
    await withTempRoots(2, async ([trusted, card]) => {
      await writeFile(join(trusted!, "korri.yaml"), trustedHostFragment, "utf8")
      await writeFile(join(card!, "card.korri.yaml"), cardFragment, "utf8")

      const loaded = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriConfigGraph({
              roots: [
                { root: trusted! },
                { root: card!, collections: REMOVABLE_CONFIG_COLLECTIONS },
              ],
            })
            return {
              host: yield* db.host.findById(LOCAL_HOST_KEY),
              item: yield* db.library.findById("zelda"),
            }
          }),
        ),
      )

      // The card's host override is NOT applied; the trusted static value
      // stays in effect. Its data collections still load (card-wins library).
      expect(loaded.host.moonlight?.command).toBe("trusted-moonlight")
      expect(loaded.item.title).toBe("Card Zelda")
    })
  })

  it("does not load sidecar collections from a restricted root", async () => {
    await withTempRoots(2, async ([trusted, card]) => {
      await writeFile(join(trusted!, "korri.yaml"), trustedHostFragment, "utf8")
      await writeFile(join(card!, "card.korri.yaml"), cardFragment, "utf8")
      await writeFile(join(card!, ".korri-artifacts.json"), "not-json", "utf8")

      const loaded = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriConfigGraph({
              roots: [
                { root: trusted! },
                { root: card!, collections: REMOVABLE_CONFIG_COLLECTIONS },
              ],
            })
            return yield* db.library.findById("zelda")
          }),
        ),
      )

      expect(loaded.title).toBe("Card Zelda")
    })
  })

  it("lets a restricted root win on data collections (card-wins)", async () => {
    await withTempRoots(2, async ([base, card]) => {
      await writeFile(
        join(base!, "korri.yaml"),
        [
          "library:",
          "  zelda:",
          "    title: Base Zelda",
          "    releases:",
          "      - id: snes",
          "        system: snes",
          "        target:",
          "          kind: file",
          "          storage: roms",
          "          path: snes/zelda.sfc",
          "",
        ].join("\n"),
        "utf8",
      )
      await writeFile(
        join(card!, "card.korri.yaml"),
        [
          "library:",
          "  zelda:",
          "    title: Card Zelda",
          "    releases:",
          "      - id: snes",
          "        system: snes",
          "        target:",
          "          kind: file",
          "          storage: roms",
          "          path: snes/zelda-card.sfc",
          "",
        ].join("\n"),
        "utf8",
      )

      const item = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriConfigGraph({
              roots: [
                { root: base! },
                { root: card!, collections: REMOVABLE_CONFIG_COLLECTIONS },
              ],
            })
            return yield* db.library.findById("zelda")
          }),
        ),
      )

      expect(item.title).toBe("Card Zelda")
    })
  })

  it("does not load fragments that symlink-escape a restricted root", async () => {
    await withTempRoots(3, async ([trusted, card, outside]) => {
      await writeFile(join(trusted!, "korri.yaml"), trustedHostFragment, "utf8")
      await writeFile(
        join(outside!, "escape.korri.yaml"),
        [
          "library:",
          "  smuggled:",
          "    title: Smuggled",
          "    releases:",
          "      - id: snes",
          "        system: snes",
          "        target:",
          "          kind: file",
          "          storage: roms",
          "          path: snes/smuggled.sfc",
          "",
        ].join("\n"),
        "utf8",
      )
      await symlink(
        join(outside!, "escape.korri.yaml"),
        join(card!, "escape.korri.yaml"),
      )
      await writeFile(
        join(card!, "card.korri.yaml"),
        [
          "library:",
          "  zelda:",
          "    title: Card Zelda",
          "    releases:",
          "      - id: snes",
          "        system: snes",
          "        target:",
          "          kind: file",
          "          storage: roms",
          "          path: snes/zelda.sfc",
          "",
        ].join("\n"),
        "utf8",
      )

      const loaded = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriConfigGraph({
              roots: [
                { root: trusted! },
                { root: card!, collections: REMOVABLE_CONFIG_COLLECTIONS },
              ],
            })
            return {
              items: yield* Effect.promise(() => db.library.query().runPromise),
              diagnostics: yield* db.$documentGraph.getDiagnostics(),
            }
          }),
        ),
      )

      // ProseQL 0.15 discovery does not follow symlinks (file or directory
      // entries that are symlinks are never listed), so the escaping
      // fragment is excluded before the transform's defense-in-depth
      // realpath guard ever runs — no diagnostic, just absence.
      expect(loaded.items.map(item => item.id).sort()).toEqual(["zelda"])
      expect(loaded.diagnostics).toEqual([])
    })
  })

  it("skips a restricted root's broken fragment while its valid fragment still loads", async () => {
    await withTempRoots(2, async ([trusted, card]) => {
      await writeFile(join(trusted!, "korri.yaml"), trustedHostFragment, "utf8")
      await writeFile(
        join(card!, "broken.korri.yaml"),
        ["library:", "  broken:", "    releases: not-a-list", ""].join("\n"),
        "utf8",
      )
      await writeFile(join(card!, "card.korri.yaml"), cardFragment, "utf8")

      const loaded = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriConfigGraph({
              roots: [
                { root: trusted! },
                { root: card!, collections: REMOVABLE_CONFIG_COLLECTIONS },
              ],
            })
            return {
              item: yield* db.library.findById("zelda"),
              diagnostics: yield* db.$documentGraph.getDiagnostics(),
            }
          }),
        ),
      )

      // Only the broken fragment is skipped; the card's valid data still
      // contributes under its restricted scope.
      expect(loaded.item.title).toBe("Card Zelda")
      expect(
        loaded.diagnostics.some(
          diagnostic =>
            diagnostic.action === "skipped-fragment" &&
            diagnostic.path?.endsWith("broken.korri.yaml") === true,
        ),
      ).toBe(true)
    })
  })

  it("surfaces an ignored-collection diagnostic for out-of-scope card sections", async () => {
    await withTempRoots(2, async ([trusted, card]) => {
      await writeFile(join(trusted!, "korri.yaml"), trustedHostFragment, "utf8")
      await writeFile(join(card!, "card.korri.yaml"), cardFragment, "utf8")

      const diagnostics = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriConfigGraph({
              roots: [
                { root: trusted! },
                {
                  root: card!,
                  id: "removable-card",
                  collections: REMOVABLE_CONFIG_COLLECTIONS,
                },
              ],
            })
            return yield* db.$documentGraph.getDiagnostics()
          }),
        ),
      )

      expect(
        diagnostics.some(
          diagnostic =>
            diagnostic.action === "ignored-collection" &&
            diagnostic.rootId === "removable-card" &&
            diagnostic.collection === "host",
        ),
      ).toBe(true)
    })
  })

  it("does not validate out-of-scope sections from a restricted root", async () => {
    await withTempRoots(2, async ([trusted, card]) => {
      await writeFile(join(trusted!, "korri.yaml"), trustedHostFragment, "utf8")
      // The card's host section is schema-invalid, but host is outside the
      // card's allowed collections: it must be ignored, not validated, so
      // the card's data still loads.
      await writeFile(
        join(card!, "card.korri.yaml"),
        [
          "host:",
          "  title: AKA",
          "  role: desktop",
          "library:",
          "  zelda:",
          "    title: Card Zelda",
          "    releases:",
          "      - id: snes",
          "        system: snes",
          "        target:",
          "          kind: file",
          "          storage: roms",
          "          path: snes/zelda.sfc",
          "",
        ].join("\n"),
        "utf8",
      )

      const loaded = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriConfigGraph({
              roots: [
                { root: trusted! },
                { root: card!, collections: REMOVABLE_CONFIG_COLLECTIONS },
              ],
            })
            return {
              host: yield* db.host.findById(LOCAL_HOST_KEY),
              item: yield* db.library.findById("zelda"),
            }
          }),
        ),
      )

      expect(loaded.host.moonlight?.command).toBe("trusted-moonlight")
      expect(loaded.item.title).toBe("Card Zelda")
    })
  })

  it("exposes record provenance with the winning contributor", async () => {
    await withTempRoots(2, async ([base, card]) => {
      const itemFragment = (title: string) =>
        [
          "library:",
          "  zelda:",
          `    title: ${title}`,
          "    releases:",
          "      - id: snes",
          "        system: snes",
          "        target:",
          "          kind: file",
          "          storage: roms",
          "          path: snes/zelda.sfc",
          "",
        ].join("\n")
      await writeFile(join(base!, "korri.yaml"), itemFragment("Base"), "utf8")
      await writeFile(
        join(card!, "card.korri.yaml"),
        itemFragment("Card"),
        "utf8",
      )

      const provenance = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriConfigGraph({
              roots: [
                { root: base!, id: "base" },
                {
                  root: card!,
                  id: "removable-card",
                  collections: REMOVABLE_CONFIG_COLLECTIONS,
                },
              ],
            })
            return yield* db.$documentGraph.getRecordProvenance(
              "library",
              "zelda",
            )
          }),
        ),
      )

      expect(provenance?.effectiveContributor.rootId).toBe("removable-card")
      expect(
        provenance?.contributors.map(contribution => contribution.rootId),
      ).toEqual(["base", "removable-card"])
    })
  })

  it("keeps unrestricted roots contributing every collection", async () => {
    await withTempRoots(1, async ([root]) => {
      await writeFile(join(root!, "korri.yaml"), trustedHostFragment, "utf8")
      const host = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriConfigGraph({
              roots: [{ root: root!, collections: "all" }],
            })
            return yield* db.host.findById(LOCAL_HOST_KEY)
          }),
        ),
      )
      expect(host.moonlight?.command).toBe("trusted-moonlight")
    })
  })

  it("keeps the top-level hooks collection frozen against restricted roots", async () => {
    await withTempRoots(2, async ([trusted, card]) => {
      await writeFile(
        join(trusted!, "korri.yaml"),
        [
          "hooks:",
          "  battery-saver:",
          "    before:",
          "      - name: cap-clocks",
          "        run: echo trusted-cap",
          "",
        ].join("\n"),
        "utf8",
      )
      await writeFile(
        join(card!, "card.korri.yaml"),
        [
          "hooks:",
          "  evil:",
          "    before:",
          "      - name: pwn",
          "        run: echo evil",
          "library:",
          "  zelda:",
          "    title: Card Zelda",
          "    releases:",
          "      - id: snes",
          "        system: snes",
          "        target:",
          "          kind: file",
          "          storage: roms",
          "          path: snes/zelda.sfc",
          "",
        ].join("\n"),
        "utf8",
      )

      const loaded = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriConfigGraph({
              roots: [
                { root: trusted! },
                {
                  root: card!,
                  id: "removable-card",
                  collections: REMOVABLE_CONFIG_COLLECTIONS,
                },
              ],
            })
            return {
              profiles: yield* Effect.promise(
                () => db.hooks.query().runPromise,
              ),
              item: yield* db.library.findById("zelda"),
              diagnostics: yield* db.$documentGraph.getDiagnostics(),
            }
          }),
        ),
      )

      // The trusted root's profile loads; the card's profile is ignored
      // via the same frozen-collection mechanism that protects host.
      expect(loaded.profiles.map(profile => profile.id)).toEqual([
        "battery-saver",
      ])
      expect(loaded.item.title).toBe("Card Zelda")
      expect(
        loaded.diagnostics.some(
          diagnostic =>
            diagnostic.action === "ignored-collection" &&
            diagnostic.rootId === "removable-card" &&
            diagnostic.collection === "hooks",
        ),
      ).toBe(true)
    })
  })

  it("strips per-entry hook fields from a restricted root while trusted hooks load", async () => {
    await withTempRoots(2, async ([trusted, card]) => {
      await writeFile(
        join(trusted!, "korri.yaml"),
        [
          "library:",
          "  mario:",
          "    title: Trusted Mario",
          "    hooks:",
          "      before:",
          "        - name: trusted-item-hook",
          "          run: echo trusted",
          "    releases:",
          "      - id: snes",
          "        system: snes",
          "        target:",
          "          kind: file",
          "          storage: roms",
          "          path: snes/mario.sfc",
          "        hooks:",
          "          before:",
          "            - name: trusted-release-hook",
          "              run: echo trusted-release",
          "",
        ].join("\n"),
        "utf8",
      )
      await writeFile(
        join(card!, "card.korri.yaml"),
        [
          "library:",
          "  zelda:",
          "    title: Card Zelda",
          "    hooks:",
          "      before:",
          "        - name: card-item-hook",
          "          run: echo evil",
          "    releases:",
          "      - id: snes",
          "        system: snes",
          "        target:",
          "          kind: file",
          "          storage: roms",
          "          path: snes/zelda.sfc",
          "        hooks:",
          "          after:",
          "            - name: card-release-hook",
          "              run: echo evil-after",
          "users:",
          "  mallory:",
          "    displayName: Mallory",
          "    hooks:",
          "      before:",
          "        - name: card-user-hook",
          "          run: echo evil-user",
          "",
        ].join("\n"),
        "utf8",
      )

      const loaded = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriConfigGraph({
              roots: [
                { root: trusted! },
                {
                  root: card!,
                  id: "removable-card",
                  collections: REMOVABLE_CONFIG_COLLECTIONS,
                },
              ],
            })
            return {
              trustedItem: yield* db.library.findById("mario"),
              cardItem: yield* db.library.findById("zelda"),
              cardUser: yield* db.users.findById("mallory"),
            }
          }),
        ),
      )

      // Trusted-root hooks survive intact.
      expect(loaded.trustedItem.hooks?.before?.[0]?.name).toBe(
        "trusted-item-hook",
      )
      expect(loaded.trustedItem.releases[0]?.hooks?.before?.[0]?.name).toBe(
        "trusted-release-hook",
      )
      // The card's entries load, but every executable hook field is stripped.
      expect(loaded.cardItem.title).toBe("Card Zelda")
      expect(loaded.cardItem.hooks).toBeUndefined()
      expect(loaded.cardItem.releases[0]?.hooks).toBeUndefined()
      expect(loaded.cardUser.displayName).toBe("Mallory")
      expect(loaded.cardUser.hooks).toBeUndefined()
    })
  })
})

describe("openKorriConfigGraph — host.hooks trust-removable", () => {
  const launchStackLines = [
    "storage:",
    "  roms:",
    "    root: /roms",
    "systems:",
    "  snes:",
    "    name: Super Nintendo",
    "runtimes:",
    "  snes9x:",
    "    kind: libretro-core",
    "    path: /cores/snes9x_libretro.so",
    "launchers:",
    `  "${KORRI_RETROARCH_APP_ID}":`,
    `    plugin: "${KORRI_RETROARCH_PLUGIN_ID}"`,
    "    command: retroarch",
    '    args: ["-L", "{runtime.path}", "{content.path}"]',
    "    settings:",
    "      plugin:",
    "        paths:",
    "          systemDirectory: /bios",
  ]

  const trustingHostFragment = [
    "host:",
    "  hooks:",
    "    trust-removable: true",
    ...launchStackLines,
    "",
  ].join("\n")

  const cardHookedLibraryLines = [
    "library:",
    "  zelda:",
    "    title: Card Zelda",
    "    hooks:",
    "      before:",
    "        - name: card-item-before",
    "          run: echo card-item",
    "    releases:",
    "      - id: snes",
    "        system: snes",
    "        target:",
    "          kind: file",
    "          storage: roms",
    "          path: snes/zelda.sfc",
    "        launch:",
    `          use: "${KORRI_RETROARCH_APP_ID}"`,
    "          runtime: snes9x",
    "        hooks:",
    "          before:",
    "            - name: card-release-before",
    "              run: echo card-release",
    "          after:",
    "            - name: card-release-after",
    "              run: echo card-after",
  ]

  const cardHookedLibraryFragment = [...cardHookedLibraryLines, ""].join("\n")

  it("keeps removable-root inline hooks and resolves them through the cascade when the trusted host opts in", async () => {
    await withTempRoots(2, async ([trusted, card]) => {
      await writeFile(
        join(trusted!, "korri.yaml"),
        trustingHostFragment,
        "utf8",
      )
      await writeFile(
        join(card!, "card.korri.yaml"),
        cardHookedLibraryFragment,
        "utf8",
      )

      const loaded = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriConfigGraph({
              roots: [
                { root: trusted! },
                {
                  root: card!,
                  id: "removable-card",
                  collections: REMOVABLE_CONFIG_COLLECTIONS,
                },
              ],
            })
            const repository = createLibraryRepository(db, {
              launchIntegrations: [retroarchReadableLaunchIntegration],
            })
            return {
              item: yield* db.library.findById("zelda"),
              resolved: yield* repository.resolveLaunchForPlayable("zelda"),
            }
          }),
        ),
      )

      // Inline hooks survive the graph load intact…
      expect(loaded.item.hooks?.before?.[0]?.name).toBe("card-item-before")
      expect(loaded.item.releases[0]?.hooks?.before?.[0]?.name).toBe(
        "card-release-before",
      )
      // …and fold through the readable cascade in inheritance order.
      expect(loaded.resolved.hooks?.before.map(step => step.name)).toEqual([
        "card-item-before",
        "card-release-before",
      ])
      expect(loaded.resolved.hooks?.after.map(step => step.name)).toEqual([
        "card-release-after",
      ])
    })
  })

  it("still strips removable-root hooks when the trusted host sets trust-removable false", async () => {
    await withTempRoots(2, async ([trusted, card]) => {
      await writeFile(
        join(trusted!, "korri.yaml"),
        ["host:", "  hooks:", "    trust-removable: false", ""].join("\n"),
        "utf8",
      )
      await writeFile(
        join(card!, "card.korri.yaml"),
        cardHookedLibraryFragment,
        "utf8",
      )

      const loaded = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriConfigGraph({
              roots: [
                { root: trusted! },
                {
                  root: card!,
                  id: "removable-card",
                  collections: REMOVABLE_CONFIG_COLLECTIONS,
                },
              ],
            })
            return {
              host: yield* db.host.findById(LOCAL_HOST_KEY),
              item: yield* db.library.findById("zelda"),
            }
          }),
        ),
      )

      // The trusted host decodes (the flag is legal host vocabulary) but the
      // strip stays in force exactly as with an absent flag.
      expect(loaded.host.hooks?.["trust-removable"]).toBe(false)
      expect(loaded.item.title).toBe("Card Zelda")
      expect(loaded.item.hooks).toBeUndefined()
      expect(loaded.item.releases[0]?.hooks).toBeUndefined()
    })
  })

  it("ignores trust-removable carried by the removable root itself (no self-grant)", async () => {
    await withTempRoots(2, async ([trusted, card]) => {
      await writeFile(
        join(trusted!, "korri.yaml"),
        ["host:", "  title: Trusted Host", ""].join("\n"),
        "utf8",
      )
      await writeFile(
        join(card!, "card.korri.yaml"),
        [
          "host:",
          "  hooks:",
          "    trust-removable: true",
          ...cardHookedLibraryLines,
          "",
        ].join("\n"),
        "utf8",
      )

      const loaded = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriConfigGraph({
              roots: [
                { root: trusted! },
                {
                  root: card!,
                  id: "removable-card",
                  collections: REMOVABLE_CONFIG_COLLECTIONS,
                },
              ],
            })
            return {
              host: yield* db.host.findById(LOCAL_HOST_KEY),
              item: yield* db.library.findById("zelda"),
              diagnostics: yield* db.$documentGraph.getDiagnostics(),
            }
          }),
        ),
      )

      // The card's host section is frozen (ignored-collection) and its flag
      // never unlocks its own hooks: the strip still applies.
      expect(loaded.host.hooks).toBeUndefined()
      expect(loaded.item.hooks).toBeUndefined()
      expect(loaded.item.releases[0]?.hooks).toBeUndefined()
      expect(
        loaded.diagnostics.some(
          diagnostic =>
            diagnostic.action === "ignored-collection" &&
            diagnostic.rootId === "removable-card" &&
            diagnostic.collection === "host",
        ),
      ).toBe(true)
    })
  })

  it("keeps the top-level hooks profile collection frozen even with trust-removable true", async () => {
    await withTempRoots(2, async ([trusted, card]) => {
      await writeFile(
        join(trusted!, "korri.yaml"),
        trustingHostFragment,
        "utf8",
      )
      await writeFile(
        join(card!, "card.korri.yaml"),
        [
          "hooks:",
          "  evil:",
          "    before:",
          "      - name: pwn",
          "        run: echo evil",
          ...cardHookedLibraryLines,
          "",
        ].join("\n"),
        "utf8",
      )

      const loaded = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriConfigGraph({
              roots: [
                { root: trusted! },
                {
                  root: card!,
                  id: "removable-card",
                  collections: REMOVABLE_CONFIG_COLLECTIONS,
                },
              ],
            })
            return {
              profiles: yield* Effect.promise(
                () => db.hooks.query().runPromise,
              ),
              item: yield* db.library.findById("zelda"),
              diagnostics: yield* db.$documentGraph.getDiagnostics(),
            }
          }),
        ),
      )

      // Profiles are definitions, not per-entry data: the flag governs only
      // inline hooks, so the card's profile section stays frozen…
      expect(loaded.profiles).toEqual([])
      expect(
        loaded.diagnostics.some(
          diagnostic =>
            diagnostic.action === "ignored-collection" &&
            diagnostic.rootId === "removable-card" &&
            diagnostic.collection === "hooks",
        ),
      ).toBe(true)
      // …while its per-entry inline hooks survive.
      expect(loaded.item.hooks?.before?.[0]?.name).toBe("card-item-before")
    })
  })
})

describe("openKorriConfigGraph — read-only", () => {
  it("rejects writes to graph-backed collections", async () => {
    await withTempRoots(1, async ([root]) => {
      const exit = await Effect.runPromiseExit(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriConfigGraph({ roots: [{ root: root! }] })
            return yield* db.apps.create({
              id: "retroarch",
              command: "retroarch",
            })
          }),
        ),
      )
      expect(exit._tag).toBe("Failure")
    })
  })
})
