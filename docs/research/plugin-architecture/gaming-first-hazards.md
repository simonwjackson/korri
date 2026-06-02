# Gaming-First Plugin System: Hazards & Precedents Brief

> **Research value: high** — Substantial prior art across Decky Loader, VSCode, Playnite, Kodi, Home Assistant, and Obsidian with directly applicable patterns and named failure modes.

---

## 1. Privileged Core vs Plugin Shell Separation

**The pattern:** The primary surface (game library / launcher) is not a plugin slot. Plugins get a *secondary surface* with a hard entry gate.

**Steam Deck / Decky Loader** is the most relevant precedent. Valve owns the home screen and game detail pages as immutable surfaces. Third-party plugins (Decky Loader) inject exclusively into the **Quick Access Menu (QAM)** — a dedicated overlay tab triggered by a hardware button. The game library grid, hero art area, and launch button are never plugin-writable. Decky's own architecture is explicit: plugins add a tab to the QAM, register custom `/decky/*` routes, and use Toast notifications. They cannot touch the main game UI DOM.
- Source: [Decky Loader architecture](https://deepwiki.com/SteamDeckHomebrew/decky-loader)

**Hazard:** The failure mode is *route squatting* — a plugin registers a route that overlaps with a core navigation path, and the user reaches plugin UI when expecting core UI. Decky mitigates this by namespacing all plugin routes under `/decky/`.

**Hazard:** The second failure mode is *home screen injection*. CSS Loader (a Decky plugin) is notable precisely because it *does* mutate the Steam UI's visual style globally. Valve tolerates this for cosmetic theming, but it's a demonstrated footgun: CSS Loader can break the UI after a Steam update changes class names.

---

## 2. Surface Budget — Plugins Don't Bid for the Home Screen by Default

**VSCode activation events** are the canonical example of surface budgeting at load time. An extension that declares `"activationEvents": ["*"]` loads at every startup — VSCode explicitly calls this out as bad practice. The preferred pattern is event-scoped activation:

- `onLanguage:python` → activate only when a Python file opens
- `onCommand:extension.doThing` → activate only when commanded
- `onView:myTree` → activate only when the user expands a sidebar view
- `onStartupFinished` → polite background activation after startup completes

The effect: an extension that contributes a sidebar panel is **zero-cost** until the user opens that panel. It declares *capabilities up front* in `package.json`'s `contributes` block (commands, views, menu items), but those are static declarations — no code runs until the activation event fires.
- Source: [VSCode Activation Events](https://code.visualstudio.com/api/references/activation-events)

**Obsidian** applies a similar surface budget to UI real estate. Core plugins (file explorer, search, backlinks) own the left sidebar. Community plugins contribute *additional* sidebar panes or command-palette entries but do not displace core surfaces. CSS customization is a separate, lower-trust channel (CSS snippets) with no community store — meaning theme-injection and logic-extension are deliberately separated.
- Source: [Obsidian Community Plugins](https://deepwiki.com/obsidianmd/obsidian-help/7.2-vault-management-and-storage)

**Playnite** is the closest gaming-domain analogue. `LibraryPlugin` contributes game records and metadata fields (`SupportedFields` declares which fields: cover art, description, genres, etc.). The theme, not the plugin, decides what to render and where. A plugin cannot inject a card, button, or sidebar widget — it can only supply data that the theme may choose to display.
- Source: [Playnite Metadata Plugins API](https://api.playnite.link/docs/tutorials/extensions/metadataPlugins.html)

**Hazard:** When plugins *can* contribute UI (as in Kodi scripts and WebView addons), they inevitably try to own presentation. Kodi's addon ecosystem has plugins that render their own HTML inside a WebView, completely bypassing the active skin. The result is jarring UX inconsistency — a plugin that looks like a web page inside a 10-foot interface.

---

## 3. Latency and Startup Budget

The rule across all reviewed systems: **plugins must not block boot**. The implementation patterns:

| Pattern | Example | Mechanism |
|---|---|---|
| Lazy activation | VSCode `onView` | Code doesn't load until the view is expanded |
| Polite background | VSCode `onStartupFinished` | Fires after all `*` extensions finish activating |
| Background sync | Home Assistant integrations | Setup runs async; devices appear after discovery, not at boot |
| Stateless agents | Plex metadata agents | Called on-demand per title lookup; no persistent process |
| Capability declaration | Decky `plugin.json` | Name, version, backend entrypoint declared statically; Python backend started only when plugin is enabled |

**Home Assistant's quality scale** rewards integrations that "automatically recover from connection errors or offline devices, without filling log files." This is the startup-latency corollary: an integration that blocks HA startup because its target device is offline is a tier 1 integration quality failure.
- Source: [HA Integration Quality Scale](https://developers.home-assistant.io/docs/core/integration-quality-scale/)

**Plex's move away from legacy channel plugins** toward stateless metadata agents is instructive in the other direction. Legacy Plex channels ran persistent Python processes (one per channel) regardless of whether any media from that channel was being browsed. The modern agent model is invoked per-lookup and is stateless between calls. The lesson: persistent plugin processes compete with the primary use case (playing media / playing games) for CPU and memory.

**Hazard:** A plugin that polls a network resource on a timer, or holds a persistent connection, introduces observable latency at boot and degrades runtime. This is the "always-on background sync" trap.

---

## 4. Input Model Implications — Gamepad-First Contract

**The core problem:** LRUD spatial navigation requires that every interactive element be reachable by directional focus traversal. A plugin UI built for pointer+keyboard breaks the host's input contract.

**Steam Big Picture** maintains a *separate* controller input binding profile called "Big Picture Configuration" — the navigation behavior inside Steam's UI is fully remapped from game inputs. Tab-switching uses shoulder buttons; back uses B/Circle; the QAM is triggered by a hardware button chord. Plugins that render inside the QAM inherit CEF's focus model but must still implement proper keyboard/gamepad-navigable React trees.
- Source: [Steamworks Getting Started for Players](https://partner.steamgames.com/doc/features/steam_controller/getting_started_for_players)

**Focus-based navigation principles** (Figma/Epic UX research): The D-pad/left-stick moves focus; face buttons select/activate; shoulder buttons switch top-level tabs; back button exits. A gamepad-compliant UI must place the most important action at or near the *default focus position* (not at a geometric corner). Interfaces that render a floating mouse cursor controlled by an analog stick fail this contract — they add 2× input indirection.
- Source: [Figma Blog — Press Start](https://www.figma.com/blog/press-start-video-game-navigation/)

**Xbox and PlayStation** handle apps that don't natively support gamepad navigation by providing a **virtual cursor mode** — the system maps the analog stick to a simulated mouse pointer. This is a fallback of last resort, not a design target. It's explicitly worse UX and signals a plugin that didn't honor the host's input contract.

**Hazard:** If Korri's plugin API allows arbitrary React trees with no focus-management contract, the first plugin that renders a `<button>` without proper `tabIndex` or spatial-nav metadata breaks LRUD entirely. The fix is at the API surface: plugins should receive a *focus-managed container* from the host, not own a raw DOM mount point.

---

## 5. Theme vs Feature Separation

**The pattern:** Plugins contribute *data and actions*. The host theme owns all visual rendering decisions.

**Playnite** enforces this structurally. A `LibraryPlugin` returns `GameInfo` objects (name, description, genres, platform, artwork URLs). A `MetadataPlugin` returns `MetadataField` values. Themes are XAML files that data-bind to these fields. There is no API for a plugin to inject a React component or style a card.

**EmulationStation** applies the same principle via XML theme files. Themes declare which metadata fields to show (`<text name="description">`, `<image name="boxart">`) and their layout. The game list is pure metadata; the theme decides everything visual. Plugins/scrapers only populate metadata fields.

**Kodi** has the cleanest articulation: `addon.xml` uses explicit `point` type values (`xbmc.python.pluginsource`, `xbmc.gui.skin`). A content plugin and a skin are entirely different add-on types. Content plugins return directory listings (name, URL, thumbnail, metadata); the active skin renders them. *Where Kodi fails:* plugin developers discovered `XBMC.RunScript` and WebView-backed addons, which render arbitrary HTML that bypasses the skin entirely. These are user-hostile but technically permitted.

**VSCode** enforces this at the API layer: "Extensions cannot access the DOM of VS Code UI. You cannot write an extension that applies custom CSS to VS Code or adds an HTML element to VS Code UI." Extensions contribute to defined extension points (Tree Views, Status Bar items, WebView panels in sandboxed iframes). Custom style sheets from extensions are explicitly refused.
- Source: [VSCode Extension Capabilities — Restrictions](https://code.visualstudio.com/api/extension-capabilities/overview)

**Hazard:** Any plugin API surface that exposes a raw DOM node or allows `style` injection will eventually produce a plugin that fully reskins the host's UI, breaking brand coherence and making future host theme changes risky.

---

## 6. Distribution / Trust Model — The Gradient Is the Key Concept

| Tier | Home Assistant | VSCode | Obsidian | Risk level |
|---|---|---|---|---|
| **In-tree / first-party** | Internal tier (HA core) | Built-in extensions | Core plugins | Audited, HA/MS/Obsidian team owns |
| **Official / reviewed** | Bronze–Platinum quality scale | Marketplace (signed, policy-reviewed) | Community directory (malware scanned; popular = manual review) | Vetted, community-maintained |
| **Community / sideload** | HACS custom integrations | Sideload `.vsix` | Vault-local plugins (`.obsidian/plugins/`) | No review, user assumes all risk |

**The graduation path is the point.** None of these systems start plugins at the top tier. HACS custom integrations are explicitly documented as: *"not reviewed, security-audited, maintained, or supported by the Home Assistant project."* Obsidian explicitly warns that plugins inherit full Electron permissions (file system, network, arbitrary process execution) and cannot be sandboxed.

**VSCode sideloading** disables the marketplace signature check but doesn't change the Extension Host isolation — the code still runs out-of-process. This is worth noting: *the trust model and the containment model are orthogonal*. A low-trust sideloaded extension still runs in the Extension Host and can't crash the editor.

**Hazard:** Conflating trust tier with technical access level is a common mistake. A plugin can be low-trust (sideloaded, unreviewed) but still technically sandboxed (runs in a worker/subprocess). Conversely, a high-trust "official" plugin can still have broad access if the host doesn't enforce capability declarations at runtime.

---

## 7. Failure Mode Containment

**VSCode Extension Host** is the reference implementation. Extensions run in a separate Node.js process. IPC is JSON-RPC over a pipe. If the Extension Host crashes, VS Code shows "Extension Host has stopped" and offers a restart button. The editor, open files, and UI remain intact. Long-running extension operations don't block the UI thread.
- Source: [VSCode Extension System](https://deepwiki.com/microsoft/vscode-wiki/4.2-extension-system)

**Decky Loader** applies the same principle between its two layers: the Python backend runs as a systemd service; the React frontend is injected into Steam's CEF. If the Python service crashes, the frontend degrades gracefully (API calls fail, plugins show errors). The `PluginLoader` monitors the Steam Pad (SP) process and can restart the webhelper on crash. Critically, Steam's game library and launch functionality are entirely independent of Decky's process.
- Source: [Decky Loader overview](https://deepwiki.com/SteamDeckHomebrew/decky-loader)

**Obsidian is the cautionary tale.** Plugins run in the same Electron renderer process as the application. There is no sandboxing. A plugin that throws an unhandled exception can crash Obsidian entirely. The only mitigation is that Obsidian can remotely disable specific plugin versions known to cause data loss via a deprecations file fetched from GitHub.

**Browser Web Workers** offer a lighter-weight containment boundary: the worker runs in a separate thread, can be terminated without crashing the main thread, and cannot access the DOM. Suitable for CPU-intensive plugin logic. Not process isolation, but sufficient for compute tasks.

**Effect error channels** as a seam: in an Effect-based host, the plugin call site can be wrapped in `Effect.catchAll` or `Effect.either`, so plugin failures are converted to typed errors at the boundary rather than propagating as uncaught exceptions. This is a code-level containment pattern, not process isolation — it won't contain a plugin that blocks the event loop or exhausts memory, but it does prevent a plugin's `Effect` failure from crashing the host's fiber tree.

**Hazard:** The worst failure mode is silent degradation — a plugin that doesn't crash but silently corrupts state (e.g., mutates shared game library records). Process isolation doesn't help here; the answer is *immutable data contracts* at the plugin boundary. Plugins receive read-only views of host data and return new values rather than mutating in place.

---

## Sources

| URL | Description |
|---|---|
| https://deepwiki.com/SteamDeckHomebrew/decky-loader | Decky Loader architecture: layered Python/CEF plugin system for Steam Deck |
| https://code.visualstudio.com/api/references/activation-events | VSCode activation events reference — canonical lazy activation documentation |
| https://code.visualstudio.com/api/extension-capabilities/overview | VSCode extension capabilities and restrictions (no DOM access, no custom CSS) |
| https://deepwiki.com/microsoft/vscode-wiki/4.2-extension-system | VSCode extension host isolation architecture |
| https://api.playnite.link/docs/tutorials/extensions/metadataPlugins.html | Playnite metadata plugin API — data contribution vs theme presentation |
| https://developers.home-assistant.io/docs/core/integration-quality-scale/ | Home Assistant integration quality scale — Internal/Bronze–Platinum/Custom tiers |
| https://deepwiki.com/obsidianmd/obsidian-help/7.2-vault-management-and-storage | Obsidian community plugin security model — no sandboxing, Restricted Mode, manual review |
| https://www.figma.com/blog/press-start-video-game-navigation/ | Figma/Epic Games UX research on focus-based gamepad navigation principles |
| https://partner.steamgames.com/doc/features/steam_controller/getting_started_for_players | Steam Big Picture Configuration — separate controller binding profile for host UI navigation |
