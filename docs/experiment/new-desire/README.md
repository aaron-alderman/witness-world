# New DESIRE

This folder contains a concrete draft for a new DESIRE stack:

- `DESIRE` is the smallest semantic kernel.
- `DESIRE+` is the structured source/debug IR that preserves more authored tree shape.
- `WTOML` and `RVM` are treated as source languages that lower into `DESIRE+`, then into `DESIRE`.

Files:

- [DESIRE-KERNEL.md](/C:/Users/aaron/Documents/world/docs/experiment/new-desire/DESIRE-KERNEL.md)
- [DESIRE-PLUS.md](/C:/Users/aaron/Documents/world/docs/experiment/new-desire/DESIRE-PLUS.md)
- [LOWERING-EXAMPLES.md](/C:/Users/aaron/Documents/world/docs/experiment/new-desire/LOWERING-EXAMPLES.md)
- [ROADMAP.md](/C:/Users/aaron/Documents/world/docs/experiment/new-desire/ROADMAP.md)

Working assumptions for this draft:

- `DESIRE` is not a human-first syntax.
- `DESIRE` must stay smaller than either current `wtoml` or current `RVM`.
- runtime wiring, DOM realization, transport, and plugin installation do not belong in `DESIRE`
- source-friendly tree shape, plugin syntax, and approximate round-tripping belong in `DESIRE+`

This is a semantic draft, not a parser/compiler design.
