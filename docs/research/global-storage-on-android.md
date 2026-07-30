# User-visible config storage on Android — spike findings, 2026-07-30

Requirement being tested: Korri's config must live outside the app's private
domain, somewhere the user can find and edit it in a file manager.

Device: SM-F966U1 (usu), Android 16, SDK 36. App: `com.simonwjackson.korri.debug`,
`targetSdk 34`. The probe ran korrid's own Rust `fs` calls **inside the app
process** via JNI — a shell-side test would be a false green, since the adb
shell user has different powers than the app UID.

## Verdict

A user-visible top-level folder works, and korrid can fully own it — but only
with **All-files access** (`MANAGE_EXTERNAL_STORAGE`) granted. Without that
permission the failure is total, not partial.

## Measured

Each root was put through the full lifecycle korrid needs: `create_dir_all`,
`write`, `read_to_string`, nested `create_dir_all`, `read_dir`, and a rewrite.

| Root | Without All-files access | With it |
|---|---|---|
| `/storage/emulated/0/Korri` (wanted) | **FAIL** — Permission denied (os error 13) | OK, every operation |
| `/storage/emulated/0/korri-retro` (today's local-play root) | **FAIL** — Permission denied | OK, every operation |
| `Android/data/<pkg>/files/` | OK | OK |

What landed on disk with the permission granted:

```
/sdcard/Korri/config/settings.toml   -rw-rw----  u0_a307  media_rw
/sdcard/Korri/config, /sdcard/Korri/plugins   drwxrws---  u0_a307  media_rw
```

Owner is the app UID, group is `media_rw` with group read/write — the normal
shape for shared storage, and why other apps can reach it through FUSE.

## What this means

**1. The permission is load-bearing, not a nice-to-have.** Failure without it
is `os error 13` on the very first `create_dir_all` — korrid cannot write config
at all. There is no partial mode. Anything user-visible depends completely on a
grant the user can revoke at any time from Settings.

**2. This is already true of shipped work.** `korri-retro` failed identically in
the denied case, so local play's RetroArch config generation carries the same
hard dependency today. Moving config to `/sdcard/Korri` does not add a new
class of risk — it extends an existing one to a more visible surface.

**3. `Android/data/` is the only permission-free option, and it is disqualified.**
It works without any grant, but Android 11+ hides it from file managers, which
defeats the requirement. (My earlier plugin demo used exactly this path — that
choice was wrong for anything the user is meant to touch.)

**4. The permission is currently requested too late.** `KorriShellActivity`
knows how to ask (`ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION`, with a
fallback to the global settings screen), but only lazily — when a local-game
launch spec needs storage provisioning. If config lives in global storage, a
fresh install has no config path until the user happens to launch a local game.
The request needs to move to first run, or config needs to survive its absence.

## Consequences for the design

- **Ask at first run**, with an explanation of why, rather than at first local
  launch.
- **Degrade honestly.** When the permission is missing or revoked, korrid should
  report a tagged failure the portal can render as "Korri needs file access to
  read your settings — grant it here", not fail opaquely mid-operation. Today
  the failure is a raw `os error 13` from deep inside a filesystem call.
- **Treat revocation as a real state**, not an edge case. It is one toggle in
  Settings and it takes config, plugins, and the RetroArch config with it.
- **Keep secrets out of it.** Everything in this folder is readable by any app
  with storage access. Pairing keys and the korrid capability token must stay
  in app-private storage regardless of how far the global-first lean goes.

## Not established

- **That a file manager can actually read and edit these files.** This spike
  proved korrid can write them; it did not install a file manager and confirm
  the round trip, which is the actual user requirement. The permissions shape
  (`media_rw` group, group-writable) strongly suggests yes, but it is unproven.
- **Whether a user edit survives korrid rewriting the file**, and whether
  ownership changes when another app rewrites it.
- Behaviour on devices where the OEM restricts All-files access more
  aggressively than stock Android.
- Whether Play Store distribution would ever be viable —
  `MANAGE_EXTERNAL_STORAGE` requires justification and approval there. Korri is
  sideloaded, so this is currently moot, but it forecloses a future option.

## Reproducing

The probe was a throwaway JNI entry point plus an activity hook, on branch
`spike/global-storage`; it was not merged, on the same reasoning as the plugin
runtime's demo hooks — app-side scaffolding with no consumer does not ship. The
script that drove it (`services/korrid/storage-spike.sh` on that branch) toggles
`appops set <pkg> MANAGE_EXTERNAL_STORAGE deny|allow` between runs, which is how
both states were measured without touching Settings by hand.
