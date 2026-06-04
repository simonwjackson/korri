---
title: "refactor: Rename Compound Engineering package to Software Engineering"
type: refactor
status: active
date: 2026-05-06
origin: conversation
---

# refactor: Rename Compound Engineering package to Software Engineering

## Overview

Perform a big-bang package migration from the current `pi-compound-engineering` package to a new canonical `pi-software-engineering` package. The migration renames all `ce-*` skills and agents to `se-*`, folds in a curated subset of Matt Pocock's engineering skills, updates bedrock principles where appropriate, creates a new GitHub repository, and removes the old CE repository after verification.

There is intentionally **no backwards compatibility**. Do not create `ce-*` aliases, compatibility skills, compatibility agents, or old package shims.

## Target State

New local package:

```text
~/code/github/simonwjackson/pi-software-engineering
```

New remote repository:

```text
github.com/simonwjackson/pi-software-engineering
```

Package name:

```json
"@simonwjackson/pi-software-engineering"
```

The package contains:

- all current `pi-compound-engineering` skills renamed from `ce-*` to `se-*`
- all current `pi-compound-engineering` agents renamed from `ce-*.md` to `se-*.md`
- all internal operational references updated from `ce-*` to `se-*`
- selected Matt Pocock engineering skills:
  - `tdd`
  - `prototype`
  - `zoom-out`
  - `architecture-improvement` adapted from `improve-codebase-architecture`
  - `challenge-plan` adapted from `grill-with-docs`
- bundled `pi-subagents`
- a package extension renamed from Compound Engineering to Software Engineering

Do not retain:

- `ce-*` skill aliases
- `ce-*` agent aliases
- the old `pi-compound-engineering` package in settings
- the old local `~/.pi/packages/software-engineering` package in settings
- the old GitHub `pi-compound-engineering` repo after the new repo is verified and the user confirms deletion

## Package Boundary Decisions

### Keep separate packages

- `pi-bedrock-principals`
  - universal philosophy, standards, style, and engineering principles
  - always-on, cross-project
- `pi-lattice-stack`
  - TypeScript + React + Effect + Tailwind + Vite + Biome + Bun stack bindings
  - project opt-in
  - depends on bedrock

### Collapse / rename

Current packages/resources:

- `pi-compound-engineering`
- `~/.pi/packages/software-engineering` containing only `tdd`

Target package:

- `pi-software-engineering`
  - broad engineering workflows
  - includes the renamed `se-*` workflow family
  - includes selected Matt-derived workflows
  - can grow beyond the Compound Engineering framework over time

Keep the methodology name “Compound Engineering” only where it describes the philosophy or workflow family. Operational command names, skill names, agent names, paths, examples, and package identity use `se-*` / Software Engineering.

## Bedrock Principle Updates

Move only principles into `pi-bedrock-principals`, not workflows.

Add or adapt cross-project bedrock guidance for:

1. **Shared domain language**
   - Use established project terminology.
   - Do not invent synonyms for known domain concepts.
   - If terminology is unclear, clarify or document it in the project layer.

2. **Decision rationale**
   - Architectural decisions and trade-offs belong in durable project docs.
   - Do not leave rationale trapped only in chat history.
   - Do not prescribe global ADR paths; project-specific doc shapes stay project-specific.

3. **Deep modules**
   - Prefer small stable interfaces that hide meaningful complexity.
   - Avoid shallow wrappers that add names without reducing cognitive load.

4. **Behavioral public-contract tests**
   - Tests verify externally observable behavior through public contracts.
   - Avoid tests coupled primarily to private implementation shape.

Keep actual workflows in `pi-software-engineering`:

- `tdd`
- `prototype`
- `zoom-out`
- `architecture-improvement`
- `challenge-plan`
- all former `ce-*` skills/agents renamed to `se-*`

## Implementation Units

### Unit 1 — Prepare new package repo locally

Create the new package from the current CE package without mutating or deleting CE yet:

```bash
mkdir -p ~/code/github/simonwjackson
cp -a ~/code/github/simonwjackson/pi-compound-engineering \
  ~/code/github/simonwjackson/pi-software-engineering
```

Expected shape:

```text
pi-software-engineering/
  package.json
  README.md
  LICENSE
  agents/
  skills/
  extensions/
```

Remove any copied `.git/` directory from the new package before initializing the new repository.

### Unit 2 — Rename package metadata

Update:

```text
package.json
README.md
extensions/compound-engineering.ts
```

Rename extension file:

```text
extensions/compound-engineering.ts
→ extensions/software-engineering.ts
```

Update `package.json`:

```json
{
  "name": "@simonwjackson/pi-software-engineering",
  "version": "0.1.0",
  "description": "Software Engineering workflows, skills, and reviewer agents for the Pi coding agent.",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/simonwjackson/pi-software-engineering.git"
  },
  "keywords": [
    "pi-package",
    "software-engineering",
    "skills",
    "agents",
    "code-review",
    "planning"
  ],
  "pi": {
    "extensions": [
      "./extensions/software-engineering.ts",
      "./node_modules/pi-subagents/src/extension/index.ts"
    ],
    "skills": [
      "./skills",
      "./node_modules/pi-subagents/skills"
    ],
    "prompts": [
      "./node_modules/pi-subagents/prompts"
    ]
  }
}
```

Keep `pi-subagents` bundled as it is today:

```json
"dependencies": {
  "pi-subagents": "latest"
},
"bundledDependencies": [
  "pi-subagents"
]
```

### Unit 3 — Mechanical rename `ce-*` skills to `se-*`

Rename every current skill directory:

```text
skills/ce-brainstorm → skills/se-brainstorm
skills/ce-plan → skills/se-plan
skills/ce-work → skills/se-work
...
```

Inside every skill file, update operational names:

- frontmatter `name: ce-*` → `name: se-*`
- descriptions mentioning `/ce-*` → `/se-*`
- body references to `ce-*` skills → `se-*`
- examples using `Skill("ce-*")` → `Skill("se-*")`
- references to package resources by path → updated paths

Important: this is big-bang with no aliases. A package-wide search for `ce-` should be zero or explainable before the migration is complete.

### Unit 4 — Mechanical rename `ce-*` agents to `se-*`

Rename every current agent file:

```text
agents/ce-correctness-reviewer.md
→ agents/se-correctness-reviewer.md
```

Inside every agent file:

- frontmatter `name: ce-*` → `name: se-*`
- internal references to CE skill/agent names → SE names
- keep reviewer output labels like `"correctness"` unless they explicitly include `ce-`

### Unit 5 — Update orchestration references

Search package-wide:

```bash
rg 'ce-' .
rg '/ce-' .
rg 'ce_' .
rg 'compound-engineering|Compound Engineering' .
```

Update operational references such as:

```text
ce-code-review → se-code-review
ce-doc-review → se-doc-review
ce-pr-description → se-pr-description
ce-session-historian → se-session-historian
ce-work → se-work
```

Keep “Compound Engineering” only where it refers to the philosophy or methodology rather than command names, package identity, or install paths.

### Unit 6 — Update extension symlink behavior

Current extension exposes package agents into:

```text
~/.pi/agent/agents
```

Update it to link `se-*.md`, not `ce-*.md`.

Change constants and notification language from Compound Engineering to Software Engineering. Example notification:

```text
Software Engineering linked N SE subagent(s)
```

Since there is no backwards compatibility:

- remove old `~/.pi/agent/agents/ce-*.md` symlinks
- do not create `ce-*` aliases
- create or allow the extension to create `~/.pi/agent/agents/se-*.md`

The extension should remain conservative:

- create missing SE symlinks
- leave user-owned conflicting non-symlink files untouched
- warn via UI when conflicts exist

### Unit 7 — Bring in selected Matt Pocock engineering skills

Source:

```text
https://github.com/mattpocock/skills/tree/main/skills/engineering
```

License: MIT. Preserve attribution in `README.md` and/or a vendoring note.

Add:

```text
skills/tdd/
skills/prototype/
skills/zoom-out/
skills/architecture-improvement/
skills/challenge-plan/
```

Mapping:

```text
engineering/tdd → skills/tdd
engineering/prototype → skills/prototype
engineering/zoom-out → skills/zoom-out
engineering/improve-codebase-architecture → skills/architecture-improvement
engineering/grill-with-docs → skills/challenge-plan
```

Skip:

```text
engineering/setup-matt-pocock-skills
engineering/to-issues
engineering/to-prd
engineering/triage
```

#### `architecture-improvement` adaptation

Rename skill frontmatter:

```yaml
name: architecture-improvement
```

Adapt from upstream `improve-codebase-architecture`:

- remove hard dependency on `CONTEXT.md`
- remove hard dependency on `docs/adr/`
- read project instruction files when relevant
- read relevant plans, requirements docs, feature docs, and architecture docs when present
- search `docs/solutions/` when present and relevant
- use the project’s established domain language
- surface deepening opportunities
- align terminology with bedrock:
  - deep modules
  - public contracts
  - shared language
  - decision rationale

#### `challenge-plan` adaptation

Rename skill frontmatter:

```yaml
name: challenge-plan
```

Adapt from upstream `grill-with-docs`:

- remove “grill” language and tone
- purpose: stress-test an existing plan or proposed approach
- complement `se-plan` and `se-doc-review`; do not duplicate them
- ask one question at a time
- challenge assumptions, scope boundaries, sequencing, test strategy, migration risk, and undocumented decisions
- use the project’s established domain language
- if docs need updating, propose updates; do not silently write unless requested

Potential description:

```yaml
description: Stress-test an implementation plan or proposed approach against project context, domain language, existing decisions, risks, sequencing, and test strategy. Use when the user wants to challenge a plan, sharpen an approach before implementation, or identify hidden assumptions before work starts.
```

### Unit 8 — Merge old `~/.pi/packages/software-engineering`

Existing old package contains only `tdd`.

After `tdd` is present in the new `pi-software-engineering` package:

- remove old `../packages/software-engineering` from `~/.pi/agent/settings.json`
- optionally archive/delete `~/.pi/packages/software-engineering`

Do not leave both packages installed because `tdd` skill discovery will collide.

### Unit 9 — Update global settings

Current expected global settings before migration:

```json
[
  "../packages/pi-thinking",
  "../packages/software-engineering",
  "../packages/react",
  "../../code/github/simonwjackson/pi-compound-engineering"
]
```

Target:

```json
[
  "../packages/pi-thinking",
  "../packages/react",
  "../../code/github/simonwjackson/pi-software-engineering"
]
```

Also clean old agent symlinks:

```bash
rm -f ~/.pi/agent/agents/ce-*.md
```

Then either run a fresh Pi session or manually trigger the extension behavior to create:

```text
~/.pi/agent/agents/se-*.md
```

### Unit 10 — GitHub migration

Create new remote:

```bash
gh repo create simonwjackson/pi-software-engineering --public \
  --description "Software Engineering workflows, skills, and reviewer agents for the Pi coding agent." \
  --source=. --remote=origin --push
```

Verify GitHub install shape in a temp directory:

```bash
tmp=$(mktemp -d)
cd "$tmp"
git clone https://github.com/simonwjackson/pi-software-engineering.git
cd pi-software-engineering
npm install --omit=dev --omit=peer
ls node_modules/pi-subagents/src/extension/index.ts
```

Only after successful verification and explicit user confirmation, delete the old GitHub repo:

```bash
gh repo delete simonwjackson/pi-compound-engineering
```

This deletion is destructive and must be confirmed before execution.

Also remove or archive local old package after confirmation:

```text
~/code/github/simonwjackson/pi-compound-engineering
```

## Verification

Before deleting anything old, run:

```bash
cd ~/code/github/simonwjackson/pi-software-engineering

# no old operational names remain
rg 'ce-' .
rg '/ce-' .
rg 'ce_' .

# expected: zero, except explicitly justified historical attribution text

# all former CE skill names are renamed
find skills -maxdepth 1 -mindepth 1 -name 'se-*' | wc -l
find skills -maxdepth 1 -mindepth 1 -name 'ce-*' | wc -l # must be 0

# all agents renamed
find agents -maxdepth 1 -name 'se-*.md' | wc -l
find agents -maxdepth 1 -name 'ce-*.md' | wc -l # must be 0

# selected Matt-derived skills exist
for skill in tdd prototype zoom-out architecture-improvement challenge-plan; do
  test -f "skills/$skill/SKILL.md"
done

# package install shape
npm pack --dry-run --json

# bundled dependency exists locally after npm install
ls node_modules/pi-subagents/src/extension/index.ts
```

After installing locally:

```bash
pi list
```

Expected:

```text
pi-software-engineering
```

Not expected:

```text
software-engineering
pi-compound-engineering
```

Manual skill checks in a fresh session:

```text
/skill:se-plan
/skill:se-work
/skill:se-code-review
/skill:tdd
/skill:prototype
/skill:zoom-out
/skill:architecture-improvement
/skill:challenge-plan
```

Manual subagent checks:

```bash
find ~/.pi/agent/agents -maxdepth 1 -name 'se-*.md' | wc -l
find ~/.pi/agent/agents -maxdepth 1 -name 'ce-*.md' | wc -l
```

Expected: many `se-*`, zero `ce-*`.

## Risks and Mitigations

### Missed internal references

Risk: skills still invoke old `ce-*` names after the rename.

Mitigation:

```bash
rg 'ce-' .
rg '/ce-' .
rg 'ce_' .
```

Resolve every hit or document why it is intentionally historical/non-operational.

### Subagent discovery broken

Risk: `pi-subagents` still does not discover package `agents/` natively, so SE agents may not be available.

Mitigation:

- keep the package extension that creates user-agent symlinks
- verify `~/.pi/agent/agents/se-*.md`
- verify a fresh Pi session can use SE reviewer agents

### Skill collision with old `tdd`

Risk: old `~/.pi/packages/software-engineering` and new package both expose `tdd`.

Mitigation:

- remove old package from `~/.pi/agent/settings.json`
- archive/delete old package after new package is verified

### Matt skills assume their setup skill

Risk: imported skills reference `setup-matt-pocock-skills`, `CONTEXT.md`, fixed ADR paths, or issue tracker conventions.

Mitigation:

- adapt `architecture-improvement` and `challenge-plan`
- skip setup/issue/triage skills
- package-wide search for:

```bash
rg 'setup-matt|CONTEXT\.md|docs/adr|grill|triage|issue tracker' skills/{architecture-improvement,challenge-plan}
```

### Remote deletion too early

Risk: deleting `pi-compound-engineering` before the new repo works.

Mitigation:

- create and verify new repo first
- confirm with user before deleting the old GitHub repo
- keep local old package until the new package is installed and tested

## Recommended Sequence

1. Create new local `pi-software-engineering` from current `pi-compound-engineering`.
2. Rename all `ce-*` skills and agents to `se-*`.
3. Update package metadata and extension behavior.
4. Import and adapt selected Matt skills.
5. Update bedrock principles.
6. Run package-wide reference checks.
7. Install local new package and verify skill/subagent discovery.
8. Create and push new GitHub repo.
9. Update global settings to use only new package.
10. Remove old local `~/.pi/packages/software-engineering` from settings and archive/delete it.
11. Ask user for confirmation.
12. Delete GitHub `pi-compound-engineering` and archive/delete local `pi-compound-engineering`.

## Open Questions for Next Session

- Should “Compound Engineering” remain as prose methodology language inside renamed `se-*` skills, or should the prose fully rebrand to “Software Engineering”?
- Should `challenge-plan` be positioned before `se-plan`, after `se-plan`, or both?
- Should `architecture-improvement` produce a durable document by default, or only a report in chat unless asked?
- Should the new package tag an initial `v0.1.0` release immediately, or track unpinned `main` like the other packages assembled today?
