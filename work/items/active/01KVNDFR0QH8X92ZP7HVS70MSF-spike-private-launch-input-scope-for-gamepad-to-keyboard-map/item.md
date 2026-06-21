---
id: 01KVNDFR0QH8X92ZP7HVS70MSF
slug: spike-private-launch-input-scope-for-gamepad-to-keyboard-map
title: Spike private launch input scope for gamepad-to-keyboard mapping
origin: parked
status: To Do
priority: high
labels:
  - input
  - inputplumber
  - uinput
  - launch-scope
  - safety
  - spike
created: 2026-06-21
source: user
---

# Spike private launch input scope for gamepad-to-keyboard mapping

## Context

Yoshi's Fabrication Station research proved a useful control shape for keyboard-only web games: controller buttons can be translated to keyboard keys with a scoped `evsieve` sidecar instead of global InputPlumber profile switching. The documented YFS prototype used:

- D-pad + left stick → arrow keys
- gamepad west/X → keyboard `z`
- gamepad south/A → keyboard `a`
- gamepad east/B → keyboard `x`
- gamepad start → keyboard `p`

The concern is not whether mapping is possible. The concern is fail-open leakage: the game exits, Korri home returns, but the controller is still mapped to game-specific keyboard actions and can drive Korri with esoteric inputs. The desired model is like a launch wrapper: the mapping exists only as part of the foreground game launch and dies with it.

This item is a **spike**, not the product implementation. It should prove whether the Linux input model can satisfy Korri's safety contract before any plugin or game relies on gamepad→keyboard mapping.

## Why it matters

Keyboard-only games need controller support without risking global input leakage. Korri home must never receive game-specific keyboard mappings after a game exits, crashes, fails to start, or is force-stopped. The spike should prove whether a gamescope-like launch wrapper can source only the InputPlumber normalized controller and deliver mapped keyboard events only to the launched runtime. Gamescope may be one presentation wrapper in the experiment, but it is optional and must not be treated as the isolation requirement.

## Non-Negotiable Product Constraints

- **Only accept source input from InputPlumber.** The mapper must open the normalized InputPlumber virtual controller, not raw physical controller event nodes.
- **No global InputPlumber profile switching.** Game-specific keyboard mappings must not be ambient device/profile state.
- **No host-seat virtual keyboard leakage.** A uinput keyboard visible to Korri home is not acceptable, even if cleanup usually works.
- **Gamescope is optional.** The required boundary is a private launch input context; gamescope can be a consumer or wrapper, but not the core safety mechanism.
- **Fail closed.** If the InputPlumber source is missing/ambiguous, private routing cannot be proven, or cleanup cannot be verified, the launch must fail rather than return to Korri with mapped input active.
- **Cross-runtime safety.** The result should apply to YFS/web games, PortMaster keyboard-only ports, and future keyboard-only runtimes; it should not be hidden as a YFS-only workaround.

## Candidate Shape

Desired mental model:

```text
InputPlumber normalized controller
  → korri-input-scope
      → private virtual keyboard
          → launched game/runtime only
```

Wrapper/lifetime shape:

```text
sessiond
  └─ korri-input-scope
       ├─ mapper backend (evsieve or custom)
       └─ launched runtime
            └─ game/browser/port wrapper
```

The wrapper owns both the mapper and the child runtime. If the runtime exits, the mapper exits. If the mapper exits unexpectedly, the runtime is stopped. Korri home is restored only after the mapper's virtual keyboard is gone.

## Pre-Wrapper Proofs Available on a Live Game

If Sobo already has a keyboard-controlled game running, we can prove several useful facts before building a real `korri-input-scope` wrapper:

- **Current launch topology** — record the running game process, parent chain, compositor/session, cgroup, seat, and whether the game/compositor has any `/dev/input/event*` file descriptors open.
- **Source inventory** — identify raw controller devices versus the InputPlumber normalized virtual controller, including stable names/symlinks/udev properties.
- **Unsafe-host-seat baseline** — start a temporary mapper from the InputPlumber controller to a normal uinput keyboard and show that the existing focused game can receive those keys. Then change focus or run a host-side listener to prove the same virtual keyboard is global and can leak outside the game.
- **No implicit isolation** — prove that a currently running game, without wrapper-level device scoping, is just another consumer on the host input/compositor path. This is a useful negative result: it justifies the private-launch-context requirement.
- **Cleanup mechanics only** — kill the temporary mapper and prove the virtual keyboard disappears. This proves mapper-process cleanup behavior, but not launch lifecycle safety; lifecycle safety still requires wrapping/supervision.

These pre-wrapper checks cannot prove the final safety contract, because they do not tie mapper lifetime and input routing to a launched child process. They can prove the baseline risk, source identity, and feasibility of the mapping primitive.

## Spike Phases

0. **Live pre-wrapper characterization**
   - With an already-running keyboard-controlled game, gather topology/source inventory and optionally run the unsafe-host-seat baseline.
   - Record what can and cannot be proven before process wrapping.
   - Do not treat this phase as sufficient for product safety.

1. **Source discovery gate**
   - Identify the normalized InputPlumber controller on Bandai/Sobo.
   - Record stable discovery signals: device name, by-id/by-path symlink, udev properties, and how to distinguish raw devices from the InputPlumber virtual controller.
   - Prove the spike does not open raw controller devices. Missing or ambiguous InputPlumber sources fail closed.

2. **Unsafe baseline**
   - Run a normal host-seat `evsieve`/uinput controller→keyboard mapping from the InputPlumber source.
   - Use a host/Korri sentinel to show mapped keys can reach the wrong consumer when not isolated.
   - Preserve this as evidence of the failure mode this item exists to prevent.

3. **Private launch input context**
   - Try one or more isolation strategies that do not rely on global profile switching:
     - private seat / private compositor input routing;
     - sandboxed runtime with only the scoped virtual keyboard exposed;
     - process-local adapter for browser/runtime cases if kernel-level isolation cannot be proven.
   - Include a no-gamescope path if feasible.
   - Include a gamescope-wrapped path only as an optional presentation variant.

4. **Adversarial isolation test**
   - Run two sentinels:
     - game-side listener inside the launched runtime/input context;
     - Korri/home or host-side listener outside that context.
   - Press mapped controller buttons.
   - Pass only if the game-side listener receives the mapped keys and the host/Korri sentinel receives none.

5. **Crash and cleanup test**
   - Kill/crash the wrapped runtime with `SIGTERM` and `SIGKILL`-style failure modes.
   - Verify the mapper exits and the private virtual keyboard disappears before Korri/home restore.
   - Verify subsequent controller input produces no mapped keyboard events after the launch ends.
   - Treat any inability to prove cleanup as a failed spike result.

6. **Implementation recommendation**
   - Decide whether `evsieve` is sufficient as the mapping engine.
   - Decide whether a small Rust `korri-input-scope` wrapper is needed for pidfd/cgroup supervision, deterministic cleanup, private input routing, or direct uinput ownership.
   - Record the recommended product seam: plugin launch companion, sessiond launch wrapper, runtime-specific process-local input, or explicit rejection of kernel-level keyboard mapping.

## Acceptance Criteria

- [ ] Source discovery identifies exactly one InputPlumber normalized controller and documents how raw controller devices are excluded.
- [ ] A spike demonstrates an unsafe baseline where a normal host-seat uinput/evsieve virtual keyboard can leak to Korri/home, so the regression risk is explicit.
- [ ] A private launch input context is tested with source restricted to the InputPlumber normalized controller; raw controller devices are not opened and ambiguous/missing InputPlumber devices fail closed.
- [ ] Adversarial sentinels prove mapped keys reach the launched runtime but not Korri/home or a host-side listener, with and without gamescope when feasible.
- [ ] Killing or crashing the wrapped runtime removes the mapper and virtual keyboard before Korri/home is restored; failure to prove cleanup fails closed.
- [ ] The spike records whether evsieve is sufficient as the mapping engine or whether a small Rust wrapper/custom mapper is required for pidfd/cgroup supervision or private input routing.
- [ ] The final spike note states one of: "safe to productize with constraints", "safe only for specific runtime-local adapters", or "not safe; do not ship gamepad-to-keyboard mapping".

## Suggested Test Artifacts

Capture enough evidence that a future session can judge the result without rerunning everything:

- input device inventory before launch: `libinput list-devices`, `/dev/input/by-id`, relevant `udevadm info`, and InputPlumber status if available;
- mapper command line / config used for each phase;
- host-side sentinel log showing received/no received key events;
- game-side sentinel log showing received mapped key events;
- process tree/cgroup before, during, and after launch;
- virtual keyboard device identity and proof it disappears on cleanup;
- screenshots or short terminal captures for pass/fail gates when useful.

## Tooling Notes

- `evsieve` is the first mapping backend to test because it can read evdev, emit uinput, and its virtual devices disappear when the process exits.
- `evsieve` alone does **not** prove isolation: a uinput keyboard on the host seat is visible to the compositor/seat. Isolation must be proven separately.
- Avoid AntiMicroX/Input Remapper/InputPlumber profile switching for the product path unless the spike discovers a way to make them launch-scoped and non-global; they are useful references but not assumed safe.
- Rust is not required for the spike. Use shell/Nix/evsieve/sentinels first. Rust may be justified only after the isolation model is proven or if lifecycle supervision cannot be made deterministic with existing tools.

## Related

- `docs/research/yoshis-fabrication-station-browser-runtime-capture.md` — original scoped `evsieve` sidecar idea and YFS controller→keyboard mapping.
- `work/items/active/01KVHR5K9P7M2YQF3WX8B6N4DT-web-game-runtime-plugins/plan.md` — active web runtime/YFS migration that should not ship unsafe input mapping.
- `work/items/parking-lot/01KVDXP0A4DKSQY78KYY84XEAP-portmaster-plugin-compatibility-substrate-brief.md` — PortMaster input compatibility mentions `gptokeyb`, InputPlumber integration, `/dev/uinput`, and per-port control profile loading.
- `work/items/parking-lot/01KV9675S71YBG4MJ88C0VSP1X-spike-joydev-plus-inputplumber-old-sdl-controller-compatibil.md` — adjacent InputPlumber/raw-device ordering and old-SDL compatibility spike.

## Live Sobo Pre-Wrapper Evidence — 2026-06-21

Read-only characterization was run while Yoshi's Fabrication Station was already active on Sobo.

Observed runtime topology:

- Sobo SSH target: `korri-goal-target` via `/tmp/korri-hostkeymatched-ssh_config`, host `sobo`, kernel `7.0.2`, `aarch64`.
- Active compositor: Sway pid `913`, socket `/run/user/2000/sway-ipc.2000.913.sock`.
- Active game window: `Yoshi's Fabrication Station`, app id `chrome-__tmp_yfs-webcanvas-stage_yfs_www_index.html-Default`, fullscreen on workspace `1`, pid `7354`.
- Active runtime process chain:
  - shell pid `7325`
  - Bun web-canvas runtime pid `7326`
  - Chromium app pid `7354`
  - Chromium renderer/GPU children under the same process group/session.
- Game cgroup at the time: `/user.slice/user-0.slice/session-c28.scope`; compositor cgroup: `/user.slice/user-2000.slice/user@2000.service/app.slice/korri-compositor.service`. This was a live/manual launch shape, not a scoped sessiond-owned wrapper.

Observed input topology:

- InputPlumber service pid `184` owns the raw source and uinput outputs.
- Raw hardware gamepad appears as `AYN Odin2 Gamepad` in `/proc/bus/input/devices`, but InputPlumber has it hidden/open as `/dev/input/.inputplumber/sources/event3` rather than normal `/dev/input/event3`.
- InputPlumber-created virtual devices observed:
  - `/dev/input/event6` — `InputPlumber Keyboard`, opened by Sway/logind.
  - `/dev/input/event7` — `Microsoft Xbox Series S|X Controller`, udev `ID_INPUT_JOYSTICK=1`, opened by Steam and the active Chromium app.
  - `/dev/input/event8` — `InputPlumber Mouse`, opened by Sway.
  - `/dev/input/event11` — `Microsoft X-Box 360 pad 0`, udev `ID_INPUT_JOYSTICK=1`, not observed as opened by the active game during the quick scan.
- Sway `get_inputs` listed `InputPlumber Keyboard` and `InputPlumber Mouse`, but not the controller as a compositor input. Chromium directly opened `/dev/input/event7`, consistent with browser/gamepad consumption of the virtual controller.

What this proves before wrapping:

- We can distinguish raw controller input from InputPlumber virtual devices on Sobo.
- The current YFS runtime is not in a private launch input context; it is a normal Wayland/Sway client plus direct evdev consumer of an InputPlumber virtual controller.
- A host-seat virtual keyboard is already a compositor-level concept: Sway owns `InputPlumber Keyboard` globally. A new uinput keyboard mapped from gamepad input would need separate isolation proof; normal seat attachment is not enough.
- Browser/runtime-local input may be a viable safe path for web games, since Chromium already consumes the InputPlumber virtual controller directly without needing global keyboard synthesis.

What remains unproven until a wrapper exists:

- mapper lifetime tied to the game child process;
- Korri restore gated on mapper cleanup;
- mapped keyboard events routed only to the launched runtime and not to Sway/Korri/home;
- cleanup under `SIGKILL`/crash conditions.

Temporary unsafe mapper result:

- YFS controls were recovered from `data.json`:
  - `walkLeft`/`walkRight`/`lookUp`/`duck` default to arrow keys `37,39,38,40`.
  - `jump` defaults to `Z` (`90`).
  - `tongue` defaults to `A` (`65`).
  - `throwEgg` defaults to `X` (`88`).
  - `lockTarget` defaults to `S` (`83`).
  - `pause` defaults to `P` (`80`).
  - `snapshot`/`record`/debug actions default to `T,R,Q,D`.
- A temporary baseline mapper was started from `/dev/input/event7` using `evtest --grab` plus `ydotoold`:
  - D-pad left/right/up/down → arrow keys.
  - `BTN_WEST` → `Z` jump.
  - `BTN_SOUTH` → `A` tongue.
  - `BTN_EAST` → `X` throw egg.
  - `BTN_START` → `P` pause.
- User confirmed the mapping worked well in the live YFS session.
- Mapper log recorded repeated `z_jump`, `a_tongue`, and `left` events during the successful test.
- Cleanup was performed after confirmation: the mapper/`evtest` process exited and the ambient `ydotoold virtual device` was killed/removed from `/proc/bus/input/devices`.
- This is useful but intentionally unsafe evidence: `ydotoold` created a host-seat virtual keyboard (`ydotoold virtual device`, event12 while active), so the proof demonstrates mapping feasibility and cleanup mechanics, not acceptable product isolation.

## Sobo Validation Harness — 2026-06-21

A reusable validation bundle was installed on live Sobo at `/tmp/korri-input-validation` and copied persistently to `/storage/korri-input-validation` so future validation does not depend on YFS as the test target.

Contents:

- `web-key-sentinel/index.html` — purpose-built Chromium page that logs `keydown`/`keyup` events and browser Gamepad API state. The page title includes event count and last event for SSH-side verification through Chrome DevTools `/json/list`.
- `scripts/inventory.sh` — captures input inventory, InputPlumber controller candidate, known process input fds, and Sway inputs/tree summary.
- `scripts/start-web-sentinel.sh` / `stop-web-sentinel.sh` / `web-sentinel-status.sh` — launch, stop, and inspect the web sentinel on Sobo's Wayland/Sway session.
- `scripts/inject-test-key.sh` — starts `ydotoold` if needed and injects a single key, defaulting to Linux `KEY_F13`, to verify the sentinel is focused and receiving keyboard events.
- `scripts/start-unsafe-dpad-mapper.sh` / `stop-unsafe-dpad-mapper.sh` / `stop-ydotoold.sh` — temporary unsafe host-seat mapper for validation only.

Verified on Sobo:

- `inventory.sh` ran successfully and identified `/dev/input/event7` as the InputPlumber virtual `Microsoft Xbox Series S|X Controller` candidate.
- `start-web-sentinel.sh 9333` launched the sentinel in Chromium and Sway focused it.
- `inject-test-key.sh 183` updated the sentinel title to `count=2 last=keyup key="F13" code=F13 ...`, proving SSH-observable keyboard-event validation works without YFS.
- A short `DURATION=3 start-unsafe-dpad-mapper.sh` test started and cleaned up the mapper.
- A longer `DURATION=900 start-unsafe-dpad-mapper.sh` run was left active for hands-on Sobo validation: D-pad maps to arrows, west to `Z`, south to `A`, east to `X`, north to `S`, and start to `P`. It auto-stops after 15 minutes; manual stop is `/tmp/korri-input-validation/scripts/stop-unsafe-dpad-mapper.sh` followed by `/tmp/korri-input-validation/scripts/stop-ydotoold.sh`.
- Hands-on validation produced sentinel keyboard events: SSH status later showed `Korri Input Sentinel count=78 last=keyup key="x" code=KeyX ...`, proving the controller→keyboard mapper can be validated against the sentinel without YFS.
- The persistent `/storage/korri-input-validation/scripts/inventory.sh` copy smoke-tested successfully and wrote `/storage/korri-input-validation/logs/inventory-20260621-131724.txt`.

This harness validates mapping mechanics and provides a leakage target. It still intentionally uses a host-seat virtual keyboard, so it remains unsafe as the final product architecture.

Follow-up in-session browser-local shim work:

- Added `web-key-sentinel/gamepad-keyboard-shim.js` to the validation bundle. It polls `navigator.getGamepads()` and dispatches page-local `KeyboardEvent`s only inside the browser document; it does not create a uinput/ydotool host-seat keyboard.
- Updated `start-web-sentinel.sh` to support:
  - `start-web-sentinel.sh 9333 --shim` for hands-on browser-local Gamepad API → KeyboardEvent validation.
  - `start-web-sentinel.sh 9334 --shim-self-test` for an SSH-observable self-test that dispatches `west -> KeyZ` inside the page.
- Copied the updated bundle to Sobo's `/tmp/korri-input-validation` and `/storage/korri-input-validation`.
- Stopped the previous unsafe host-seat mapper, stopped `ydotoold`, stopped the old sentinel processes, and verified no `ydotoold virtual device` remained before Sobo dropped off the network.
- When Sobo came back online, `start-web-sentinel.sh 9334 --shim-self-test` passed: the title reported `Korri Input Sentinel count=2 last=shim keyup west->KeyZ gp=none`, and `/proc/bus/input/devices` showed no `ydotoold virtual device`. This proves the browser-local shim can emit page-local keyboard events without host-seat uinput.
- Then `start-web-sentinel.sh 9333 --shim` was launched for hands-on physical-controller validation. Initial title: `Korri Input Sentinel count=0 last=browser-local gamepad keyboard shim loaded gp=none`; no `ydotoold`/unsafe mapper process or host virtual keyboard was present.
- Physical validation showed the page-local Gamepad API shim did not see the controller (`gp=none`) even though Chromium had `/dev/input/event7` open. This means browser Gamepad API cannot be assumed as the only web-local product path on Sobo.
- Added a second no-uinput path: `cdp-gamepad-keyboard-bridge.js` plus `start-cdp-gamepad-keyboard-bridge.sh`. This reads the InputPlumber virtual controller with `evtest --grab` and dispatches keyboard events only to the selected Chromium page via Chrome DevTools Protocol `Input.dispatchKeyEvent`.
- CDP bridge self-test passed on Sobo: `cdp-bridge-self-test.sh 9333` updated the sentinel to `count=2 last=keyup key="z" code=KeyZ ...` with no `ydotoold virtual device`.
- Physical CDP bridge was then started for validation: `DURATION=900 start-cdp-gamepad-keyboard-bridge.sh 9333`. It immediately produced sentinel keyboard events such as `ArrowDown`; no host uinput/ydotool virtual keyboard was present.
- After hands-on feedback, the CDP bridge was updated to map analog stick axes too. `ABS_X/ABS_Y` (left stick) and `ABS_RX/ABS_RY` (right stick) now map to the same arrow-key actions as D-pad, with press/release hysteresis (`12000` press threshold, `8000` release threshold) to avoid jitter. The bridge was redeployed to `/tmp` and `/storage` and restarted for validation.
- Lifecycle validation was then added and tested. `start-cdp-gamepad-keyboard-bridge.sh` now discovers the Chromium browser pid for the target CDP port and starts the bridge with `--watch-pid`. The bridge also exits on CDP websocket close/error. Test: start fresh sentinel+bridge, kill the watched Chromium browser pid with `kill -9`, wait, and verify the bridge exits and no `evtest` process remains. Observed bridge log: `stopping signal=cdp-websocket-close`.
- The sentinel+bridge were restarted after the crash test for continued hands-on validation. `validate-cdp-bridge.sh 9333` now checks sentinel reachability, bridge process, `evtest --grab /dev/input/event7`, absence of `ydotoold`, absence of `ydotoold virtual device`, and absence of the unsafe host-seat mapper.

For YFS/web-canvas, the preferred product direction is now: use browser-local Gamepad API when it works, otherwise use a launch-owned CDP input bridge targeted at the launched Chromium page. Both avoid compositor/seat-global virtual keyboards; CDP still needs launch ownership/lifecycle supervision.

## Notes

Capture decision: new item rather than extending PortMaster/YFS because the safety contract is cross-runtime and should gate any future gamepad-to-keyboard mapper. Gamescope is an optional presentation wrapper, not the isolation requirement.

Do not implement product behavior from the unsafe baseline. The unsafe baseline exists only to prove why the stronger private-launch-context model is required.
