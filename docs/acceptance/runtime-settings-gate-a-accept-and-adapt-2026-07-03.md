# Gate A: runtime stream-settings accept-and-adapt (device validation)

Date: 2026-07-03
Status: ready for validation
Device: bandai (SM8550, korri-thor-kiosk)
Scope: validate the Phase-1 accept-and-adapt resolution change and observe the
remaining never-stretch / no-collision / no-stranding behaviors on real hardware.

Governing contract: `docs/acceptance/runtime-settings-protocol-contract.md`.

---

## What shipped for this gate

- **Resolution accept-and-adapt** (`e5e3df20`): Moonlight local control no longer
  rejects odd or out-of-range resolutions. It clamps to the encoder-safe range,
  rounds to even, and forwards; the coerced value is reported via applied truth.
  Verified: `moonlight-embedded-korri` compiles with the edited patch and the
  invariant check passes.
- **Input-preservation proof** (`7bea953e`): a test proves enabling local
  control keeps the InputPlumber `-input` device (`task-122`).

Not in this build (tracked, mostly device- or workflow-dependent):

- Bitrate/FPS coercion — `01KWN2KEGT3NGTJZ6SHDRJ3YEG` (patch-export workflow).
- Global one-at-a-time latch — `01KWN2KEGW61TJ54X13JP0BTZ2` (needs device
  validation of capability-query interaction).
- Active frozen/black watchdog + auto-revert — `01KWN2M3GSW2FQST7F3M7RX0V2`.
- Never-stretch end-to-end verification — `01KWN2M3GSQPP1NBH3F1SQCDSK` (this gate
  observes it).

---

## Step 1 — Deploy the new Moonlight to bandai

Build (offloaded to fuji):

```
NIX_SSHOPTS="-F /tmp/bandai-deploy/ssh_config_ip" nixos-rebuild build \
  --flake '.#korri-thor-kiosk' --build-host fuji --no-reexec
```

Switch onto the device when the build is clean (the device_nixos_rebuild tool
with device=bandai, action=switch does this; default target is
bandai-guest-ip):

```
NIX_SSHOPTS="-F /tmp/bandai-deploy/ssh_config_ip" nixos-rebuild switch \
  --flake '.#korri-thor-kiosk' --build-host fuji --target-host bandai-guest-ip \
  --no-reexec
```

---

## Step 2 — Launch a stream

Start a stream on bandai the normal way (through the Korri UI/launch), so a
per-session control socket is created under
`$XDG_RUNTIME_DIR/korri-moonlight/<sessionId>/control.sock`. Confirm it is
reachable:

```
ssh bandai korri stream show
```

Expect a live readback, for example `13388 kbps, 60 fps, 1920x1080`. Note the
baseline values — you will restore to them at the end.

---

## Step 3 — Validation checklist

Run each and record the result. Each check names the pass condition and, on
failure, the backlog item it feeds.

### C1 — Accept-and-adapt: odd/edge sizes no longer rejected  ← the core change

```
ssh bandai korri stream resolution 1281x721
```

- **Pass:** command does **not** error; `device says: runtime.setResolution ->
  applied` and `now applied` shows the coerced even value (`1280x720`). Before
  this build the same request returned "resolution out of bounds / invalid".
- Fail → regression in `e5e3df20`.

### C2 — Weird aspect ratio is accepted

```
ssh bandai korri stream resolution 1000x1000
```

- **Pass:** accepted and applied (coerced to even if needed); no rejection.
- Fail → coercion/host-apply issue.

### C3 — Never stretch (visual)  ← observe

With an off-ratio applied (C2's 1:1, and try a wide `2560x720` and a tall
`720x1280`), **look at the screen**.

- **Pass:** the game image keeps correct proportions with black bars
  (letterbox/pillarbox) filling the mismatch. No horizontal/vertical squish.
- Fail → `01KWN2M3GSQPP1NBH3F1SQCDSK` (add client uniform-scale + letterbox).

### C4 — Bitrate set path (deferred check from the CLI branch)

```
ssh bandai korri stream bitrate 20000
```

- **Pass:** `device says: runtime.setBitrate -> applied`, `now applied` matches.
- Fail → capability/apply issue on the h264_vaapi path.

### C5 — Input preserved

While/after changing settings, use the controller.

- **Pass:** controller keeps working throughout.
- Fail → launch-wiring regression (contradicts `7bea953e`).

### C6 — No stranding  ← observe

After each change, confirm the stream stays live (not frozen/black).

- **Pass:** stream keeps running; a change that didn't apply simply leaves the
  previous picture.
- Fail (frozen/black) → `01KWN2M3GSW2FQST7F3M7RX0V2` (watchdog auto-revert). If
  stranded, recover manually with C7.

### C7 — Restore to baseline (recovery is always available)

```
ssh bandai korri stream resolution <baseline WxH>
ssh bandai korri stream bitrate <baseline kbps>
ssh bandai korri stream fps <baseline fps>
```

- **Pass:** returns to the launch baseline via explicit commands.

### C8 — Cross-family collision  ← observe (known gap)

Fire two different changes back-to-back quickly:

```
ssh bandai korri stream resolution 1280x720 ; ssh bandai korri stream bitrate 25000
```

- **Expected today:** the per-family latch + 250ms min-interval usually spaces
  them; a fast overlap could momentarily disturb the picture.
- If the picture scrambles → `01KWN2KEGW61TJ54X13JP0BTZ2` (global latch).

---

## Result

Record C1–C8 outcomes here after the run. C1/C2/C4/C5/C7 are the pass/fail gate
for the shipped change; C3/C6/C8 are observations that either confirm the
remaining behaviors already hold or route to their backlog items.
