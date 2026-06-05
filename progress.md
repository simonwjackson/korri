# Progress

## Status
Complete

## Tasks
- [x] Initial searches launched
- [x] Fetch Tailwind v4 docs on @theme / @theme inline
- [x] Fetch shadcn/ui theming docs
- [x] Fetch Style Dictionary / DTCG Tailwind v4 integration
- [x] Compile brief → research-runtime-theming.md

## Files Changed
- research-runtime-theming.md (created)

## Notes
Key findings documented. Critical caveat: @theme inline + calc(var()) is broken (issue #16396).
Safe pattern: pre-compute calc() in :root, then reference with var() in @theme inline.
