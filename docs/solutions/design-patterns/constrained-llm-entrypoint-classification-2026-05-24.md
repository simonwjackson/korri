---
title: Constrain LLMs to entrypoint classification before writing game library YAML
date: 2026-05-24
category: docs/solutions/design-patterns
module: korri game archive importer
problem_type: design_pattern
component: tooling
severity: medium
applies_when:
  - Importing arbitrary itch.io zip files or extracted game archives
  - Using local or remote LLMs to identify likely game launchers
  - Converting noisy archive layouts into Korri ProseQL game records
  - Evaluating tiny models for structured importer decisions
tags: [archive-import, entrypoints, llm, json, proseql, games, qwen, groq]
---

# Constrain LLMs to entrypoint classification before writing game library YAML

## Context

Korri needs to import arbitrary game archives into a ProseQL library without trusting the archive layout. itch.io downloads may contain Unity Windows builds, Ren'Py multi-platform bundles, crash handlers, runtime binaries, Python engine code, shell wrappers, and support tools in the same extracted tree.

The initial prompt shape asked small models to inspect a file listing and emit final Korri YAML plus likely entrypoints. That worked only when the prompt was highly specific and the answer was effectively pre-filled. With generic prompts, tiny models copied placeholders, emitted markdown fences, echoed the input, nested fields incorrectly, or selected bundled runtime binaries as if they were the game launcher.

Session history search was enabled for this compound run, but no prior Korri sessions were found in the configured Claude Code, Codex, or Cursor session directories.

## Guidance

Split archive import into deterministic scanning, constrained model classification, and deterministic YAML construction.

```text
archive -> deterministic candidate scanner -> minimal JSON classifier -> validator -> ProseQL YAML writer
```

The model should not author final nested Korri YAML directly. It should rank a small list of candidate entrypoints and return minimal JSON such as:

```json
{
  "entrypoints": [
    {
      "fullpath": "Feed the Forest.exe",
      "system": "windows",
      "confidence": 1.0,
      "signals": ["top-level", "windows-exe"]
    }
  ]
}
```

The scanner owns evidence collection. It can include files with executable permissions or known executable extensions:

```bash
find . -type f \( -perm -111 -o -iregex ".*\.\(exe\|bat\|cmd\|com\|msi\|appimage\|sh\|py\|jar\|desktop\)" \)
```

Then it should prune obvious noise and annotate candidates with signals before prompting the model:

- `top-level`
- `windows-exe`
- `linux-shell`
- `python-script`
- `java-jar`
- `support-tool`
- `bundled-runtime`
- `archive-name-match`

The importer, not the model, should turn the accepted classification into Korri ProseQL YAML:

```yaml
games:
  windows/feed-the-forest:
    system: windows
    contentPath: Feed the Forest.exe
    metadata:
      name: Feed The Forest
```

Validate every model response before writing library data:

- strip markdown fences when present
- parse JSON
- reject enum values outside the importer contract
- reject `fullpath` values that were not in the candidate set
- reject echoed prompt/candidate blocks
- choose the final `games` key, `system`, `contentPath`, and `metadata.name` deterministically from validated data and scanner-derived slug/name hints

## Why This Matters

Archive layouts are inconsistent, but final library records are durable product data. A model can help rank noisy candidates, but it should not own the database shape.

The constrained split keeps each layer honest:

- The scanner is deterministic and reproducible.
- The model performs the fuzzy task: ranking likely human-facing launchers.
- The validator enforces the importer contract.
- The ProseQL writer produces canonical Korri-owned YAML.

This also makes tiny model evaluation practical. The failure mode becomes a rejected classification response instead of corrupted library YAML.

## When to Apply

Use this pattern when importing:

- arbitrary itch.io zip files
- extracted game archives
- mixed-platform bundles
- Unity builds with crash handlers
- Ren'Py bundles with both `.exe` and `.sh` launchers
- archives where support tools and game launchers share executable extensions
- model-assisted importer flows that target Korri ProseQL records

Target runtime matters. For a Ren'Py bundle, `linux-native` should prefer the shell launcher, while `windows-wine` should prefer the Windows executable. In `auto` mode, preserve plausible alternatives for review rather than collapsing too early.

## Examples

### Unity Windows archive

A Feed the Forest archive extracted to a Unity layout:

```text
Feed the Forest.exe
UnityCrashHandler64.exe
Feed the Forest_Data/
UnityPlayer.dll
GameAssembly.dll
```

The scanner should mark the game executable as the top-level launcher and the crash handler as a support tool. Qwen2.5-Coder-1.5B Q4 returned a useful minimal JSON classification:

```json
{
  "entrypoints": [
    {
      "fullpath": "Feed the Forest.exe",
      "system": "windows",
      "confidence": 1.0,
      "signals": ["top-level", "windows-exe"]
    },
    {
      "fullpath": "UnityCrashHandler64.exe",
      "system": "windows",
      "confidence": 0.5,
      "signals": ["top-level", "windows-exe", "support-tool"]
    }
  ]
}
```

Groq `llama-3.1-8b-instant` returned the same ranking as clean JSON without markdown fences.

### Ren'Py multi-platform bundle

A Mixology Ren'Py bundle exposed multiple plausible top-level launchers:

```text
Mixology.exe
Mixology.py
Mixology.sh
lib/py3-linux-x86_64/Mixology
```

The correct choice depends on runtime:

- `windows-wine` -> `Mixology.exe`
- `linux-native` -> `Mixology.sh`
- `auto` -> preserve both top-level alternatives with confidence and signals

The nested `lib/py3-linux-x86_64/Mixology` binary is invoked by the shell wrapper and should be treated as a bundled runtime detail, not the preferred user-facing entrypoint.

### Model/runtime notes

During evaluation:

- Qwen2.5-0.5B Q4 was too weak for this task and copied enum placeholders even with JSON prompts.
- Qwen2.5-1.5B Q4 improved but still copied placeholders or over-ranked support tools in some prompts.
- Qwen2.5-Coder-1.5B Q4 was the best tiny local model tested for the minimal JSON shape.
- `aka` with RX 7900 XT and `llama.cpp-vulkan` was fast enough for iteration.
- `sobo` Adreno Vulkan was unreliable for this workload, producing `vk::DeviceLostError` with Qwen 1.5B and garbage output with Qwen 0.5B.
- `sobo` CPU could run Qwen 1.5B but took roughly 165 seconds for one prompt, too slow for prompt iteration.

## Related

- [ProseQL library YAML should use canonical storage with key-derived IDs](../best-practices/proseql-canonical-library-with-derived-yaml-ids-2026-05-06.md) — explains why importers should write Korri-owned ProseQL YAML instead of leaking external formats into runtime storage.
- [Prefer real implementations over mocks in unit, integration, and BDD tests](../best-practices/prefer-real-implementations-over-mocks-2026-05-02.md) — reinforces validating real parser, filesystem, and schema boundaries instead of relying on imagined shapes.
- [Temporary ROCKNIX sidecar media instead of ES gamelist edits](../best-practices/temporary-rocknix-sidecar-media-instead-of-es-gamelist-edits-2026-05-03.md) — adjacent guidance on keeping temporary import/media seams constrained and deletable.
