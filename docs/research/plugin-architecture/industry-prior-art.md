# Plugin/Extension Architecture: Prior Art Digest for Korri

**Research value: high** — Substantial prior art found across gaming, media-server, editor, and home-automation domains. Several architectures map cleanly onto Effect+Layer; others are cautionary. Playnite is the closest structural analog and the most actionable precedent.

---

## 1. VSCode Extension Model

**What it does:** Every extension is a Node.js module loaded into a separate *extension host process* — isolated from the renderer, communicating over a typed message protocol. Extensions declare an `activationEvents` list in `package.json` (e.g., `onLanguage:python`, `onCommand:...`) so they are loaded lazily on first relevant activity. "Contribution points" in the manifest declare what the extension *provides* (commands, keybindings, themes, views) so VS Code can render UI from manifest data before the extension activates. The API surface is intentionally narrow — no DOM access ever; extensions cannot crash the editor UI.

**Effect+Layer angle:** Contribution points are the structural equivalent of declaring `Layer.provide(MyService)` in a manifest — the host knows what a plugin exports before loading it. Activation events ≅ lazy Layer construction (`Layer.memoize` or deferred `Layer.effect`). The extension host process is a hard isolation boundary VS Code enforces because plugins crashed the UI too often in early prototypes. **Steal:** declarative contribution manifests; lazy activation by capability tag; narrow typed API boundary (no DOM). **Don't steal:** separate-process IPC for a single-box gaming app adds latency on every controller input; the trade-off makes sense for a code editor, not a game launcher.

**Sources:** https://vscode-docs.readthedocs.io/en/stable/extensions/our-approach/ · https://code.visualstudio.com/api/references/contribution-points

---

## 2. Obsidian Plugin Model

**What it does:** Single Electron renderer process. Plugins extend a `Plugin` class (which extends `Component`) and call `addCommand`, `registerView`, `registerEvent`, etc. in `onload()`. The `Component` base class tracks every registered resource and cleans it up automatically on `unload()` — no manual teardown needed. Manifest is a `manifest.json` with `id`, `version`, `minAppVersion`, `isDesktopOnly`. Community plugins are distributed via GitHub; Obsidian's BRAT tool and the built-in browser pull from a central JSON index. There is *no capability gating*: once enabled, a plugin has full access to `app.vault` (file system), `app.workspace`, and all Electron/Node.js APIs.

**Effect+Layer angle:** The `Component` lifecycle (register → auto-cleanup) is structurally what Effect Scope/finalizers already provide. `onload`/`onunload` = `Effect.acquireRelease`. The "no isolation" posture is reasonable for a local note-taking app where users install plugins manually and trust the source. **Steal:** the Component registration-cleanup pattern (Effect already handles this); the manifest `minAppVersion` gate. **Don't steal:** full trusted-process access is too broad for a public plugin ecosystem; works for Obsidian because plugins install from GitHub with community vetting, not from a package registry. The "single process, trust everyone" model is the right starting point for *in-tree first-party plugins* at Korri — not for third-party ecosystem plugins.

**Sources:** https://deepwiki.com/obsidianmd/obsidian-api/3-plugin-development · https://github.com/obsidianmd/obsidian-api

---

## 3. Home Assistant Integrations

**What it does:** Integrations are Python packages with a `manifest.json` (`domain`, `dependencies`, `requirements`, `config_flow: true`). The `config_flow.py` module defines a wizard-style, UI-driven setup flow (`async_step_user`, `async_step_zeroconf`, etc.) returning JSON-serializable config entries that survive HA restarts. An integration provides *entity platforms* (sensors, switches, media players) — each platform declares its capabilities declaratively. The `hass` object exposes the event bus, service registry, device registry, and state machine. Config entries have versioned schemas and an `async_migrate_entry` path for upgrades.

**Effect+Layer angle:** The config-flow pattern — a typed, multi-step wizard that produces a persistent config entry — is essentially Effect Schema + a wizard Effect that writes to a config store. Entity platforms ≅ Layer capability declarations ("`I provide a MediaPlayerService`"). Service registration (`hass.services.async_register`) ≅ registering Effect RPC handlers per-plugin. Config entry versioning = typed Schema migrations. **Steal:** the declarative config-flow wizard (maps well to Effect Schema + multi-step Effect); platform declarations as capability tokens; versioned config entries with migrations.

**Sources:** https://developers.home-assistant.io/docs/config_entries_config_flow_handler/

---

## 4. Plex/Jellyfin Plugin Systems

**Plex (sunsetted 2018):** Plex's original plugin system was a Python+XML "bundle" model where plugins rendered their own UI in a browser frame. It was sunsetted because "the ancient protocol plague[d] our app teams" — every new client had to implement plugin rendering independently, and most didn't. The lesson is stark: a plugin that owns rendering couples plugin developers to every client surface the host ships. Community plugins atrophied and became a security/maintenance liability once the plugin directory was removed.

**Jellyfin (current):** Plugins are .NET assemblies placed in a `plugins/` directory, each with a `meta.json` (`guid`, `version`, `targetAbi`, `assemblies`). A `PluginLoadContext` (subclass of `AssemblyLoadContext`) provides assembly-level isolation. Plugins register services via `IPluginServiceRegistrator` *before* the DI container is built, so plugin services participate in constructor injection. Remote repositories publish a JSON package index; `InstallationManager` downloads `.zip` archives, verifies MD5, extracts, and writes `meta.json`. `PluginStatus` lifecycle: `Active → Restart → Superseded/Deleted`. The assembly security safelist cross-references DLL names from the manifest with files physically present on disk.

**Effect+Layer angle:** Jellyfin's "plugin registers services before container construction" = plugin provides a `Layer` that the host `Layer.merge`s in. The GUID-based identity + version manifest = stable plugin identity contract. **Steal:** the checksum-verified package install flow; the ABI target version gate (`targetAbi`); registering into the DI layer before the container seals. **Don't steal:** .NET AssemblyLoadContext doesn't translate directly; the TS equivalent is dynamic `import()` + explicit Layer wiring.

**Sources:** https://deepwiki.com/jellyfin/jellyfin/8-plugin-system · https://forums.plex.tv/t/discontinuation-of-plugins-watch-later-recommended-and-cloud-sync/312312

---

## 5. Playnite: The Strongest Gaming Analog

**What it does:** Playnite is the closest structural match to Korri. It unifies Steam, GOG, Epic, itch.io, and emulators behind one launcher. Three plugin types:

- **`LibraryPlugin`** — Implements `GetGames()` (returns `GameMetadata[]`), owns client lifecycle (`CanShutdownClient`), and can supply a `LibraryMetadataProvider`. Loaded via `ExtensionFactory`, scanned from disk at startup.
- **`MetadataPlugin`** — Provides artwork, descriptions, ratings from an external database (IGDB is itself a `MetadataPlugin`).
- **`GenericPlugin`** — Everything else: UI panels, custom game actions (inject `Play`/`Install`/`Uninstall` actions at runtime), menu entries, game-event hooks.

Manifest is YAML (`extension.yaml`): `Id`, `Name`, `Type`, `Module` (DLL or .psm1). All plugin types receive an `IPlayniteAPI` via constructor injection — the full host API surface. Scripts (PowerShell) support lighter extensions but are being deprecated in favor of compiled plugins (IronPython was already removed). Distribution: `.pext` packages + Playnite's add-on database (curated JSON index).

**Effect+Layer angle:** `LibraryPlugin`/`MetadataPlugin`/`GenericPlugin` map directly to Effect Service shapes. A `LibraryPlugin` = a Layer providing a `LibraryService` with `getGames()`, `getInstallState()`, etc. The typed plugin-type enum (not an open string) is the right constraint: it tells the host exactly which interfaces to `yield*` from the Layer. The `IPlayniteAPI` injection = the host passes its own Layer to the plugin's constructor. **Steal everything here** — this is the gaming-first prior art that most directly applies.

**Sources:** https://deepwiki.com/JosefNemec/Playnite/4.1-library-plugins · https://api.playnite.link/docs/tutorials/extensions/intro.html

---

## 6. RetroArch Cores / Libretro

**What it does:** Libretro is a fixed C ABI contract: `retro_init`, `retro_load_game`, `retro_run`, `retro_get_system_av_info`, `retro_set_environment`. The core (`libsnes.so`, `mupen64plus.so`, etc.) *is* the game engine. RetroArch is the frontend that provides video/audio/input callbacks. The `retro_environment_t` callback is an escape hatch for the core to request features (`RETRO_ENVIRONMENT_GET_SAVESTATE_CONTEXT`, etc.) without breaking the binary ABI. Feature negotiation is numeric: if the frontend doesn't know a given environment constant, it returns `false` and the core degrades gracefully.

**Effect+Layer angle:** The fixed ABI ≅ a stable `Effect Service` contract that never changes. The environment callback ≅ optional service capability negotiation — a plugin calls `Effect.serviceOption(ExtraCapability)` and degrades if the host doesn't provide it. The frontend/core split (frontend owns I/O; core owns logic) is a clean "infrastructure at the edges" separation that maps naturally to Effect Layers. **Steal:** the environment-callback negotiation pattern for optional capability extension (a plugin requests capabilities it *can use*, gets back what the host *actually provides*, and handles `None`).

**Sources:** https://docs.libretro.com/development/cores/developing-cores/ · https://emulation.gametechwiki.com/index.php/Libretro

---

## 7. Safe Plugin Loading in TypeScript/JS

**What the evidence shows:**

- **`node:vm`** is explicitly documented as "not a security mechanism" — trivially escapable via `this.constructor.constructor('...')()` for RCE, and DoS-able with `while(true){}`. Do not use for untrusted code.
- **Web Workers** provide real thread isolation and message-passing, no DOM access by default, and CPU isolation (an infinite loop in a Worker doesn't hang the main thread). Useful for trusted-but-expensive plugins; insufficient for truly untrusted code without additional sandboxing.
- **`isolated-vm`** (npm): proper V8 isolate with CPU/memory limits. The right primitive for untrusted code in a Node.js/Bun environment when you need JS execution.
- **Deno Sandbox / Cloudflare Dynamic Workers (EmDash)**: V8 isolates with capability-manifest API injection. Only APIs declared in `capabilities[]` are injected into the isolate context; `fetch()` is hostname-scoped at the runtime level. KV storage is namespace-scoped per plugin. Cold start sub-5ms. This is the current gold standard for JS plugin sandboxing (as of 2026).
- **Dynamic `import()`** (ESM): the correct mechanism for manifest-first lazy loading. The plugin manifest is read, validated, and only then `await import(pluginPath)` is called. The module export is the plugin's Layer/service factory. This keeps untrusted plugins off the critical-path bundle and enables GC when a plugin is disabled.
- **Capability token pattern**: the host constructs a capability object at plugin-load time (e.g., `{ library: LibraryAPI, metadata?: MetadataAPI }`) and passes only that to the plugin factory. The plugin cannot reach outside the passed context — a software-enforced capability model that doesn't require isolates for *trusted* in-tree plugins.

**Effect+Layer angle:** A plugin that imports `Layer<LibraryService>` and exports `Layer<AppPlugin>` has a provably scoped capability surface — the TypeScript type system itself encodes what the plugin can access. For untrusted third-party plugins, wrap the factory call in an `isolated-vm` isolate and communicate over a typed Effect RPC channel. The plugin's Layer runs inside the isolate; the host's Layer runs outside; the wire protocol is Effect Schema-validated.

**Sources:** https://snyk.io/blog/security-concerns-javascript-sandbox-node-js-vm-module/ · https://www.npmjs.com/package/isolated-vm · https://lushbinary.com/blog/emdash-plugin-development-typescript-capabilities-security-2026/

---

## 8. Comparison Table

| Architecture | Process Model | Contract Surface | Distribution Model | Gaming-First Fit |
|---|---|---|---|---|
| **VSCode** | Separate extension host (Node.js IPC) | `package.json` contribution points + typed TS API | VSIX packages + Marketplace | Low — IPC latency, UI isolation overkill for single-box launcher |
| **Obsidian** | Same renderer process, full Node/Electron access | `Plugin` class + `App` object (unrestricted) | GitHub repos + central JSON index + BRAT | Medium — right for in-tree trusted plugins; too open for ecosystem |
| **Home Assistant** | Same Python process + async event loop | Manifest + config-flow + entity platforms + service registry | HACS (git-based) + HA Core | Medium — config-flow pattern is excellent; entity-platform typing maps well to Effect Services |
| **Plex (R.I.P.)** | Same server process, rendering delegated to clients | Python bundle + XML PMS API | Plugin Directory (removed 2018) | Negative — rendering-per-client coupling killed it; clear anti-pattern |
| **Jellyfin** | In-process .NET AssemblyLoadContext | IPlugin + DI service registration | Remote JSON repo + zip/MD5 install | Medium — package install flow and ABI versioning are directly applicable |
| **Playnite** | In-process CLR, constructor DI | LibraryPlugin / MetadataPlugin / GenericPlugin + IPlayniteAPI | Playnite add-on database (.pext) | **High** — closest structural analog; three plugin types map directly to Effect Service shapes |
| **libretro** | Separate process or dlopen in-process | Fixed C ABI (`retro_run` etc.) + environment callback for opt-in capabilities | Core downloader in RetroArch | High for *execution engine* plugins; ABI negotiation pattern directly applicable |
| **EmDash/Dynamic Workers** | V8 isolate per plugin (workerd/Cloudflare) | `definePlugin()` + declared `capabilities[]`; APIs injected at isolate construction | npm/JSR + plugin registry | Medium — gold standard for untrusted 3rd-party; isolate overhead may be unnecessary for in-tree plugins |

---

## Sources

| URL | Description |
|---|---|
| https://vscode-docs.readthedocs.io/en/stable/extensions/our-approach/ | VSCode extensibility architecture overview |
| https://deepwiki.com/obsidianmd/obsidian-api/3-plugin-development | Obsidian Plugin class, manifest, lifecycle, and cleanup model |
| https://developers.home-assistant.io/docs/config_entries_config_flow_handler/ | Home Assistant config-flow wizard and platform declaration |
| https://deepwiki.com/jellyfin/jellyfin/8-plugin-system | Jellyfin PluginManager, AssemblyLoadContext, InstallationManager |
| https://forums.plex.tv/t/discontinuation-of-plugins-watch-later-recommended-and-cloud-sync/312312 | Plex official plugin sunset announcement (Sept 2018) |
| https://deepwiki.com/JosefNemec/Playnite/4.1-library-plugins | Playnite LibraryPlugin architecture with event table |
| https://api.playnite.link/docs/tutorials/extensions/intro.html | Playnite extension types, manifest, distribution, and script/plugin matrix |
| https://docs.libretro.com/development/cores/developing-cores/ | libretro core ABI and environment callback pattern |
| https://snyk.io/blog/security-concerns-javascript-sandbox-node-js-vm-module/ | node:vm escape vectors (RCE via prototype chain, DoS) |
| https://www.npmjs.com/package/isolated-vm | isolated-vm: proper V8 isolate sandboxing for Node/Bun |
| https://lushbinary.com/blog/emdash-plugin-development-typescript-capabilities-security-2026/ | EmDash (Cloudflare) TypeScript capability-manifest + V8 isolate plugin model (Apr 2026) |
