# Bandai sleep handoff — fake-suspend ownership flip (Korri vs nix-on-rocks)

Date: 2026-06-10. Investigated live on Bandai (SM8550 / AYN Thor, guest `bandai`
on port 2222, host `thor` on port 22, LAN `192.168.1.237` — DHCP lease moves,
Tailscale name `bandai` / `100.87.100.50` is the stable handle).

## TL;DR

The power button "did nothing" because the substrate fake-suspend pipeline in
`guest/modules/lid.nix` predates the Korri rootless-session refactor: 3 of its
4 actions silently no-op, and the one that works (WiFi off) is invisible. On
top of that, NetworkManager intermittently stalls in DHCP after a radio cycle,
so resume never restored connectivity — the device looked dead until a hard
power-cycle.

A full replacement was prototyped **and validated end-to-end on the device,
including the physical power button**. Ownership flips: Korri owns button
policy and session behavior; nix-on-rocks shrinks to one product-agnostic
root verb (`rocknix-powerstate enter|exit`).

## Root causes found (all verified live)

1. **`lid.nix` is product-aware and stale.** It hard-codes:
   - `/run/user/0/sway-ipc.0.*.sock` — actual compositor socket is
     `/run/user/2000/sway-ipc.2000.*.sock` (korri user session) → DPMS no-op,
     screen never blanks, user gets zero feedback.
   - cgroups `system.slice/korri-kiosk.service` / `main-space-sway-kiosk.service`
     — compositor actually lives at
     `user-2000.slice/user@2000.service/app.slice/korri-compositor.service`
     → SIGSTOP no-op, games keep running.
   - `main-space-pipewire*` units — force-disabled by Korri's platform adapter;
     audio lives in the korri user session → audio stop no-op.
   - Net effect: a power press only killed WiFi and flipped an invisible toggle
     flag. Repeated presses left the toggle in a random state.
   - Note: `lid.nix` already parameterizes `runtimeDir` via
     `rocknix.session.runtimeDir.uid` but the sway-socket glob ignores it and
     hard-codes uid 0 — a substrate bug independent of Korri.

2. **NM DHCP stall after WiFi radio cycle (intermittent, fatal).**
   `nmcli radio wifi off` → `on` reassociates but can hang indefinitely in
   `connecting (getting IP configuration)`. Verified: an explicit
   `nmcli con up <profile>` recovers in ~1s. Sometimes plain radio-on works
   (8s); the fallback must stay.

3. **Korri inputd cannot read the bare button nodes.** Host-bound
   `/dev/input/event0/1/2/4/5/6` carry host gid `104` with no guest mapping
   (guest `input` is gid 174). inputd already maps `KEY_POWER → power-suspend`
   and `SW_LID → lid-*` but retry-loops on EACCES forever. The InputPlumber
   virtual nodes work only because the seat trigger applies `user:korri:rw-`
   ACLs. `setfacl -m u:korri:rw` on the bare nodes fixes it (prototyped).

4. **The existing seam makes the flip trivial.** `KORRI_INPUTD_POWER_SUSPEND`
   etc. are *command overrides* (`commandFromEnv`, whitespace-split) — the
   current `"true"` values are shell no-ops installed to avoid double-handling
   with the substrate handler. Pointing them at real scripts is the entire
   product-side wiring. The current design also leaks product knowledge INTO
   the substrate (Korri injects `PULSE_SERVER=/run/user/2000/...` into the
   substrate handler's environment so volume works) — deleted by this flip.

## Validated design

```
power button (pmic_pwrkey, event0)
  └─ korri-inputd (KEY_POWER → power-suspend action)
       └─ korri-fakesuspend-toggle            [product policy, runs as korri]
            suspend: screen off FIRST (own sway socket) → freeze *.scope user
                     units → touch /run/korri-power-req/enter.request
            resume:  touch exit.request → thaw scopes → screen on
       └─ rocknix-powerstate watcher          [substrate, root, 1s poll loop]
            enter: first-wins snapshot (wifi state+profile, bt, governors)
                   → governors powersave → bt block → wifi off LAST
            exit:  restore governors/bt → radio on → wait ≤14s → if not
                   connected, `nmcli con up <snapshot>` (retry ×4) → consume
                   snapshot marker
```

Measured on hardware: suspend drops network at T+3s; resume restores WiFi in
8–55s depending on whether the DHCP stall hits. Physical-button end-to-end
test passed (toggle log 15:36:19 suspend / 15:36:36 resume / 15:36:44 wifi
connected).

Hard-won implementation lessons:

- **First-wins snapshots + consume-on-exit are mandatory.** A duplicate
  `enter` after WiFi is down must not clobber `wifi.state=enabled` with
  `disabled`, or resume will skip radio-on entirely (this exact corruption
  caused two "dead until reboot" incidents during prototyping).
- **Do not use systemd path units for the request channel.** `PathExists`
  multi-triggers per request (5–6 service starts), which trips
  `unit-start-limit-hit` and permanently kills the watcher. A long-running
  poll loop (1s) is boring and correct. If a fancier channel is wanted later:
  socket activation, not path units.
- **systemd `Environment=` lines with spaces need quotes**; unquoted values
  are split into bogus assignments and silently ignored.
- **systemd expands `$var` inside `ExecStart` shell strings** — another
  reason the watcher logic lives in a script file, not a unit one-liner.
- **Debounce KEY_POWER in the toggle** (2s): pwrkey may autorepeat (value 2),
  and inputd dispatches on every non-zero value.
- Keep the kill switch (`/storage/.guest/lid-suspend.disabled`) — host-side
  reachable disablement saved the day repeatedly.

## What is live on Bandai right now (prototype state)

Persistent (survive reboot, harmless):

- `/root/proto/` — `rocknix-powerstate`, `powerstate-watcher`, `wifi-watchdog`,
  `wifi-cycle-experiment`, logs (`powerstate.log`, `watchdog.log`,
  `wifi-experiment.log`), `last-wifi.con`.
- `/var/lib/korri/proto/korri-fakesuspend-toggle` + `toggle.log`.

Volatile (gone on reboot — device then reverts to OLD substrate behavior):

- `/run/systemd/system/proto-powerstate-watcher.service` (+ wifi-watchdog
  timer units), `/run/systemd/user/korri-inputd.service.d/proto-power.conf`,
  `/run/korri-power{,-req}/`, the `setfacl u:korri:rw` grants on
  `event0/1/6`, and the *stopped* state of
  `main-space-hardware-button-handler` (still enabled → returns on boot).

## Codification plan

### nix-on-rocks (this repo)

- `guest/modules/lid.nix`: delete `lidClose`/`lidOpen`/`powerToggle`/
  `hardwareButtonHandler` and the `main-space-hardware-button-handler`
  unit. Keep (move) `volumeControl` only if anything else uses it — Korri
  now owns volume via inputd env.
- New module: `rocknix-powerstate` verb + watcher service, product-agnostic:
  - root script with `enter|exit`, first-wins snapshot, consume-on-exit,
    con-up DHCP-stall recovery (comment why), kill-switch check;
  - long-running watcher unit polling a request dir (option for the dir path,
    default `/run/rocknix-power/requests`); dir group-writable by an
    option-configured group (e.g. `rocknix.power.requestGroup`) so the
    product session user can request transitions without root/polkit;
  - optional wifi self-heal watchdog timer (recover wlan0 down >2min when no
    suspend marker active) — cheap insurance, already written.
- Keep `services.logind.settings` ignores (logind must stay out of the way).
- Substrate keeps the neutral input facts (`rocknix.device.input.*EventNames`);
  nothing in the substrate may reference korri units, sockets, or uids.

### korri (../korri)

- Package `korri-fakesuspend-toggle` (product policy: screen-off-first via own
  compositor socket, freeze/thaw `*.scope` user units, request file writes,
  2s debounce, persistent log via @shared/logger conventions where possible).
- `product/systems/nixos/images/platforms/rocknix-sm8550.nix`:
  - `KORRI_INPUTD_POWER_SUSPEND` → packaged toggle;
  - `KORRI_INPUTD_VOLUME_UP/DOWN` → real volume commands (pactl/wpctl with
    `PULSE_SERVER` already in inputd env);
  - drop `KORRI_INPUTD_LID_*` no-ops or point at toggle as appropriate;
  - delete the `main-space-hardware-button-handler.environment` override
    block (handler is gone);
  - extend the seat ACL trigger (`korri-rocknix-seat-device-trigger`) to grant
    `u:korri:rw` on `pmic_pwrkey` / `pmic_resin` / `gpio-keys` (and the other
    bare nodes — fixes the inputd EACCES retry loop, see backlog).
- inputd needs **no code change** — `commandFromEnv` seam already exists;
  existing test coverage at `product/services/device/inputd.test.ts:719`
  exercises KEY_POWER dispatch.

### Open backlog (captured in korri SE backlog 2026-06-10)

- `rocknix-guest-hide-raw-gamepad.service` fails every boot with empty journal.
- Guest gid mapping/ACLs for bare evdev nodes (inputd EACCES retry loop).
- Persistent journald on guest+host — three debugging rounds lost all
  evidence to volatile journals across power-cycles.

## Reference: incident timeline (2026-06-10)

- Baseline A snapshot taken (host/guest healthy, 0 suspends).
- User power press → WiFi died invisibly (stale pipeline) → looked crashed →
  hard reboot. Journal volatile, evidence lost.
- Prototype built stepwise: DPMS/freeze as korri ✓ → root verb ✓ → wifi
  restore failed twice (DHCP stall; then snapshot corruption via path-unit
  multi-trigger) → watcher rewrite → automated cycle ✓ (drop T+3s, back
  T+49–54s) → ACLs + inputd drop-in + substrate handler stopped → physical
  button cycle ✓.
