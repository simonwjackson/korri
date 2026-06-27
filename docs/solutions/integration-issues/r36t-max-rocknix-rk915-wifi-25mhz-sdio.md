---
title: R36T Max ROCKNIX RK915 Wi-Fi needs 25 MHz SDIO
date: 2026-06-27
category: integration-issues
module: R36T Max ROCKNIX RK915 Wi-Fi
problem_type: integration_issue
component: tooling
symptoms:
  - "ROCKNIX booted but showed no Wi-Fi networks for the R36T Max RK915 radio"
  - "At 50 MHz SDIO, rk915 loaded but firmware reset or probe failed with SDIO timeouts"
  - "Changing the RK915 power/reset GPIO to active-high made SDIO enumeration fail entirely"
root_cause: config_error
resolution_type: config_change
severity: medium
tags: [r36t-max, rocknix, rk915, sdio, wifi, rk3326]
---

# R36T Max ROCKNIX RK915 Wi-Fi needs 25 MHz SDIO

## Problem

The R36T Max can boot ROCKNIX from SD card with a custom RK915 driver, firmware, and device tree, but Wi-Fi initially failed even though ArkOS proved the same hardware works. The standalone ROCKNIX proof needed a device-tree tuning change before RK915 could scan, associate, and stay reachable over SSH.

## Symptoms

- With `max-frequency = <50000000>;`, RK915 could enumerate as SDIO and sometimes create `wlan0`/`wlan1`, but firmware reset failed with SDIO `-110` timeouts.
- Changing PA2 from active-low to active-high made the result worse: `mmc2: Failed to initialize a non-removable card`, no `wlan0`, and `rk915_init: platform_bus_init failed`.
- The ROCKNIX UI could show “no wifi networks found” while the driver was present but not successfully scanning.

## What Didn't Work

- Copying the ArkOS module was not viable: ArkOS used Linux `4.4.189`, while the ROCKNIX proof image used Linux `6.12.79`.
- Building a full source ROCKNIX image was slower than useful on NixOS because unrelated userspace host dependency issues blocked progress after the kernel/module pieces were already proven.
- Using the vendor patch's active-high PA2 polarity for the pwrseq reset line was wrong for this R36T Max proof: SDIO enumeration regressed completely.
- Leaving SDIO at 50 MHz was too aggressive for the mainline ROCKNIX + out-of-tree RK915 combination on this device.

## Solution

Keep the SD-card-only proof image approach, but tune the R36T Max device tree so RK915 uses active-low PA2 and a 25 MHz SDIO clock.

Key DTS settings:

```dts
sdio_pwrseq: sdio-pwrseq {
    compatible = "mmc-pwrseq-simple";
    pinctrl-0 = <&wifi_enable_h>;
    pinctrl-names = "default";
    post-power-on-delay-ms = <100>;
    reset-gpios = <&gpio0 RK_PA2 GPIO_ACTIVE_LOW>;
};

&sdio {
    bus-width = <4>;
    cap-sd-highspeed;
    cap-sdio-irq;
    keep-power-in-suspend;
    max-frequency = <25000000>;
    mmc-pwrseq = <&sdio_pwrseq>;
    no-mmc;
    no-sd;
    non-removable;
    status = "okay";
};
```

The standalone proof also used the vendor-recommended module options from the RK915 test script:

```conf
options rk915 down_fw_in_probe=1 default_phy_threshold=180 lpw_no_sleep=1
```

After the 25 MHz change, the proof booted and SSH worked at `192.168.1.119`. Verification showed `wlan0` connected, `rk915` loaded, `mmc2: new high speed SDIO card`, firmware download success, reset complete, and association.

## Why This Works

ArkOS proved the R36T Max's onboard Wi-Fi path is RK915 over SDIO on `dwmmc@ff380000`, with PA2 as the power/reset control and PA5 as host wake. The ROCKNIX proof already had the right broad ingredients: a matching `6.12.79` RK915 module, firmware files, forced DTB, and NetworkManager connection.

The remaining failure was timing/signal stability on the SDIO bus. At 50 MHz, the card could appear but the RK915 firmware reset path timed out. Reducing the host max frequency to 25 MHz kept SDIO enumeration stable long enough for firmware download, reset completion, scan, association, DHCP, and SSH.

## Prevention

- For R36T Max RK915 bring-up, preserve SD-card-only recovery until the exact DTB and driver settings are proven.
- Treat ArkOS as a hardware oracle, not as a module source: harvest GPIO, SDIO, firmware, and interface facts, but rebuild modules for the target ROCKNIX kernel.
- When SDIO Wi-Fi partially enumerates but firmware reset fails, test lower `max-frequency` before changing more invasive power or driver code.
- Do not migrate this proof into `nix-on-rocks` without carrying the proven constraints: PA2 active-low, PA5 host-wake, RK915 firmware, RK915 driver, module options, and 25 MHz SDIO.

## Related Issues

- Related local proof repo: `/home/simonwjackson/code/sandbox/rocknix-r36tmax-proof`
- Vendor RK915 source used for the proof: `stolen/rk915` at `590fe1dd3fa9569117317b2e0dcbe02c42f8419e`
