---
id: 01KXW3ZX58F6WYQHR4N1ND2GAK
slug: isolate-spurious-2s-wake-from-quiesced-s3-sleep-on-thor
title: Isolate spurious ~2s wake from quiesced S3 sleep on Thor
origin: parked
status: In Progress
priority: high
labels:
  - power
  - sm8550
  - kernel
  - spike
created: 2026-07-19
source: user
---

# Isolate spurious ~2s wake from quiesced S3 sleep on Thor

## Why it matters

The quiesced-guest deep-sleep architecture is proven (guest freeze + S3 + thaw preserved a live Ryujinx game byte-for-byte in RAM), but the SoC wakes ~1-2s after suspend entry, so real battery savings are not yet realized. Userspace-level isolation ruled out UCSI/battery-manager/MHI/remoteproc/gpio-keys device wakeups; AYN Key (msmgpio 41) and Hall Lid (msmgpio 17) edge interrupts increment each cycle. The stock ROCKNIX kernel lacks CONFIG_PM_SLEEP_DEBUG (pm_debug_messages) and GENERIC_IRQ_DEBUGFS, blocking further diagnosis without a kernel rebuild or PDC-level introspection.

## Acceptance Criteria

- [x] Identified the exact IRQ/wakeup source causing the early wake (evidence from pm_debug_messages, PDC introspection, or systematic IRQ bisect)
- [x] A quiesced S3 probe sleeps the full 30s RTC window (2026-07-19 combo run: dwc3-qcom unbound + mhi0/ucsi/battmgr/remoteproc/gpio-keys wakeups disabled — no early wake; sleep held until RTC alarm)
- [ ] Resume survives after a held sleep (combo run hard-crashed on resume — black screen, fan stuck, buttons dead; suspected ath12k/SMMU resume race when mhi0 wake is disabled)
- [ ] Bisect the 8-entry disable set down to the minimal sleep-hold set and identify which disable (if any) causes the resume crash
- [ ] Closed-lid battery draw measured in the quiesced-S3 state (target well below the ~0.87W fake-suspend floor)

## Related

- `../nix-on-rocks/docs/brainstorms/2026-05-26-003-hibernate-arbitrary-state-feasibility.md`
- `product/services/device/fakesuspend-controller.ts`

## Notes

Probe scripts live on the device at /storage/.guest/korri-*-s3-probe.sh; logs under /storage/.guest/probes/. Key facts: direct S3 with an unfrozen game hangs the suspend path (hard reboot required); freezing the whole rocknix-guest.service cgroup first makes S3 entry/exit clean (rc=0, no failed stages); host service watchdogs must be paused during guest freeze or systemd kills the guest at WatchdogSec=30s.

### Isolation results (2026-07-19 session)

- **Primary waker: dwc3-qcom (a600000.usb).** Ring buffer shows `port-1 HS-PHY not in L2` → `Wakeup pending. Abort CPU freeze` on entry. The controller runs in gadget mode with no cable; the PHY never reaches L2, leaving a wake IRQ pending. Attribution proven by driver unbind: with dwc3-qcom unbound, entry aborts stopped and CPUs fully powered down. suspend_stats records the aborts as `fail` with `last_failed_errno=-16` and no failed stage/device.
- **The wake bypasses the wakeup-source framework** — /sys/kernel/debug/wakeup_sources diff across a woken sleep is empty (raw `pm_system_irq_wakeup` path). This is why device power/wakeup toggles alone never explained it.
- **AYN Key (gpio41) ruled out**: `echo 194 > /sys/devices/platform/gpio-keys/disabled_keys` stopped its per-cycle IRQ increment but the early wake persisted; its edges (and Hall Lid's) are latched suspend-transition glitches, not wakers. key-ayn has no DT wakeup-source; hall-lid + volume-up do.
- **Secondary waker exists** in {mhi0, ucsi, battmgr-usb/wls, battery, adsp/cdsp remoteproc, gpio-keys}: with dwc3 unbound but that set enabled, sleep still ended ~1-2s after full entry. Not yet bisected.
- **Resume crash**: the only run that held sleep (dwc3 unbound + full disable set) hard-hung on resume, needing a forced power-off. Prime suspect: ath12k/MHI resume with mhi0 wake disabled (SMMU context-fault class from the 2026-05-26 S3 probe). Bisect must treat "holds sleep" and "survives resume" as separate axes.
- Kernel gaps for further work: no CONFIG_PM_SLEEP_DEBUG (`pm_debug_messages`, `pm_wakeup_irq`), no GENERIC_IRQ_DEBUGFS. A ROCKNIX kernel-config tweak would make the remaining bisect far cheaper.
- Fan tach (IRQ205, msmgpio 13) generates constant edges and fails affinity migration during CPU offline, but did not prove to be a waker; fan-off test was inconclusive because the wake aborted before tach mattered.
