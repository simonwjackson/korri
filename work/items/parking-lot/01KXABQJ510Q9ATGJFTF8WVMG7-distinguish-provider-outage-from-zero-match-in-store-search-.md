---
id: 01KXABQJ510Q9ATGJFTF8WVMG7
slug: distinguish-provider-outage-from-zero-match-in-store-search-
title: Distinguish provider-outage from zero-match in Store search UI
origin: parked
status: To Do
priority: medium
labels:
  - shift
  - store
  - acquisition
  - ux
created: 2026-07-12
source: se-debug
---

# Distinguish provider-outage from zero-match in Store search UI

## Why it matters

On Bandai, transient Wi-Fi drops (wlan0 deauth/reassoc observed in dmesg) make app.acquisition.search return zero claims because every provider fails. The Store UI renders this as "Nothing found. Try another search.", which reads as a product defect and misled debugging twice. The server already tracks provider health; the search response/UI should surface "catalogs unreachable — retry" when all (or most) providers errored, and ideally auto-retry when connectivity returns.

## Acceptance Criteria

- [ ] Search response (or a parallel channel) exposes per-provider failure/health for the query
- [ ] Store UI shows an unreachable/retry state instead of the empty state when all providers failed
- [ ] Empty state only renders when at least one provider succeeded with zero matches
- [ ] Focused tests cover: all-fail, partial-fail, and true zero-match

## Related

- `product/surfaces/web/shift/routes/ShiftStoreRoute.tsx`
- `product/apps/portal/api/acquisition/search.rpc-handler.ts`
- `product/platform/protocol/acquisition/source-health.ts`

## Notes

Also observed: wlan0 deauth "by local choice" ~70s outage on Bandai — possibly Wi-Fi power save; separate device-level investigation may be warranted if it recurs.
