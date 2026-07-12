import { describe, expect, it } from "bun:test"
import { catalogFactsSourceLayerAtom } from "@platform/react/catalog/catalog-atoms"
import {
  foregroundSessionStatusLayerAtom,
  launcherLayerAtom,
  librarySourceLayerAtom,
} from "@platform/react/library/library-atoms"
import { remoteCatalogSourceLayerAtom } from "./remote-catalog-atoms"

/**
 * Composition roots seed these layer atoms exactly once via
 * useAtomInitialValues. Registry nodes without subscribers are disposed, so a
 * non-keepAlive seeded layer silently reverts to its loading-forever default
 * the next time a route reads it — on the Bandai kiosk this made Store search
 * hang forever with a stale "Nothing found" after navigating Home → Store.
 */
describe("seeded layer atoms survive unsubscribed periods", () => {
  const cases = [
    ["remoteCatalogSourceLayerAtom", remoteCatalogSourceLayerAtom],
    ["catalogFactsSourceLayerAtom", catalogFactsSourceLayerAtom],
    ["librarySourceLayerAtom", librarySourceLayerAtom],
    ["launcherLayerAtom", launcherLayerAtom],
    ["foregroundSessionStatusLayerAtom", foregroundSessionStatusLayerAtom],
  ] as const

  for (const [name, atom] of cases) {
    it(`${name} is keepAlive`, () => {
      expect(atom.keepAlive).toBe(true)
    })
  }
})
