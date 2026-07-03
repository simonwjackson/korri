# External Research: Level Share Square / SuperMario127 Support

**Research value: high** — Substantial primary source material extracted directly from the public SM127 GDScript codebase and LSS wiki, exposing concrete API endpoints, level format spec, and the game's internal launch flow.

---

## Prior Art

### SuperMario127 (SM127) — Level Share Square

- **Upstream repo**: [`Level-Share-Square/SuperMario127`](https://github.com/Level-Share-Square/SuperMario127)
- **Engine**: Godot 3.6 (GDScript) — *not* Godot 4.
- **Public since**: v0.8.0 (The Galaxy Update, Sep 2024). Source is buildable with Godot 3.6; `master` branch is development-only.
- **Stable releases**: v0.8.0 → v0.9.0 → v0.9.1 (Dec 21 2024). v1.0 is next planned (adds campaign).
- **Distribution**: [charpurrr.itch.io/super-mario-127](https://charpurrr.itch.io/super-mario-127) — Windows (163 MB), Linux (165 MB), HTML5. **No ARM/AArch64 binary published.**
- **Snap package**: A community Snap (`snapcraft.io/supermario127`) exists but wraps the Linux x86 binary.

### Level code format (v0.5.1 — current as of Apr 2026)

- **Type**: CSV-like plain `.txt` file (not JSON). Wiki documents it as "CSV-like `.txt` file".
- **Version field**: First comma-delimited token is the format version (`0.5.1`).
- **Migration chain**: 0.4.0 → 0.4.1 → 0.4.2 → 0.4.3 → 0.4.4 → 0.4.5 → 0.4.6 → 0.4.7 → 0.4.8 → 0.4.9 → 0.5.0 → 0.5.1 (linear, all handled in `Data.gd`).
- **Encoding**: Level name, author, description, thumbnail URL are `percent_encode()`d. Tile data uses a custom hex-and-RLE encoding. Objects are pipe-delimited rows within area blocks.
- **Fields** (top-level): `format_version, name, author, description, thumbnail_url, [layout_ids^pinned_items], [area1], [area2], …`
- **Source**: [`level/Data.gd`](https://raw.githubusercontent.com/Level-Share-Square/SuperMario127/master/level/Data.gd) — both `load_in()` and `get_encoded_level_data()` are readable.

---

## Market and Competitor Signals

### Level Share Square API — Endpoints discovered from SM127 source

All base URL: `https://levelsharesquare.com`. No public API docs exist; these are reverse-engineered from [`scenes/menu/level_portal/http/`](https://github.com/Level-Share-Square/SuperMario127/tree/master/scenes/menu/level_portal/http).

| Endpoint | Method | Notes |
|---|---|---|
| `/api/levels/filter/get?page={n}&game=2&authors=true` | GET | Paginated browse; optionally `&name={q}` for search |
| `/api/levels/featured/get?page={n}&game=2&authors=true` | GET | Featured levels tab |
| `/api/levels/favourites/{userId}/get?page={n}&game=2&authors=true` | GET | Requires `Authorization: Bearer {token}` |
| `/api/levels/filter/get?&game=2&count=1&random=true` | GET | Returns one random level |
| `/api/levels/{levelId}?keep=true` | GET | Full level page including `code` field. Optional Bearer auth for user fields. |
| `/api/app/intervals/SM127?hidden=true` | POST | Presence ping; requires Bearer token. |

**game=2** is the game-ID constant for SM127. **`numberOfPages`** is returned in list responses.

### LSS Level JSON shape (`/api/levels/{id}?keep=true`)

Response: `{ level: { … } }`. Relevant fields from `lss_level_page.gd`:

```
_id          — level ID (MongoDB ObjectId string)
code         — raw level code string (CSV-like, starts with format version)
name         — level title
thumbnail    — thumbnail URL (may be empty)
postDate     — ISO timestamp
author       — { username, avatar }
description  — level description text
tags         — string array
rating       — float 0–5
raters       — integer
favourites   — integer
plays        — integer
commenters   — user-id array (size = comment count)
hasPlayed    — bool (only when authenticated)
hasRated     — float (only when authenticated)
hasFavourited — bool (only when authenticated)
```

### How the game internally "launches" a level from LSS

From `level_panel.gd → play_level()`:

1. Download the level code via `/api/levels/{id}?keep=true`.
2. Save the `code` string to a local `.txt` file in `user://` via `level_list_util.save_level_code_file()`.
3. Register the local ID in a sort file.
4. Call `Singleton.SceneSwitcher.start_level(levelInfo, localId, workingFolder, ...)`.

**There is no command-line argument interface for directly booting into a specific level.** The game always starts from the launcher scene (`run/main_scene = "res://scenes/menu/launcher/launcher.tscn"`). Direct level launch requires writing a level file to SM127's user data directory before process start, or injecting it in-game through the portal.

### Godot 3.6 user-data path

The project sets `config/custom_user_dir_name = "dev"`. On Linux, Godot 3 resolves user:// to:
```
~/.local/share/godot/app_userdata/dev/
```
Level files land under `user://levels/` (exact path determined by `level_list_util`, not yet read in this pass).

---

## Adjacent Solutions

### Godot 3 CLI scene overrides

Godot 3 supports `--scene <path>` and `--` to pass custom arguments to the running project (`OS.get_cmdline_args()`). SM127 does not currently read `cmdline_args` for level loading, but a patch or mod could wire this up. The existing `launcher.gd` already supports mod loading (`user://mods/active.127mod`), which demonstrates the precedent: write a file before launch, the launcher reads it.

### SMBR (Super Mario Bros. Remastered) LSS integration

SMBR, another LSS-supported game in this repo, also uses `game=X` filtering against the same `/api/levels/` surface. Its level format is JSON `.lvl`. Korri already packages SMBR (`product/vendor/super-mario-bros-remastered`), so whatever LSS fetch + local-file injection pattern is established there can be adapted for SM127.

---

## Risks

| Risk | Detail |
|---|---|
| **No ARM binary** | Official SM127 builds are x86 only (Windows + Linux x86_64). ROCKNIX on SM8550 is AArch64. Would require either building SM127 from source for ARM (Godot 3.6 supports it) or running under x86 emulation (FEX-Emu etc). |
| **No CLI-level launch** | SM127 has no `--level <id>` argument. Launching a specific level requires pre-writing the level file to the user data dir AND having the game detect it on startup — a mod or wrapper pattern is needed. |
| **Undocumented API** | The LSS API is reverse-engineered from game source, not a published contract. May break on LSS platform updates without notice. |
| **Format version drift** | Level format is `0.5.1` today. If Korri caches level codes, it must version-check and refuse to load stale codes after a format bump. |
| **Auth gating** | Favourites list and user-specific metadata (hasPlayed, hasRated) require a Bearer token. Anonymous browsing and downloading is possible but filtered features are not. |
| **`?keep=true` semantics** | The `?keep=true` query param on the level-page endpoint is used in the game source but not documented. It may prevent the server from incrementing play count. Korri should replicate this flag to avoid inflating metrics on metadata fetches. |
| **Godot user dir** | `custom_user_dir_name = "dev"` lands level files at `~/.local/share/godot/app_userdata/dev/`. This path conflicts with any other Godot 3 app using the same custom name. Level injection must target the correct path. |

---

## Unknowns — What Korri Should Test Before Implementation

1. **ARM build viability**: Can SM127 be built from source with Godot 3.6 targeting `arm64` (aarch64-linux)? Does Godot 3.6 export a Linux ARM64 template?
2. **Level file injection path**: Confirm the exact subdirectory under `user://` where SM127 expects `.txt` level files, and whether inserting one there + restarting causes the game to show it in the local list.
3. **`sort_file_util` format**: The game uses a sort file to order/enumerate levels. Confirm whether Korri can write a minimal valid sort file or whether it must read and amend an existing one.
4. **API rate limits**: Make a handful of unauthenticated calls to `/api/levels/filter/get?game=2` and measure response headers. No rate-limit docs found; treat as fragile.
5. **`code` field presence**: Confirm that `/api/levels/{id}?keep=true` always returns the `code` field (not behind auth). The source appends a Bearer header only "if logged in" but the `code` field appears to be fetched unconditionally.
6. **`?keep=true` impact**: Compare play count before/after calling with vs without the flag to determine its actual effect.
7. **Level format version gate**: The game refuses to show "play" controls if the code's format version is higher than `current_format_version` (shows "outdated" warning instead). Confirm what the current shipped binary's `current_format_version` actually is at runtime.

---

## Sources

| Source | URL |
|---|---|
| SM127 GitHub repo | https://github.com/Level-Share-Square/SuperMario127 |
| `lss_ping.gd` — presence API endpoint | https://raw.githubusercontent.com/Level-Share-Square/SuperMario127/master/singletons/lss_ping.gd |
| `http_request.gd` — paginated level browse | https://raw.githubusercontent.com/Level-Share-Square/SuperMario127/master/scenes/menu/level_portal/http/http_request.gd |
| `http_level_page.gd` — single level fetch | https://raw.githubusercontent.com/Level-Share-Square/SuperMario127/master/scenes/menu/level_portal/http/http_level_page.gd |
| `http_random_level.gd` — random level | https://raw.githubusercontent.com/Level-Share-Square/SuperMario127/master/scenes/menu/level_portal/http/http_random_level.gd |
| `lss_level_page.gd` — API response shape | https://raw.githubusercontent.com/Level-Share-Square/SuperMario127/master/scenes/menu/level_portal/classes/lss_level_page.gd |
| `level_panel.gd` — save + launch flow | https://raw.githubusercontent.com/Level-Share-Square/SuperMario127/master/scenes/menu/level_portal/level_panel.gd |
| `Data.gd` — level code format | https://raw.githubusercontent.com/Level-Share-Square/SuperMario127/master/level/Data.gd |
| `project.godot` — app config, user dir | https://raw.githubusercontent.com/Level-Share-Square/SuperMario127/master/project.godot |
| LSS Wiki — Super Mario 127 | https://wiki.levelsharesquare.com/Super_Mario_127 |
| LSS Wiki — Level code formats | https://wiki.levelsharesquare.com/Level_code |
| itch.io — official distribution | https://charpurrr.itch.io/super-mario-127 |
| SM127 release history | https://github.com/Level-Share-Square/SuperMario127/releases |
