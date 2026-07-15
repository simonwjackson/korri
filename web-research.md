# Web Research: Multi-User Readiness at the Model Level

**Research value: high** — Substantial prior art across Steam, Nintendo Switch, Xbox, Jellyfin, Plex, Home Assistant, Nextcloud, RetroArch/EmuDeck, Android, and SaaS multi-tenancy. Named patterns and concrete layout examples found; cross-domain analogies that map cleanly to Korri's constraints.

---

## Prior Art

### Steam — SteamID-keyed userdata, identity decoupled from license

**Layout:**
```
Steam/userdata/<SteamID>/           ← one folder per account identity
  <AppID>/
    remote/                         ← Steam Cloud saves
    stats/                          ← achievements
    remotecache.vdf
```

Every save, achievement, and cloud cache is scoped to a numeric SteamID. An AppID is a game; a SteamID is an identity. The two are composed at the folder level—not at the database level. There is no central "saves" table; the filesystem is the schema.

**Identity vs. session**: Multiple accounts can exist in one Steam client. Only one is "active" (signed in). When inactive accounts' games are played via Family Sharing, their saves go into `userdata/<BORROWER_SteamID>/<AppID>/`—not the owner's folder. **Library access (license) and save data are fully decoupled.** The license lives with the owner account; the save lives with whoever played.

**Session occupancy**: While a borrower plays, the license owner is locked out. One session occupant at a time; many account identities can coexist.

**Failure mode**: Steam Cloud sometimes conflates per-SteamID saves when game developers don't properly scope cloud keys to the SteamID. This causes save-mixing between family members—a problem that only surfaces when the library-sharing model is exercised.

Sources:
- https://eatcreatesleep.net/where-steam-actually-stores-your-save-files-and-how-to-back-them-up/
- https://www.reddit.com/r/Steam/comments/1bk0nil/how_does_family_sharing_work/
- https://savelocations.fandom.com/wiki/Location_steam

---

### Nintendo Switch — Console profiles decoupled from Nintendo Account

Nintendo baked multi-user into the console OS (Horizon) from launch (2017). Up to 8 local user profiles per console. Save data is scoped per-profile, stored in system memory. Profiles are independent of Nintendo Accounts—a local profile exists without any online account and can still hold saves.

**Three-layer model:**
```
Console (the device)
  └── Local Profile (up to 8 per console; save data owner)
        └── Nintendo Account (optional online identity; license / NSO)
```

**License vs. save data ownership**: A digital game license belongs to a Nintendo Account, which is designated as "primary" on one console. On the primary console, any local profile can play and accumulate their own save. On non-primary consoles, only the linked account can play (requires online license check). This means game access = account-level concern; save data = profile-level concern. They stack cleanly.

**Active user / session**: When launching a game, the UI always asks "which profile is playing?" This is a first-class prompt, not an afterthought. Each launch is scoped to a single active profile. Save data never bleeds between profiles.

**What worked**: The separation of "who owns the license" from "whose save is this" meant that adding Family Sharing (Virtual Game Cards, launched April 2025) didn't require restructuring save data.

Sources:
- https://www.reddit.com/r/NintendoSwitchHelp/comments/1i2dzba/help_with_nintendo_switch_accounts/
- https://www.nintendo.com/au/support/articles/data-management/
- https://en.wikipedia.org/wiki/Nintendo_Switch_system_software

---

### Xbox — Home console model, per-Gamertag saves

Xbox works like Switch's model but at a different layer: one console is designated "Home," making the owner's game licenses accessible to any account on that console. Each Gamertag (account) has its own cloud-synced save data via Xbox Live.

**Key insight**: "Home Console" is a device-level license grant, not a per-user grant. Any profile signed into the Home Console can play the owner's games, but each profile gets its own saves. The session is a single active Gamertag, but multiple Gamertags coexist on one console.

Sources:
- https://www.reddit.com/r/xboxone/comments/6bb817/how_licensing_works_on_xbox_one/
- https://www.reddit.com/r/XboxSeriesXlS/comments/ul790h/do_different_profiles_have_different_save_data/

---

### Jellyfin — Per-user playback state in `UserDatas` table

Jellyfin stores all watch progress, favorites, and ratings in a `UserDatas` table in SQLite, keyed by `(userId, itemKey)`. Libraries are media-server-level entities; per-user access is controlled by assigning or revoking library access per user account. Playback state is never shared across users.

**User model**: Local users only—no external identity federation by default. Admins manage the server; regular users consume media. The admin creates accounts and assigns which libraries each user can see.

**Active session**: "Session" in Jellyfin is an ongoing playback stream—separate from identity. A single user can have concurrent sessions from multiple clients. Sessions are visible to admins in the dashboard.

Sources:
- https://jellyfin.org/docs/general/server/users/
- https://github.com/jellyfin/jellyfin/issues/11840 (UserDatas key collision discussion)

---

### Plex — Three-tier managed user model

Plex has grown three overlapping user tiers:
1. **Server Owner** — full admin, the Plex account that hosts the server.
2. **Managed Users** — PIN-only local accounts, no independent Plex account. No queue, no friends, no external access. Child-safe. Access is locked to the owner's server.
3. **Home Users / Friends** — own Plex accounts, invited and linked to the server. Library access is selective.

**What worked**: Per-user watch history and playback state is cleanly scoped to accounts.

**What failed**: The three-tier model is notoriously confusing in the community. Plex grew these tiers incrementally, each to solve a specific problem (kids mode, remote sharing), without a unified conceptual model. The result is that users regularly misidentify which tier to use and get stuck in migration dead ends.

Sources:
- https://forums.plex.tv/t/managed-user-vs-home-user-the-differences/699892
- https://www.techhive.com/article/599406/plexs-new-plex-home-features-beef-up-media-management-in-your-house.html

---

### Home Assistant — Person ≠ User (identity/access split done explicitly)

HA has a documented, explicit split:
- **User**: an auth credential with privileges (admin flag, remote access flag). Can be a service account (Node-RED, cameras). No location/presence concept.
- **Person**: a real human entity with device_tracker assignments, zone presence, and map display. May optionally link to a User for login capability.

This is the cleanest example of **identity (Person) decoupled from auth/session (User)** in a self-hosted product.

**What worked philosophically**: Service accounts (Node-RED, integrations) don't pollute the Persons map; real residents show up on the map without requiring an auth credential.

**What failed in UX**: The community has sustained, recurring confusion about this split. Common failure modes:
- Admins create Users without creating Persons and then can't assign device trackers.
- Admins create Persons with login enabled, then want to add a second login device and can't (1:1 Person↔User constraint).
- Can't "upgrade" an existing User into a Person without deleting and recreating.

The conceptual model was right; the migration path was a dead end.

Sources:
- https://community.home-assistant.io/t/difference-between-person-and-user/294936
- https://www.home-assistant.io/integrations/person/

---

### Nextcloud — Per-user data roots, flat layout

```
<data_root>/
  <username>/
    files/          ← user's files
    files_trashbin/ ← user's trash
    files_versions/ ← file versions
    files_encryption/
    cache/
    uploads/
```

One canonical root per user. Per-user home directories make backup, migration, and deletion mechanical. Users can optionally be assigned to non-default storage backends.

**Key property**: The `<username>` segment is the only scoping needed. No `user_id` FK in a central table—filesystem layout enforces ownership. This is operationally very clean for single-instance, known-user-count deployments.

Source:
- https://community.hetzner.com/tutorials/encrypted-private-nextcloud-VPS-and-storagebox/
- https://szaimen.github.io/Nextcloud-NAS-Guide/docs/sensible-folder-structure/

---

### RetroArch / ROCKNIX / EmuDeck — No multi-user; workarounds entrenched

RetroArch has a single global config (`retroarch.cfg`). The multi-user profile feature request (#4749) has been open since **March 2017** and is still unresolved as of 2026. The system was designed single-user; the workaround ecosystem (copy config directories, use per-OS user accounts, separate RetroArch installs) has become the de facto approach. Third-party tools like `Retroarch-User-Changer` copy config + save directories to per-user slots.

ROCKNIX: saves stored alongside ROM files. No profile concept. No in-scope feature request.

EmuDeck: Feature request #1559 (Nov 2025, "Planned for 3.x") explicitly asks for detecting which Steam account is active and swapping save directories accordingly—using Steam identity as the profile selector for the retro layer.

**Signal**: RetroArch's 9-year-old open issue, combined with the EmuDeck request, is strong evidence that the community considers per-user save isolation a real need, and that the cost of retrofitting it has been compounding.

Sources:
- https://github.com/libretro/RetroArch/issues/4749
- https://github.com/tralph3/Retroarch-User-Changer
- https://github.com/dragoonDorise/EmuDeck/issues/1559

---

### Android multi-user — Additive userID namespace

Android introduced multi-user in 4.2 (2012). The implementation is instructive for its minimalism:

- **Device owner** = `userID=00`. App data: `/data/data/<pkgname>/` (backward-compatible path).
- **Secondary users** = `userID=10`, `11`, etc. App data: `/data/user/<userID>/<pkgname>/`.
- **Process UID** = `userID` prefix + `appID`. Linux sandbox enforcement comes "for free" because UIDs differ.
- **APKs are shared** between users; only data directories are isolated.
- **One active user at a time** in the foreground; up to 3 other users' processes may run background sync.

The key property: **the existing single-user data path is the `userID=00` case.** Adding multi-user didn't require migrating the owner's data; it was already at the canonical location. Secondary users were additive. The model was backward-compatible by construction.

Source:
- https://arsenb.wordpress.com/2014/09/30/android-multiuser-model-architecture-and-related-security-threats/

---

## Adjacent Solutions

### SaaS multi-tenancy migration pattern (add `organizationId`/`owner_id` to every table)

The canonical SaaS approach to retrofitting multi-user:

1. **Schema first**: Add `organizationId` (nullable initially) to every per-resource table. Add index immediately.
2. **Migration script**: Create one "personal workspace" per existing user, assign them as OWNER, backfill all existing rows with the new org ID. Make the script idempotent (safe to run twice).
3. **Query enforcement**: Every read and write query that touches scoped data must filter by `organizationId`. Missing this on mutations is a data-leak vulnerability.
4. **UI last**: Org switcher, member management, invites.

**Timing rule**: If the `organizationId` column exists but is nullable, the feature can be deployed without the UI. The data model is multi-user-ready; the product surface isn't yet. This is the "model-level" investment the prompt describes.

**Common mistakes documented**:
- Forgetting to add `owner_id` to newly added tables.
- Scoping reads but not writes/deletes.
- Conflating "personal mode" and "org mode" in the permission layer (leads to ambiguous identity in queries).
- Not handling the "last owner leaves" case.

Source:
- https://starterpick.com/guides/how-to-add-multi-tenancy-boilerplate-2026

---

## Market and Competitor Signals

| System | User model | Identity vs. session separation | Multi-user saves | When added |
|---|---|---|---|---|
| Steam | SteamID (numeric); Family Sharing | Account ≠ active login | Per-SteamID folder | Day 1 (2003+) |
| Nintendo Switch | Local profile ≠ Nintendo Account | Profile selector at game launch | Per-profile in system memory | Day 1 (2017) |
| Xbox | Gamertag; Home Console model | Home Console = device-level license grant | Per-Gamertag cloud sync | Day 1 |
| Jellyfin | Local user accounts; admin/user roles | Sessions are playback streams, not logins | `UserDatas(userId, itemKey)` table | Day 1 |
| Plex | 3-tier (owner/managed/friend) | Session = active stream | Per-account watch history | Grew incrementally; confusing |
| Home Assistant | Person ≠ User | Auth session ≠ real-world identity | N/A (preferences only) | Person added ~2020; friction persists |
| Nextcloud | Local user accounts | HTTP session = auth session | Per-user `<data_root>/<username>/` | Day 1 |
| RetroArch | None native | N/A | Single global config | Still unresolved (2017–2026) |
| ROCKNIX | None | N/A | Alongside ROMs | Not planned |
| EmuDeck | Planned (3.x, 2025) | Steam login used as profile selector | Directory swap | Upcoming |
| Android | userID (00, 10, 11…) | Active user = foreground session | `/data/user/<userID>/` | 4.2 (2012) |

**Signal on "when to add"**: Steam, Nintendo Switch, Xbox, and Nextcloud all baked the user-scoped data model in from day one. The ones that didn't (RetroArch, ROCKNIX) accumulated 9+ years of workaround debt. Plex and HA added it incrementally and introduced conceptual confusion by not committing to a single clean model upfront.

---

## Cross-Domain Analogies

### 1. Android's additive `userID` prefix (strongest)

The structural similarity to Korri is near-exact: single device, single occupant at a time, multiple resident identities. Android's solution—prepend a 2-digit user ID to every per-user path—made the owner's data backward-compatible (`userID=00`). Secondary users are additive. No existing single-user data needed to move.

The analogy for Korri: if library entries, play history, game state, settings, and source configs carry a `profileId` from the start (with a default/system profile = the current single-user state), adding a second profile is additive. The existing data is not orphaned; it's owned by the default profile.

### 2. Unix UID/GID ownership model

Files in Unix are owned (not shared by default). Processes run as a UID. Sessions are logins with a UID. Ownership is a property of the data item, not a session property. This maps directly to the Korri question: game state, achievements, library pins, streaming settings should be **owned by a profile** (identity-time decision), not associated with the active session (session-time decision).

### 3. Netflix/Disney+ profile selector

One subscription (license), multiple profiles (identities), each with independent watch history and recommendations. Profile selection happens at app launch—a first-class UX step, not buried in settings. Only one profile is active per stream (session occupancy). This is the Netflix mental model that most users already understand and would map to a Korri "who's playing?" prompt.

### 4. Hotel key card model (session occupancy vs. room ownership)

A hotel room is owned by the guest who booked it. The key card (session) grants access for the duration of the stay. Multiple guests can be on a reservation (profiles), but only one room is occupied at a time. Swapping who has the active key doesn't change who the room data (minibar charges, thermostat settings) is attributed to.

For Korri: the device is the "room." A session is the key card. Profiles are the registered guests. Occupancy is a single-slot constraint; identity and data ownership is per-guest.

---

## Sources

| # | URL | Description |
|---|---|---|
| 1 | https://eatcreatesleep.net/where-steam-actually-stores-your-save-files-and-how-to-back-them-up/ | Comprehensive Steam save path reference including per-SteamID userdata layout |
| 2 | https://savelocations.fandom.com/wiki/Location_steam | Steam userdata directory structure reference |
| 3 | https://www.reddit.com/r/Steam/comments/1bk0nil/how_does_family_sharing_work/ | Steam Family Sharing per-account save isolation confirmation |
| 4 | https://www.reddit.com/r/Steam/comments/1aevauc/family_share_saves/ | Steam Cloud save-mixing failure mode under Family Sharing |
| 5 | https://en.wikipedia.org/wiki/Nintendo_Switch_system_software | Nintendo Switch Horizon OS architecture, Virtual Game Cards (2025) |
| 6 | https://www.reddit.com/r/NintendoSwitchHelp/comments/1i2dzba/help_with_nintendo_switch_accounts/ | Switch profile = save data owner; Nintendo Account = license identity |
| 7 | https://www.reddit.com/r/xboxone/comments/6bb817/how_licensing_works_on_xbox_one/ | Xbox Home Console license model and per-Gamertag save data |
| 8 | https://jellyfin.org/docs/general/server/users/ | Jellyfin user model overview |
| 9 | https://github.com/jellyfin/jellyfin/issues/11840 | Jellyfin `UserDatas` table key structure |
| 10 | https://forums.plex.tv/t/managed-user-vs-home-user-the-differences/699892 | Plex managed vs. home user confusion |
| 11 | https://www.techhive.com/article/599406/plexs-new-plex-home-features-beef-up-media-management-in-your-house.html | Plex Home / Managed Users feature description |
| 12 | https://community.home-assistant.io/t/difference-between-person-and-user/294936 | HA Person vs. User community discussion (identity/auth split) |
| 13 | https://community.hetzner.com/tutorials/encrypted-private-nextcloud-VPS-and-storagebox/ | Nextcloud per-user directory layout |
| 14 | https://github.com/libretro/RetroArch/issues/4749 | RetroArch multi-user profile request, open since 2017 |
| 15 | https://github.com/dragoonDorise/EmuDeck/issues/1559 | EmuDeck multi-user feature request (Nov 2025, Planned for 3.x) |
| 16 | https://arsenb.wordpress.com/2014/09/30/android-multiuser-model-architecture-and-related-security-threats/ | Android multi-user UID/data-directory model |
| 17 | https://starterpick.com/guides/how-to-add-multi-tenancy-boilerplate-2026 | SaaS retrofit multi-tenancy: schema, migration, query scoping, common mistakes |
