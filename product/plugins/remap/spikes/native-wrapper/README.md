# Remap native wrapper sink spike

Purpose: prove whether a Remap-owned native wrapper can create keyboard and gamepad outputs that are visible to the launched process but not visible globally to Korri UI.

This spike intentionally does **not** use CDP or any browser/debug protocol. It exercises Linux input primitives directly.

## Current candidate

`uinput-leak-probe.py` creates temporary virtual keyboard and gamepad devices through `/dev/uinput`, starts two readers for those event nodes, emits sample keyboard/gamepad events, and reports whether a second outside reader can observe the same events.

Expected interpretation:

- target reader sees events + outside reader does not: candidate may be viable for private wrapper work.
- target reader sees events + outside reader sees events: plain uinput is global and is not a safe Remap sink by itself.
- target reader does not see events: candidate does not deliver input to native processes.

The probe also records whether Sway sees the synthetic devices when `swaymsg` is available. Sway visibility is treated as a leak risk, not as the only proof.

## Run on Sobo

```sh
cd /storage/korri-remap-native-wrapper-spike
./validate-sobo.sh
```

The validation must pass before native `@korri:remap` product implementation proceeds. A failing result is useful evidence: it means the plan needs a different private sink mechanism rather than a global mapper.

## Sobo result: 2026-06-21

`validate-sobo.sh` failed for plain uinput. The target readers received keyboard and gamepad events, but outside readers also received the same events, and Sway saw the synthetic keyboard as an enabled input device.

`validate-seat-sobo.sh` tried assigning the transient uinput devices to a separate logind seat. `loginctl attach` rejected the synthetic devices because they lack the required udev seat properties, and the events still leaked to outside readers / Sway.

`validate-sway-disable-sobo.sh` disabled the synthetic keyboard in Sway before emitting. That reduced Sway's active handling (`send_events: disabled`) but the device was still visible to Sway and outside readers still received the events. This is a compositor workaround, not private input isolation.

`validate-udev-ignore-sobo.sh` installed a temporary udev rule under `/run/udev/rules.d` for the spike devices (`LIBINPUT_IGNORE_DEVICE=1`, `0600 root:root`). The devices were permission-restricted from the `korri` user, but Sway still listed the synthetic keyboard as an enabled input device, and root outside readers still observed the events. The script removed the temporary rule after the probe.

Evidence:

- `sobo-uinput-leak-result.json`
- `sobo-seat-result.json`
- `sobo-sway-disable-result.json`
- `sobo-udev-ignore-result.json`

`validate-dedicated-wrapper-sobo.sh` combined the viable pieces into a wrapper-shaped candidate:

1. install a product-owned udev rule before creating Remap synthetic devices;
2. mark spike devices as ignored by libinput / not normal input;
3. strip logind ACLs after device creation;
4. grant read access only to a dedicated launch user (`nobody` in the spike);
5. disable any matching Sway input that still appears;
6. emit keyboard and gamepad events.

That candidate passed the spike gate: the dedicated launch user received keyboard and gamepad events, `korri` readers got `EACCES`, and Sway did not list the synthetic devices.

Evidence:

- `sobo-dedicated-wrapper-result.json`

Conclusion: the viable Remap native shape is **not** global host-seat uinput. It is a privileged Remap wrapper that creates hidden synthetic devices, strips ambient ACLs, grants access only to a dedicated launch identity, runs the child under that identity/private context, and removes the devices on cleanup. Product implementation should build and harden this wrapper shape, including a real dedicated user instead of `nobody`.
