---
title: Temporary ROCKNIX sidecar media should stay Korri-owned and deletable
date: 2026-05-03
category: docs/solutions/best-practices
module: korri/shared/library/rocknix + korri/shared/api/http
problem_type: best_practice
component: tooling
severity: medium
applies_when:
  - Adding hand-curated artwork for the personal ROCKNIX/Odin MVP
  - Avoiding edits to EmulationStation-managed gamelist.xml metadata
  - Introducing temporary device-local data conventions that must not become product architecture
tags: [rocknix, odin, media, gamelist, sidecar, temporary]
---

# Temporary ROCKNIX sidecar media should stay Korri-owned and deletable

## Context

The personal Odin MVP needed artwork for real ROCKNIX games, starting with Mario Kart Wii, but the games came from EmulationStation `gamelist.xml` files that did not include image metadata. Editing `gamelist.xml` would have made Korri share ownership of an EmulationStation-managed file and risked ES rewriting or displaying Korri-only art.

The short-term solution was a Korri-owned sidecar folder plus a narrow media route. The implementation deliberately avoids touching ES metadata and maps sidecar files into the existing `GameRecord.metadata.media` shape at read time.

## Guidance

Use a Korri-owned sidecar folder for temporary hand-added ROCKNIX artwork:

```text
/storage/korri/media/games/<system>/<rom-stem>/
  cover-1024.jpg
  cover-512.webp
  poster-600x900.png
  hero-1280x720.webp
  banner-460x215.png
```

For example, the real Odin ROM:

```text
/storage/roms/wii/mario-kart-wii-usa-en-fr-es.rvz
```

maps to:

```text
/storage/korri/media/games/wii/mario-kart-wii-usa-en-fr-es/
  cover-1024.jpg
  poster-600x900.png
  banner-460x215.png
```

`RocknixSource` may attach those files to `GameRecord.metadata.media` as normal image entries:

```text
/api/media/games/wii/mario-kart-wii-usa-en-fr-es/cover-1024.jpg
/api/media/games/wii/mario-kart-wii-usa-en-fr-es/poster-600x900.png
/api/media/games/wii/mario-kart-wii-usa-en-fr-es/banner-460x215.png
```

Keep the temporary seam constrained:

- The lookup belongs only in `korri/shared/library/rocknix/rocknix-source.ts`.
- The serving route belongs only under the existing API layer, currently `korri/shared/api/http/media-assets.ts` via `/api/media/*`.
- UI components should not know the sidecar convention; they should consume `GameRecord.metadata.media` only.
- Odin sync/bootstrap scripts should exclude `$ODIN_PROJECT/media` so rsync does not delete device-local hand-added media.
- Do not add scraping, aliases, ranking logic, metadata editing, or dimension validation to this seam. Those belong to the eventual real media/import pipeline.

Make the temporary nature obvious in code and config. Prefer explicit names such as:

```text
KORRI_ROCKNIX_TEMP_MEDIA_ROOT
KORRI_ENABLE_ROCKNIX_SIDECAR_MEDIA
```

over generic names such as `KORRI_MEDIA_ROOT` if the seam grows beyond the immediate MVP. Add a deletion-oriented comment near the lookup:

```ts
// Temporary personal-MVP ROCKNIX sidecar for hand-added artwork.
// Delete when the real library media/import pipeline exists; do not expand
// this into a general metadata system.
```

## Why This Matters

EmulationStation owns `gamelist.xml`. If Korri writes image paths into that file, three things become harder:

1. **Ownership becomes ambiguous.** ES and Korri can both read and rewrite the same metadata file.
2. **Korri-only art can leak into ES.** Standard ES fields such as `<image>` may change the ES UI, not just Korri.
3. **A temporary MVP shortcut can become architecture.** Once product code starts depending on ES metadata edits, replacing ROCKNIX with proseql or Korri OS media import becomes harder.

A sidecar keeps the shortcut honest. It is device-local, easy to delete, and invisible to ES. The only durable contract exposed to the rest of Korri is the existing `GameRecord.metadata.media` field.

## When to Apply

- Apply this for hand-curated artwork during the single-user Odin/ROCKNIX MVP.
- Apply this when the media is only for Korri and should not affect EmulationStation.
- Do not apply this for a general scraper, library import system, or long-lived media database.
- Remove or gate it when Korri gets a real media/import pipeline or a non-ROCKNIX `LibrarySource` that owns media natively.

## Examples

Avoid editing ES-owned metadata for Korri-only art:

```xml
<!-- Avoid for the temporary MVP: ES may display or rewrite this. -->
<game>
  <path>./mario-kart-wii-usa-en-fr-es.rvz</path>
  <image>./media/korri/cover-1024.jpg</image>
</game>
```

Prefer Korri-owned sidecar media:

```text
/storage/korri/media/games/wii/mario-kart-wii-usa-en-fr-es/cover-1024.jpg
```

and let the ROCKNIX adapter attach it at read time:

```json
{
  "id": "wii/mario-kart-wii-usa-en-fr-es.rvz",
  "metadata": {
    "media": [
      {
        "type": "image",
        "uri": "/api/media/games/wii/mario-kart-wii-usa-en-fr-es/cover-1024.jpg"
      }
    ]
  }
}
```

The implementation was verified on the Odin by serving:

```text
GET http://sm8550:3001/api/media/games/wii/mario-kart-wii-usa-en-fr-es/cover-1024.jpg
```

and by confirming `app.library.list` returned Mario Kart Wii with the sidecar media URIs.

## Related

- `../../../work/01KQJZR90GHVYQ169G3QWN3G5T-feat-personal-mvp-rocknix-launch/requirements.md` — defines ROCKNIX adapter scope and the "wrap, don't extend ROCKNIX" discipline.
- `../../../work/01KQJZR90GHVYQ169G3QWN3G5T-feat-personal-mvp-rocknix-launch/plan.md` — implementation plan for the ROCKNIX `LibrarySource` and launch seams.
- `docs/solutions/best-practices/prefer-real-implementations-over-mocks-2026-05-02.md` — tests should exercise the real filesystem shape rather than mocking the adapter.
- `docs/solutions/integration-issues/2026-05-02-bdd-fixture-deferred.md` — related warning that rewriting `gamelist.xml` is fixture infrastructure work, not a casual runtime shortcut.
