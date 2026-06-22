---
id: 01KVPDA9QGRW0ZHJFBQ1V0V6GA
title: Refactor CDP bridge into remap launch companion
status: active
created: 2026-06-21
source: se-plan
---

# Refactor CDP bridge into remap launch companion

Plan a follow-up refactor from the CDP-shaped input bridge API to a general `@korri:remap` launch companion for launch-scoped control remapping.

## 2026-06-22 native product validation

Sobo product-native driver validation passed with the Remap wrapper path:

- command staged at `/storage/korri-remap-product-validation` using product `native-driver.py`;
- source resolved to the InputPlumber-normalized virtual controller;
- physical south/A input remapped to synthetic keyboard `KEY_A` (`code=30`) and gamepad `BTN_EAST` (`code=305`);
- wrapped validation child ran as `korri-remap-runner` and received both keyboard and gamepad output;
- Korri user readers received no events;
- Sway isolation gate passed with no active synthetic devices;
- cleanup verification passed: synthetic Remap devices disappeared after child exit.

Durable evidence: `product/plugins/remap/spikes/native-wrapper/sobo-product-native-driver-result.json`.
