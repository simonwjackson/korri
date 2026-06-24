# Game Library Entity Resolution & Deduplication

**Research date:** 2026-06-23  
**Scope:** Self-hosted federated game library (Plex-for-games model) where the same logical game can exist on multiple LAN peers with no universal identifier guarantee.

---

## The Core Problem

Korri federates `PlayableLibraryEntry` records from multiple peers. Each peer independently emits its own copy: `EntrySource.isLocal` distinguishes origin, but two peers with the same ROM or Steam game emit **separate, disconnected entries** today. The UI shows two tiles. The user should see one.

The resolution space has three distinct dimensions:

| Dimension | Easy case | Hard case |
|---|---|---|
| **Identity** | Steam AppID present | Single-file ROM with no DAT match |
| **Matching** | Exact hash | Title-only multi-file game |
| **Merge** | Identical metadata | Conflicting names, different region |

---

## 1. Identity & Matching Strategies

### 1.1 Tier 1: Exact/Canonical ID (confidence: 100%)

The most reliable signal. No false positives are possible within the same type.

**Native store IDs:**
- Steam: AppID (integer in path/manifest). Two copies with the same AppID are definitionally the same game.
- GOG: productId. Same guarantee.
- PlayStation: serial number embedded in header (e.g. `SLUS-00594`).
- Nintendo: Title ID / ApplicationId in eShop metadata.

**Content-addressed identity for ROMs:**
- No-Intro / Redump DAT databases: CRC32 + filesize is sufficient for single-file ROMs in the gross majority of cases (`igir` documentation). SHA1 adds collision-resistance for archival. MD5 is mostly legacy.
- CHD (disc images): SHA1 stored in the CHD header is used directly — no need to decompress.
- RetroAchievements: defines their own per-game hash that strips iNES headers to avoid variant collisions.

**Korri already models this:** `content.artifactId` is a durable content-addressed ID. `contentPath` is a local path reference (less stable). Any two entries with the same `artifactId` are exact matches regardless of source peer.

**External canonical IDs (optional enrichment):**
- IGDB game ID: cross-store canonical identifier used by Playnite, RomM, igir. Lookup by title+system yields a stable ID that links Steam, GOG, and ROM versions of the same game.
- Jellyfin embeds `[tmdbid-680]` or `[imdbid-tt1234]` in filenames/folder names and treats any two entries with the same provider ID as the same logical item — auto-merging them under one tile.

---

### 1.2 Tier 2: Content Hash (confidence: 95–100%)

For single-file ROMs, CRC32 is fast and has negligible collision risk when paired with filesize. The No-Intro / Redump community has verified millions of ROM checksums since the late 1990s; a CRC32+size match against a known-good DAT is effectively proof of identity.

```
// Single-file identity tuple
interface FileIdentity {
  crc32: string  // 8 hex chars
  size: number   // bytes
  sha1?: string  // for archival or disambiguation
}
```

For multi-file / directory games (see §5 for full treatment):

```
// Multi-file identity: sorted manifest hash
interface DirectoryIdentity {
  manifestHash: string     // SHA256 of sorted { path, size, crc32 }[] JSON
  fileCount: number
  totalSize: number
}
```

---

### 1.3 Tier 3: Title+System Normalization (confidence: 50–90%)

Used when neither exact IDs nor content hashes are available. Must be combined with confidence scoring — never auto-merge below ~90%.

**The definitive open-source implementation is Zaparoo's slug pipeline** (`zaparoo.org/docs/core/contributing/media-titles/`), which runs a 2-phase normalization:

**Phase 1 — Media-specific (Games):**
1. Fullwidth → ASCII normalization
2. Split on `:`, strip leading articles ("The Legend of Zelda: …" → "Legend of Zelda …")
3. Strip trailing articles ("Legend, The" → "Legend")
4. Strip metadata brackets: `(USA)`, `[!]`, `{Europe}` → removed
5. Strip edition/version suffixes: "Edition", "Version", "v1.0" → removed
6. Expand abbreviations: "Bros" → "brothers", "vs" → "versus", "Dr" → "doctor"
7. Expand number words: "one" → "1" … "twenty" → "20"
8. Normalize ordinals: "2nd" → "2", "3rd" → "3"
9. Convert Roman numerals: "VII" → "7" (with special-casing for "Mega Man X")

**Phase 2 — Universal normalization:**
1. Punctuation normalization (curly quotes → ASCII)
2. Unicode normalization (strip diacritics: "Pokémon" → "Pokemon")
3. Symbols: `&` → "and", separators → spaces
4. Lowercase
5. Strip all non-alphanumeric

**Result:** `"The Legend of Zelda: Ocarina of Time (USA) [!]"` → `"legendofzeldaocarinaoftime"`

**Zaparoo's 7-stage matching cascade** (in order, stopping on first ≥0.95 confidence match):
1. Cache lookup (keyed by SystemID + Slug + Tags)
2. Exact slug match (with tag filters: region, language, revision)
3. Exact slug match (ignoring tags)
4. Secondary title match (bidirectional subtitle stripping)
5. Fuzzy: token signature + Jaro-Winkler (≥0.85) + Damerau-Levenshtein tie-break
6. Main title only (before first `:` or `-` delimiter)
7. Progressive trim (remove words from end, max 3 iterations)

Source: `zaparoo.org/docs/core/contributing/media-titles/`

---

### 1.4 Layered Tiered Matching with Confidence Scoring

The industry consensus (RetroArch, igir, Zaparoo, Playnite, Jellyfin) is a **tiered cascade** that tries exact IDs first and falls through to increasingly fuzzy strategies:

```
Tier 1: Exact canonical ID match   → confidence: 1.0 → auto-merge
Tier 2: Content hash match         → confidence: 0.99 → auto-merge  
Tier 3: Title+system slug match    → confidence: 0.60–0.95 → depends on score
  - Exact slug match                → 0.95 → auto-merge
  - Secondary title / subtitle      → 0.85 → auto-merge
  - Fuzzy (Jaro-Winkler ≥ 0.85)    → 0.75 → flag for review
  - Progressive trim                → 0.60 → show both, surface as candidate
Tier 4: No match                   → 0.0  → show as independent item
```

**Threshold guidance from Neo4j entity resolution docs:**
- `auto_merge_threshold: 0.95–0.98` — automatically deduplicate
- `flag_threshold: 0.85–0.90` — queue for human review
- Below flag_threshold — treat as distinct (never merge)

---

## 2. How Established Tools Solve This

### 2.1 No-Intro / Redump + ROM Managers (igir, CLRMamePro)

**How they do it:** DAT files define the canonical set for each platform as `{ game: { rom: { name, crc32, md5, sha1, size } } }`. A ROM manager scans files, computes checksums, looks them up in the DAT, and knows definitively whether a file is:
- A verified, named ROM (identity: the DAT entry name)
- An unknown file
- A bad/modified dump

**Deduplication:** `1G1R` (1 Game 1 ROM) mode. When multiple verified copies exist (USA, Europe, Japan; Rev A, Rev B), a **priority list** selects the preferred one. Others are archived or deleted. Priority is user-configured (typically: prefer USA/World, prefer later revision, prefer verified dump `[!]`).

**Key insight:** Exact hash matching against a community-maintained ground-truth database eliminates ambiguity entirely for verified ROMs. The DAT is the canonical identity store.

Source: `igir.io/roms/matching/`, `docs.libretro.com/guides/databases/`

---

### 2.2 RetroArch Databases

**How they do it:** Uses `.rdb` files derived from No-Intro/Redump DATs. The import scanner computes CRC32 for each file, looks it up in the RDB, and populates the playlist with the canonical game name. 

**Key field:** CRC32 is primary; SHA1 as fallback (especially for CHD). Serial number extraction from disc images (PSX, PS2, GC) is used when hash doesn't match (patched/converted files).

**Pitfall noted in docs:** Multiple DATs can have conflicting data for the same CRC; one with incorrect data can override the correct one. Their solution: DAT precedence ordering + upstream correction.

Source: `docs.libretro.com/guides/databases/`

---

### 2.3 Plex / Jellyfin (media servers)

**How they do it:**

1. **Primary path:** Embed an external ID in the filename/folder name. Jellyfin: `Movie (2021) [imdbid-tt12801262].mp4`. Any two files with the same `[tmdbid-XXX]` or `[imdbid-XXX]` tag are matched to the same logical item.

2. **Fallback path:** Filename parser extracts title + year → lookup against TMDB/TVDB/OMDB API. The API returns the canonical external ID, which anchors future matching.

3. **Deduplication:** Two files that resolve to the same external ID become **"versions" of the same item** — one logical movie with multiple source files (SD, HD, different encodes). Plex's UI shows a badge with the count. Playback auto-selects by device capability or lets the user choose.

4. **Manual override:** "Merge Items" and "Split Apart" in the Plex UI. Jellyfin has "Identify" which lets you manually set the external ID.

5. **Metadata conflict resolution:** The longer description wins. Manual "locks" prevent metadata from being overwritten on rescan.

**Key insight:** The external provider ID (TMDB, IMDB) is the universal identity anchor that makes cross-path deduplication trivial. Titles and file structure are secondary.

Source: `support.plex.tv/articles/201018248-merge-or-split-items/`, `jellyfin.org/docs/general/server/metadata/identifiers/`

---

### 2.4 Playnite + DuplicateHider Plugin

**How they do it:** Playnite imports from multiple stores (Steam, GOG, Xbox, Epic, etc.), each with their own `GameId`. Cross-store dedup is manual by default — the user installs **DuplicateHider** and configures:

```
Score(game) = Priority(game.Source) - count * (isInstalled ? 1 : 0)
```

Games are sorted by score ascending; all but the lowest-score copy are hidden. IGDB provides a canonical cross-store identity for metadata resolution (Playnite resolves to IGDB when available).

**Custom groups:** User-defined rules (regex) normalize titles for grouping. E.g. strip "Complete Edition" before comparing.

**Key insight:** Playnite doesn't auto-merge because false positives are a real user pain ("Dragon Age: Origins" ≠ "Dragon Age: Origins – Ultimate Edition" for all users). The architecture separates **identity** (IGDB) from **preference** (DuplicateHider score).

Source: `github.com/felixkmh/DuplicateHider`

---

### 2.5 Zaparoo (media launcher / NFC tap-to-play)

**How they do it:** Title-only matching is the primary mechanism (no content hashing — too slow on MiSTer FPGA). The slug pipeline (§1.3) normalizes query and indexed filenames to the same canonical form before comparison.

**Key insight:** Zaparoo's separation of _slug_ (normalized form for matching) from _title_ (display) is the right model. The slug is destroyed after matching; the original title survives for display. Tags (region, language, revision) become soft preferences that re-rank results without excluding them.

Source: `zaparoo.org/docs/core/contributing/media-titles/`

---

### 2.6 RomM (self-hosted ROM manager)

**How they do it:** Folder-based platform detection → IGDB / ScreenScraper API lookup by title → stores `igdb_id` and `ss_id` per ROM. These IDs anchor metadata and cross-reference.

Multi-part game support: multi-disc games and DLC are stored under one game entry with multiple file references.

**Key insight:** IGDB as canonical game identity works well for metadata enrichment but doesn't help with ROM-vs-ROM dedup when both copies have the same IGDB ID (different regions, revisions). The hash layer is still needed for that.

Source: `deepwiki.com/rommapp/romm`

---

### 2.7 Neo4j Entity Resolution (general-purpose pattern)

**How they do it:** Three-zone confidence model:
- **Auto-merge zone** (≥0.98): embedding similarity + fuzzy string score combined. Merge immediately.
- **Flag zone** (0.90–0.98): create a `SAME_AS` edge with `status: 'pending'` for human review.
- **New entity zone** (<0.90): create as a new node.

Aliases are accumulated on the canonical node (`aliases: ["Chase", "Chase Bank", "JPMC"]`) to accelerate future matches without re-running embedding search.

Type-constrained matching: only match entities of the same domain type to prevent "Apple (company)" from merging with "Apple (fruit)".

**Key insight for games:** `platform` (or `system` in Korri) is the type constraint. "Super Mario Bros" on NES ≠ "Super Mario Bros" on SNES (Super Mario World). System must be part of the matching key.

Source: `neo4j.com/labs/agent-memory/explanation/resolution-deduplication/`

---

### 2.8 Salesforce/Gremlin (audit-first enterprise dedupe)

**Key insight:** The **cluster_id** is a stable key that persists through review, apply, and audit. Before any merge, a plan is built; operators approve/reject clusters. Only then are merges applied.

This maps directly to Korri's problem: before folding two federated entries into one tile, emit a reviewable "candidate merge" that the user can approve or dismiss.

```
cluster_id          stable per-candidate-pair, used in queue + audit
anchors             what evidence pulled the pair together (hash, title+system, etc.)
merge_confidence    0.0–1.0
recommended_action  merge | show-both
approval_status     auto | approved | rejected | pending
override_survivor   which copy is canonical (e.g. "prefer local")
```

Source: `foundryops.io/guides/salesforce-dedupe`

---

## 3. Merge Model Design

### 3.1 Logical Game vs. Physical Copy

The correct mental model is:

```
LogicalGame (1)
├── Release/Copy A  [local peer, ROM file, hash: abc123]
├── Release/Copy B  [remote peer "bandai", Steam install]  
└── Release/Copy C  [remote peer "sobo", ROM file, hash: abc123]
```

- The **LogicalGame** has a stable `clusterId`, canonical metadata, and a user-facing tile.
- Each **Release** has: `source` (EntrySource), `target` (how to reach the content), `priority` (derived from source preferences), `identity` (hash or external ID used to cluster it here).

This maps onto Korri's existing `PlayableLibraryEntry` + `PlayableReleaseEntry` schema cleanly. `PlayableLibraryEntry.itemId` could become the `clusterId` when federation is involved.

### 3.2 Source Priority / Preference

Industry consensus (DuplicateHider, igir 1G1R, Plex version auto-select):

```
Priority score (lower = preferred):
  0   local + installed  (play immediately, no network)
  1   local + not installed
  2   remote "fast" peer (same subnet)
  3   remote "slow" peer (WAN / high-latency)
  4   remote + not installed (acquire + stream)
```

Within each tier, secondary sort keys: better version (USA > EUR for Western users; higher revision; no hacks/translations), better format (native > archive > streaming).

### 3.3 Metadata Conflict Resolution

When two copies disagree on metadata (different region names, different descriptions):

1. User-locked fields always win (never overwritten by re-scan).
2. External canonical (IGDB) beats inferred-from-filename.
3. Longer description wins over shorter.
4. The **primary** (highest-priority) copy provides the display name.
5. Accumulate `aliases` from all copies for future matching.

### 3.4 Representing the Cluster

```typescript
interface GameCluster {
  readonly clusterId: string          // stable ULID, never changes after creation
  readonly confidence: number         // 0.0–1.0, from the matching tier that created it
  readonly matchTier: "exact-id" | "hash" | "title-slug" | "manual"
  readonly status: "auto" | "pending-review" | "confirmed" | "rejected"
  readonly anchors: readonly string[] // what evidence was used: ["sha1:abc123"] or ["title+system: Mario/NES"]
  readonly primaryEntryId: string     // which release is the "display" copy
  readonly releases: readonly ClusterRelease[]
}

interface ClusterRelease {
  readonly entryId: string
  readonly source: EntrySource
  readonly priority: number           // lower = preferred for launch
  readonly identity: ReleaseIdentity  // how this copy was matched
}

type ReleaseIdentity =
  | { readonly _tag: "ExactId"; readonly kind: string; readonly value: string }
  | { readonly _tag: "ContentHash"; readonly crc32: string; readonly size: number; readonly sha1?: string }
  | { readonly _tag: "DirectoryManifest"; readonly manifestHash: string }
  | { readonly _tag: "TitleSlug"; readonly slug: string; readonly system: string; readonly confidence: number }
  | { readonly _tag: "Manual" }
```

---

## 4. Handling Non-Deterministic / Missing IDs Gracefully

### 4.1 The False-Positive Problem

A false-positive merge (two different games collapsed into one tile) is far worse UX than showing two tiles. "Super Mario Bros." (NES) ≠ "Super Mario Bros." (FDS), and the titles are identical. Platform/system is a required part of the identity.

Even within the same platform: "Castlevania" (US, CRC32: A) ≠ "Castlevania" (JP: Akumajo Dracula, CRC32: B). Title normalization alone would falsely merge these — only the hash tier correctly separates them.

**Rule: never auto-merge unless confidence ≥ 0.95 OR the match is a Tier 1 exact ID.**

### 4.2 Never-Merge-Wrong vs. Surface-Everything

Two valid postures:
- **Conservative (Jellyfin default):** Only merge when matched to the same external ID. Everything else shows as separate until user intervenes.
- **Aggressive (DuplicateHider default):** Match by normalized title; hide the lower-priority copy automatically; user can always reveal.

For Korri's distributed model, the conservative posture is safer for v1: **show both tiles if uncertain, surface the candidate merge for user confirmation**. Aggressive auto-merge can be unlocked per-user once they've validated their library.

### 4.3 Manual Merge / Split Overrides

Any dedup system needs:
1. **Manual merge:** user explicitly links two tiles as the same game (forced cluster).
2. **Manual split:** user explicitly unlinks a cluster (forced distinct).
3. **Manual ignore:** mark a pair as "not the same game, stop asking" (Neo4j `status: 'rejected'`).
4. These overrides are **authoritative** and must survive re-scans and peer reconnections.

Overrides are stored in the ProseQL YAML (the durable user-owned record layer), not inferred from library state.

### 4.4 Stable Cluster IDs

The `clusterId` (ULID) must:
- Be assigned at first resolution and never change, even if copies are added/removed.
- Survive peer disconnection + reconnection.
- Be the stable reference in user overrides, bookmarks, play history, and review queues.
- Exist independently of any single copy — if all copies of a game disappear, the cluster record should remain (with `releases: []`) so that user overrides and history are preserved.

---

## 5. Multi-File Game Hashing

### 5.1 Problem Statement

A PS2 game shipped as 15 files (EXE, DLL, data files). Two copies are "the same game" if all constituent files match — but you can't use a single-file hash.

### 5.2 Approaches

**DAT-based (No-Intro / Redump):**
- The DAT lists every file in the game with its own CRC32/SHA1/size.
- All files must match their respective DAT entries for the game to be "verified".
- The identity of the game is the DAT entry name, not a derived hash.
- **Limitation:** requires a published DAT for the platform. Not available for PC games, Steam installs, or custom content.

**CHD (Compressed Hunks of Data):**
- The entire multi-track disc is compressed into one `.chd` file.
- The CHD header embeds a `data sha1` of all uncompressed hunks.
- Identity = that SHA1. Fast: no decompression needed for matching.
- **Best practice:** prefer CHD for disc-based games. The SHA1 in the header is the canonical identity.

**Directory manifest (general-purpose):**
- Recursively list all files: `{ path (relative), size, crc32 }[]`
- Sort lexicographically by path
- JSON-serialize and SHA256 the result
- **Identity = that SHA256 hash**

```typescript
function computeDirectoryManifestHash(files: FileEntry[]): string {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path))
  const manifest = JSON.stringify(sorted.map(f => ({
    p: f.path,       // relative path
    s: f.size,       // bytes
    c: f.crc32,      // 8 hex chars
  })))
  return sha256(manifest)
}
```

**Tradeoffs:**

| Approach | Covers | Speed | Requires |
|---|---|---|---|
| Single CRC32+size | Single-file ROMs | Fast | Nothing |
| DAT lookup | Verified ROM sets | Medium | Published DAT |
| CHD SHA1 | Disc images | Fast (header only) | CHD format |
| Directory manifest hash | Any multi-file game | Slow (scan all files) | Nothing |
| IGDB ID lookup | Any game with metadata | Requires network | IGDB API key |

**Recommendation:** compute the directory manifest hash lazily (background, cached) and use it only for cross-peer dedup, not for display. Single-file CRC32 is synchronous and immediate.

### 5.3 Multi-disc Games

Multi-disc games (FF7 Disc 1, Disc 2, Disc 3) are **one logical game with multiple release targets**:
- Each disc is a separate file/CHD with its own hash.
- They are grouped under one `clusterId` by filename convention parsing: `(Disc 1)`, `(Disk 2)`, `Disc1` patterns.
- The `FileSetReleaseTarget` in Korri's existing `PlayableReleaseEntry` already models this correctly.

---

## 6. Phased Approach

### Phase 1: Minimal Viable Deduplication (v1)

**Goal:** No false positives. Show both tiles if uncertain. Reduce obvious duplicates automatically.

**What to implement:**

1. **Hash-based dedup for single-file ROMs on the same peer:**
   - On library scan, compute CRC32+size for each `contentPath` file.
   - Store in the `GameRecord` (new optional field: `contentHash: { crc32, size }`).
   - At federation fan-out time: group entries by `(system, crc32, size)` tuple.
   - Same tuple from two peers → fold into one `LogicalGame` cluster with `matchTier: "hash"`, confidence: 0.99.
   - Priority: local (`EntrySource.isLocal: true`) first.

2. **Exact external ID dedup:**
   - Steam AppID in `LaunchBlock.app` → identity key.
   - `content.artifactId` → already the content address, use directly.
   - Two entries with the same `artifactId` or same `(steam, appId)` → auto-merge.

3. **Show separate tiles for everything else.**
   - No title-fuzzy matching in v1 — the false-positive risk is too high without user-visible review UX.

4. **`clusterId` stamped on every `PlayableLibraryEntry`:**
   - For single-copy entries: `clusterId = entryId` (trivial cluster of 1).
   - For matched pairs: new ULID written to ProseQL as a `game-cluster.yaml` record.

**What NOT to do in v1:**
- No title fuzzy matching.
- No IGDB API calls.
- No directory manifest hashing (background work, not blocking).
- No user review UI.

---

### Phase 2: Fuzzy Matching + Review Queue

**Goal:** Surface likely duplicates for user confirmation. Handle title-only games.

1. **Title+system slug normalization** (Zaparoo-inspired pipeline, §1.3):
   - Implement the 2-phase slug normalizer for Game media type.
   - Match: `(normalizedSlug, system)` as the key.
   - Confidence: use Jaro-Winkler distance on the slug (not the original title).
   - Score: 0.75–0.94 → `status: "pending-review"`, not auto-merged.

2. **User-facing review queue:**
   - Surface "candidate merges" in settings: shows pair of tiles, anchor evidence, confidence.
   - User can: Merge, Reject (never ask again), Defer.
   - Approved merges write a `game-cluster.yaml` record to ProseQL.

3. **Manual merge/split/ignore UI** in game detail view.

4. **Directory manifest hashing** for multi-file games (background worker, non-blocking).

---

### Phase 3: Canonical ID Enrichment

**Goal:** Ground the library in IGDB/ScreenScraper IDs for permanent cross-store/cross-peer identity.

1. **IGDB enrichment** at import time: resolve `(title, system)` → IGDB game ID.
2. **Store IGDB ID** in `GameMetadata` (new field: `externalIds: Record<string, string>`).
3. **Cross-peer dedup by IGDB ID:** two entries with the same IGDB ID → same logical game, regardless of hash or title similarity.
4. **DAT integration:** optional No-Intro/Redump DAT lookup at scan time for emulator ROMs.
5. **Reject-list and override persistence** exposed in the ProseQL YAML layer.

---

## 7. Key Pitfalls & False-Positive Risks

### 7.1 Platform/System Is Not Optional

`"Super Mario Bros."` without `system = "nes"` is ambiguous. It could be:
- NES: Super Mario Bros. (1985)
- SNES: Super Mario World (known in some markets as Super Mario Bros. 4)
- Game Boy: Super Mario Land (sometimes shelved as "Mario Bros.")

**Rule:** `(normalizedTitle, system)` is the minimum key for fuzzy matching. Title alone is never sufficient.

### 7.2 Region Variants Are Not the Same ROM

`"Castlevania (USA)"` CRC32 differs from `"Akumajo Dracula (Japan)"`. They are the same _intellectual property_ but different _ROMs_ with different content. Korri's dedup goal is "same playable content" — use `(title_slug, system)` for metadata grouping but `(crc32, size)` for identity.

For cross-region grouping under one tile (like Playnite's DuplicateHider), use a looser match with explicit "this is a variant" relationship, not a merge.

### 7.3 Remakes and Ports Are Not the Same Game

`"Sonic the Hedgehog (Mega Drive)"` ≠ `"Sonic the Hedgehog (GBA)"`. Both will have the same normalized slug but are different games. System is the discriminator.

### 7.4 Revision Collisions

ROM `"Super Mario Bros. (USA) (Rev A)"` and `"Super Mario Bros. (USA)"` have different CRC32 values but the same normalized slug. They _are_ the same game for most user intents (same experience) but _not_ the same file. The correct model: same LogicalGame cluster, two releases with different `ReleaseIdentity` values. User preference (prefer Rev A, or prefer original) is a priority setting.

### 7.5 The "Complete Edition" Problem

`"Dragon Age: Origins"` and `"Dragon Age: Origins – Ultimate Edition"` normalize to different slugs in a strict pipeline, but DuplicateHider users report wanting to group them. This is a **variant/edition** relationship, not a dedup. The correct model: `versionOf` in `PlayableLibraryEntry` (already present in Korri's schema).

### 7.6 CHD SHA1 vs. Individual File SHA1

A `.chd` file containing a PSX game has a `data sha1` that covers the track data. But a `.bin`+`.cue` of the same game has a _different_ SHA1 (the raw ISO). They are the same game but not hash-equivalent. Identity across formats requires an external canonical ID (serial number, IGDB ID) or DAT-based normalization.

### 7.7 False-Positive Monitoring

From Neo4j's entity resolution docs: track the rejection rate of the review queue. If users are rejecting > 10% of auto-merged items → raise the confidence threshold. If the review queue is empty and users are still seeing duplicate tiles → lower the flag threshold.

---

## 8. Concrete Recommendations for Korri

### 8.1 Data model changes (minimal, additive)

```typescript
// Extend GameRecord with optional identity fields:
const GameRecord = Schema.Struct({
  // ... existing fields ...

  // Content identity (computed at scan time, stored for dedup)
  contentHash: Schema.optional(Schema.Struct({
    crc32: Schema.String,   // 8 hex
    size: Schema.Number,    // bytes
    sha1: Schema.optional(Schema.String),
    manifestHash: Schema.optional(Schema.String), // for multi-file
  })),

  // External canonical IDs  
  externalIds: Schema.optional(Schema.Record(
    Schema.String,  // provider: "igdb", "steamAppId", "gogProductId"
    Schema.String,  // id value
  )),
})

// New top-level cluster record (lives in ProseQL YAML, like GameRecord)
const GameCluster = Schema.Struct({
  id: Schema.String,                // stable ULID
  matchTier: Schema.Literals(["exact-id", "hash", "title-slug", "manual"]),
  confidence: Schema.Number,
  status: Schema.Literals(["auto", "pending-review", "confirmed", "rejected"]),
  anchors: Schema.Array(Schema.String),
  primaryReleaseId: Schema.String,
  memberIds: Schema.Array(Schema.String), // GameRecord ids that belong here
})
```

### 8.2 Federation dedup algorithm (v1)

At catalog fan-out / merge time (where `app.catalog.snapshot` aggregates sources):

```typescript
function clusterEntries(entries: FederatedEntry[]): LogicalGame[] {
  // 1. Group by exact-id first
  const byArtifactId = groupBy(entries, e => e.content?.artifactId)
  // 2. Group by (system, crc32, size) for single-file ROMs
  const byHash = groupBy(
    entries.filter(e => e.contentHash),
    e => `${e.system}|${e.contentHash!.crc32}|${e.contentHash!.size}`
  )
  // 3. Merge groups; entries present in both use exact-id as canonical
  // 4. Remaining ungrouped entries = trivial clusters of 1
  // 5. Sort releases within each cluster by priority (local first)
  // 6. Return LogicalGame[] with stable clusterIds
}
```

### 8.3 Source priority for launch selection

```typescript
function priorityScore(release: ClusterRelease): number {
  const localBonus = release.source.isLocal ? 0 : 100
  const installedBonus = release.launchable ? 0 : 10
  return localBonus + installedBonus + release.source.peerLatencyEstimate ?? 50
}
```

Lower score = preferred. The UI shows the primary tile; switching source is a secondary action (like Plex's version picker, or DuplicateHider's source icon bar).

### 8.4 What to read / reference

| Resource | What it's for |
|---|---|
| `zaparoo.org/docs/core/contributing/media-titles/` | Complete title normalization + matching pipeline (Go, open-source) |
| `igir.io/roms/matching/` | ROM hash matching, CRC32 vs SHA1 guidance, archive handling |
| `igir.io/roms/filtering-preferences/` | 1G1R preference rules (region/revision priority) |
| `docs.libretro.com/guides/databases/` | RetroArch DAT-based matching, troubleshooting |
| `github.com/felixkmh/DuplicateHider` | Score formula for source priority (C#, readable) |
| `support.plex.tv/articles/201018248-merge-or-split-items/` | Manual merge/split UX model |
| `jellyfin.org/docs/general/server/metadata/identifiers/` | Provider-ID-in-filename pattern |
| `neo4j.com/labs/agent-memory/explanation/resolution-deduplication/` | Confidence thresholds, SAME_AS pattern, alias accumulation |

---

## 9. Summary Matrix

| Strategy | Confidence | False-positive risk | Speed | Requires |
|---|---|---|---|---|
| Same `content.artifactId` | 100% | None | O(1) | Already in Korri |
| Same Steam AppID | 100% | None | O(1) | Launch config |
| CRC32+size match | 99% | Negligible | Fast | Scan at index time |
| CHD SHA1 header | 99% | None | Fast (header read) | CHD format |
| Directory manifest hash | 98% | Negligible | Slow | Background scan |
| IGDB ID match | 98% | None (same ID) | Medium | API key + network |
| Title+system exact slug | 90% | Low | Fast | Normalization impl |
| Title+system fuzzy (JW≥0.85) | 75–89% | Medium | Fast | Normalization + review UI |
| Title-only fuzzy | 40–70% | High | Fast | Not recommended |
| Manual user link | 100% | None (user-confirmed) | — | Override storage |

**Recommended v1 threshold:** auto-merge only on 99%+ tiers (exact ID, CRC32 hash). Show review queue for 75–98%. Show both tiles for <75%.
