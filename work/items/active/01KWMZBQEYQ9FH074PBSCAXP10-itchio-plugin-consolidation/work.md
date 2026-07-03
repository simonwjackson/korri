# itchio plugin consolidation

- **id:** 01KWMZBQEYQ9FH074PBSCAXP10
- **slug:** itchio-plugin-consolidation
- **type:** refactor
- **status:** active
- **created:** 2026-07-03
- **origin:** direct prompt ("itchio cleanup")

## Spine

Finish the plugins-catalog split for itch.io. The `@korri:itchio` folder plugin
(`product/plugins/itchio/`) is currently a thin wrapper around
`createItchioPluginDefinition`, whose 2,300-line implementation still lives in
`product/platform/acquisition/plugins/itchio.ts`. Move that implementation into
the plugin folder so the storefront lives in one place, leaving only the generic
acquisition-registry machinery in platform.

## Artifacts

- plan.md — implementation plan (this initiative)
