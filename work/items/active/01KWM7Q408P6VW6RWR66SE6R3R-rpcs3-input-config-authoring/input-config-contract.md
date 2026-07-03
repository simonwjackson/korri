# U1 — RPCS3 input-config contract (source-grounded)

**Spike outcome for R2/R3.** Settles the `input_configs/*.yml` schema, the
`--input-config` resolution path, handler enum strings, the full `Config`
button/tuning key set, and the companion-`config.yml` question — before U2/U3/U4
fan out.

**Evidence base**

- Live device `simonwjackson@aka`: RPCS3 `0.0.41-nixpkgs-40e9ee5` (build
  `rpcs3-0.0.41-unstable-2026-06-04`), real `~/.config/rpcs3/` tree.
- RPCS3 source (`RPCS3/rpcs3`, master; matches the device serializer):
  `rpcs3/Emu/Io/pad_config.h`, `pad_config.cpp`, `pad_config_types.h/.cpp`,
  `rpcs3/Emu/system_utils.cpp`.
- CLI confirmed on device: `--input-config <name>  Forces the emulator to use
  this input config file`.

---

## 1. File location & `--input-config` resolution — **corrected path**

`--input-config <name>` sets `g_input_config_override`. `cfg_input::load()`
(`pad_config.cpp:130-160`) resolves the profile path in this precedence:

1. **`!strict && !g_input_config_override.empty()`** →
   `get_input_config_dir() + <override> + ".yml"` — **checked first, wins.**
2. else title-id custom config (`get_custom_input_config_path(title_id)`)
3. else `config_file` arg
4. else `<input_config_dir>/Default.yml`

`get_input_config_dir(title_id="")` = `get_input_config_root() + "global/"` and
`get_input_config_root()` = `<config_dir>/input_configs/`
(`system_utils.cpp:556-563`).

> **Correction to the plan:** the Korri-authored profile must be written to
> **`<state.root>/input_configs/global/<name>.yml`**, not
> `<state.root>/input_configs/<name>.yml`. `--input-config <name>` takes the
> **bare profile name** (no path, no `.yml`), e.g. `--input-config korri` loads
> `input_configs/global/korri.yml`.

Because the override branch is checked first and `!strict`, one flag + one file
gives Korri full, unambiguous control of input binding — it bypasses per-title
custom configs and the active-selection file entirely. Device confirms the
`global/` set: `~/.config/rpcs3/input_configs/global/Default.yml` exists.

---

## 2. Top-level profile schema (`cfg_input` → `cfg_player`)

Per-player, 7 players. `pad_config.h` `cfg_player`:

```yaml
Player 1 Input:
  Handler: Evdev                 # cfg::_enum<pad_handler>, default Null
  Device: "Sunshine X-Box One (virtual) pad"   # cfg::string, default = handler name
  Config: { ... }                # cfg_pad nested node (section 4)
  Buddy Device: ""               # cfg::string (paired device, e.g. DualSense Edge)
Player 2 Input:
  Handler: "Null"
# ... Player 3..7 Input
```

**Real device `global/Default.yml` is slim** — only `Handler`/`Device`/`Buddy
Device`, no `Config:` block — proving a **partial profile is valid**: any
`cfg_pad` key not present falls back to its built-in default. Korri may render
only the authored keys; unspecified buttons/tuning use RPCS3 defaults.

---

## 3. Handler enum strings (`pad_config_types.cpp` `fmt_class_string<pad_handler>`)

| Korri clean name | RPCS3 string | Availability |
|---|---|---|
| `null` | `Null` | all |
| `keyboard` | `Keyboard` | all |
| `ds3` | `DualShock 3` | all |
| `ds4` | `DualShock 4` | all |
| `dualsense` | `DualSense` | all |
| `skateboard` | `Skateboard` | all |
| `move` | `PS Move` | all |
| `sdl` | `SDL` | `HAVE_SDL3` |
| `evdev` | `Evdev` | `HAVE_LIBEVDEV` |
| `xinput` | `XInput` | **`_WIN32` only** |
| `mm` | `MMJoystick` | **`_WIN32` only** |

> **Plan constraint:** Korri targets Linux devices, so the `input.players[].handler`
> literal set should be the Linux-available handlers: `null`, `keyboard`, `ds3`,
> `ds4`, `dualsense`, `skateboard`, `move`, `sdl`, `evdev`. `xinput`/`mm` are
> Windows-only and should be omitted (or escape-hatch-only). Device default
> profile uses `Evdev`; Sunshine/gamescope virtual pad appears as an evdev device.

---

## 4. `Config:` map — full `cfg_pad` key set (`pad_config.h`)

All keys live under `Player N Input.Config`. Button values are **strings**
(handler-specific binding tokens, e.g. an evdev key name or a combo joined by
`&`/`,`); numeric tuning are uints with the ranges below.

**Buttons / dpad / sticks-as-buttons (cfg::string, default `""`):**
`Left Stick Left`, `Left Stick Down`, `Left Stick Right`, `Left Stick Up`,
`Right Stick Left`, `Right Stick Down`, `Right Stick Right`, `Right Stick Up`,
`Start`, `Select`, `PS Button`, `Square`, `Cross`, `Circle`, `Triangle`,
`Left`, `Down`, `Right`, `Up`, `R1`, `R2`, `R3`, `L1`, `L2`, `L3`.

**Motion / IR (cfg::string):** `IR Nose`, `IR Tail`, `IR Left`, `IR Right`,
`Tilt Left`, `Tilt Right`. **Sensors** (`Motion Sensor X/Y/Z/G`, each a
`cfg_sensor` node: `Axis` string, `Mirrored` bool, `Shift` int −1023..1023).
`Orientation Reset Button` (string), `Orientation Enabled` (bool).

**Pressure / analog limiter:** `Pressure Intensity Button` (string),
`Pressure Intensity Percent` (0-100, def 50), `Pressure Intensity Toggle Mode`
(bool), `Pressure Intensity Deadzone` (0-255), `Analog Limiter Button` (string),
`Analog Limiter Toggle Mode` (bool).

**Stick / trigger tuning (uint):** `Left Stick Multiplier` (0-200, def 100),
`Right Stick Multiplier` (0-200, def 100), `Left Stick Deadzone` (0-1000000),
`Right Stick Deadzone` (0-1000000), `Left Stick Anti-Deadzone`,
`Right Stick Anti-Deadzone`, `Left Trigger Threshold` (0-1000000),
`Right Trigger Threshold`, `Left Pad Squircling Factor` (def 4000),
`Right Pad Squircling Factor` (def 4000).

**LED / vibration:** `Color Value R/G/B` (0-255), `Blink LED when battery is
below 20%` (bool), `Use LED as a battery indicator` (bool), `LED battery
indicator brightness` (0-100), `Player LED enabled` (bool), `Large/Small
Vibration Motor Multiplier` (0-200), `Switch Vibration Motors` (bool),
`Vibration Threshold` (0-255).

**Mouse (keyboard/mouse-as-pad):** `Mouse Movement Mode` (enum
`Relative`/`Absolute`, def `Relative`), `Mouse Deadzone X/Y Axis` (0-255,
def 60), `Mouse Acceleration X/Y Axis` (def 200/250).

**Lerp / device identity:** `Left/Right Stick Lerp Factor` (0-100),
`Analog Button Lerp Factor`, `Trigger Lerp Factor`, `Device Class Type`,
`Vendor ID` (0-65535), `Product ID` (0-65535).

> Korri's delivery-agnostic schema should surface the **common** subset — handler,
> device, face/dpad/shoulder buttons, sticks (deadzone/multiplier), trigger
> thresholds, and keyboard/mouse-as-pad basics — and leave the deep tail
> (sensors, LEDs, lerp, squircling, device identity) escape-hatch-reachable,
> exactly as the settings surface phased its `config.yml` coverage.

---

## 5. Companion `config.yml` question — **ANSWERED: no pad companion needed**

The **per-player pad handler lives entirely in the profile file** (`cfg_player.Handler`).
`--input-config` alone binds pads; **no `config.yml` key is required** for pad
handler selection. This resolves the U3 open companion-config question.

`config.yml` has a separate `Input/Output:` section (device confirmed, line 192)
that selects **PS3 device-class emulation**, a different concept:

```yaml
Input/Output:
  Keyboard: "Null"      # PS3 keyboard DEVICE emulation (not keyboard-as-pad)
  Mouse: Basic          # PS3 mouse DEVICE emulation
  Camera / Move / Buzz / Turntable / GHLtar: handler selection
  Pad handler mode: Single-threaded
  Keep pads connected: true
  Background input enabled: true   # matters for headless; default true
```

**Two senses of "keyboard/mouse handler":**
1. **Keyboard-as-pad** — `Player N.Handler: Keyboard`, maps keys to a virtual
   DualShock. Lives in the **profile file**; covered by `--input-config`.
2. **PS3 keyboard/mouse device emulation** — `Input/Output.Keyboard`/`Mouse`.
   Lives in **config.yml**; if Korri ever exposes it, route through the
   **existing** `mapping.ts`/`config-render.ts` path, not the input profile.

For this plan's pad/keyboard-as-pad authoring, **no config.yml companion is
required.** (Optional hardening: `Background input enabled` is already default
`true`, so headless input is not gated on it.)

---

## 6. Write-back risk — low

`cfg_input::save()` is only invoked from the GUI pad-settings dialog. Headless
`--no-gui` never opens it, so RPCS3 does not rewrite the profile on exit
(contrast with the `config.yml` write-back concern). Korri still regenerates the
Korri-owned profile each launch, so this is doubly safe.

---

## 7. Decisions carried into U2–U5

- **Path:** write to `<state.root>/input_configs/global/<korriName>.yml`; pass
  the bare name via `--input-config <korriName>`. (Plan U4/U5 path corrected.)
- **No-clobber:** Korri-owned name (default `korri`); never write `Default.yml`
  or an operator profile. Operator profiles in `global/` are untouched.
- **Handler literals:** Linux-available set only (drop `xinput`/`mm`).
- **Partial profile is valid:** render authored keys; unset `cfg_pad` keys fall
  to RPCS3 defaults — no need to emit the full 60-key map.
- **Buddy Device:** include as optional (paired devices, e.g. DualSense Edge).
- **No config.yml companion** for pad handler selection; keyboard/mouse *device
  emulation* is deferred/escape-hatch, distinct from keyboard-as-pad.
- **Value verification source of truth:** `pad_config.h` (keys/ranges/defaults)
  + `pad_config_types.cpp` (handler + mouse-mode strings), pinned to the Aka
  build in the `input-mapping.ts` header.
