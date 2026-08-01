import { readFile } from "node:fs/promises"
import { parse } from "yaml"
import { Effect } from "effect"

import { plugin } from "./product/platform/plugin"
import { createPluginRegistry } from "./product/platform/plugin/registry"
import { resolveReadableLaunchContext } from "./product/platform/library/config/cascade-resolver"
import {
  appRecordKind,
  decodeAppRecord,
} from "./product/platform/library/config/records/app"
import { decodeHostRecord } from "./product/platform/library/config/records/host"
import { decodeLibraryItemRecord } from "./product/platform/library/config/records/library-item"
import { decodeProviderRecord } from "./product/platform/library/config/records/provider"
import { decodeSystemRecord } from "./product/platform/library/config/records/system"
import { validateReadableDocumentStrictly } from "./product/platform/library/proseql/library-db-core"

const fixture = process.argv[2]
if (!fixture) throw new Error("fixture directory required")

const config = parse(await readFile(`${fixture}/config.yaml`, "utf8"))
const library = parse(await readFile(`${fixture}/library.yaml`, "utf8"))
validateReadableDocumentStrictly(config)
validateReadableDocumentStrictly(library)

const declaration = JSON.parse(await readFile("declaration.json", "utf8"))
const androidPlugin = plugin(declaration)
const registry = createPluginRegistry([androidPlugin], {
  enabledPluginIds: [androidPlugin.id],
})
const disabledRegistry = createPluginRegistry([androidPlugin])
if (Object.keys(disabledRegistry.launchers).length !== 0) {
  throw new Error("disabled plugin still contributed a launcher")
}

const provider = decodeProviderRecord(Object.values(registry.providers)[0])
const system = decodeSystemRecord(Object.values(registry.systems)[0])
const app = decodeAppRecord(Object.values(registry.launchers)[0])
const host = decodeHostRecord({ id: "local", ...config.host })
const item = decodeLibraryItemRecord({
  id: "tmnt-shredders-revenge",
  ...library.library["tmnt-shredders-revenge"],
})
const context = await Effect.runPromise(
  resolveReadableLaunchContext(
    {
      host,
      users: new Map(),
      systems: new Map([[system.id, system]]),
      providers: new Map([[provider.id, provider]]),
      providerLinks: new Map(),
      readableLaunchers: new Map([[app.id, app]]),
      runtimes: new Map(),
      profiles: new Map(),
      hooks: new Map(),
      storage: new Map(),
      library: new Map([[item.id, item]]),
    },
    { playableId: item.id },
  ),
)

const expected = {
  pluginId: "@korri:android-app",
  providerId: "@korri:android-app",
  systemId: "android",
  launcherId: "@korri:android-app/android-app",
  launcherKind: "@korri:android-app",
  integrationToken: "android-app",
  playableId: "tmnt-shredders-revenge",
  releaseId: "android",
  resolvedTarget: "@korri:android-app:com.playdigious.tmnt",
}
const actual = {
  pluginId: androidPlugin.id,
  providerId: provider.id,
  systemId: system.id,
  launcherId: context.app.id,
  launcherKind: appRecordKind(context.app),
  integrationToken: context.app.command,
  playableId: context.playableId,
  releaseId: context.releaseId,
  resolvedTarget: context.target,
}
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  throw new Error(`unexpected resolution: ${JSON.stringify(actual, null, 2)}`)
}

console.log(JSON.stringify(actual, null, 2))
console.log("plugin disabled removes launcher: PASS")
console.log("legacy strict schema: PASS")
console.log("legacy readable context resolver: PASS")
