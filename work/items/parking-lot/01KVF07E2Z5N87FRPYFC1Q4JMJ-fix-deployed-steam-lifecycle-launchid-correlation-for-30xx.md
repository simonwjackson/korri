---
id: 01KVF07E2Z5N87FRPYFC1Q4JMJ
slug: fix-deployed-steam-lifecycle-launchid-correlation-for-30xx
title: Fix deployed Steam lifecycle launchId correlation for 30XX
origin: parked
status: To Do
priority: high
labels:
  - steam
  - observability
  - bandai
created: 2026-06-19
source: user
---

# Fix deployed Steam lifecycle launchId correlation for 30XX

## Why it matters

Bandai can expose rich Steam app-id lifecycle phases after the observability deploy, but a live 30XX launch did not attach the sessiond launchId to Steam lifecycle events; operators can see sessiond launchId and Steam app phases separately, but cannot fully prove they are the same launch from the typed lifecycle API.

## Acceptance Criteria

- [ ] Launching 30XX through app.library.launch produces app.plugin.lifecycle.collect events that include the same launchId shown in app.session.status/app.server.status.
- [ ] Collecting app.plugin.lifecycle.collect with { launchId } returns non-empty correlated Steam lifecycle events and a summary containing launchId/playableId.
- [ ] A deployment smoke check on bandai proves the correlated launchId path end-to-end.

## Related

- `product/apps/portal/api/library/launch.rpc-handler.ts`
- `product/plugins/steam/src/observability/log-observer.ts`
- `product/plugins/steam/src/observability/launch-state.ts`
- `product/plugins/steam/src/observability/lifecycle-api.ts`

## Notes

Observed after switching bandai to q7pjidas... with korrid 54yna1... and sessiond 61w3r.... Sessiond active launchId was 79cbc057-2289-4628-a25a-8034291433e7, appId lifecycle showed phases/events for 1029210, but collect by launchId returned zero events and summaries lacked launchId/playableId.
