# Live Core Goal Contract

## Objective

Build a durable live execution substrate where the platform can change while staying alive.

The Rust core owns generation continuity, proof state, process health, promotion, rollback, and last-good behavior. Node remains the current app executor, but it becomes generation-aware and supervised rather than being the platform's source of continuity.

This is a continuity-first phase. The work is successful only when source changes can be staged, proven, promoted, rejected, or rolled back without bringing down the live application experience.

## Non-Negotiable Invariants

- The app must continue serving last-good behavior when a candidate fails.
- Node app boot must not depend on the Rust core unless explicitly running in supervised mode.
- The Rust core must not crash because a proof, child process, preview edit, or app generation fails.
- Every candidate change must have provenance: source paths, hash, proof result, parent generation, and current state.
- Preview/debug edits must not write published source unless explicitly promoted through a controlled path.
- Sourcery must show operational truth: checking, failed, green, slow, stale, last-good, rollback available.
- Generation identity must be stable and explicit. No hidden mutation paths.
- Do not add Wasm or AssemblyScript execution until the generation/process/proof path is working end-to-end.

## Anti-Goals

- Do not rewrite the app runtime wholesale.
- Do not move semantics into Rust yet.
- Do not build a beautiful UI before the continuity path is real.
- Do not create a second preview/debug model beside generations.
- Do not hide failures behind retries.
- Do not make Node depend on Rust for normal boot unless supervised mode is requested.
- Do not introduce Postgres, distributed gossip, or plugin APIs in this phase.
- Do not solve collaboration before local generation continuity works.

## Definition Of Done

A user can:

1. Start the Rust core.
2. Start Engentus connected to the core.
3. Edit a watched source file.
4. See a candidate generation appear.
5. See proof progress in Sourcery.
6. If proof fails, keep using last-good behavior.
7. If proof passes, see a green-local generation.
8. Promote green-local to stable.
9. Roll back to last-good.
10. Use debug/preview edits through the same generation model.
11. Restart either Rust or Node without losing generation history.

## Handoff Rules

Before editing:

- Read this goal contract.
- Read current git status.
- Identify existing dirty files before touching anything.
- State which part of the definition of done the work is advancing.

While editing:

- Prefer vertical slices over isolated infrastructure.
- Add tests for every continuity claim.
- If adding a new API, connect at least one real consumer.
- If adding UI, it must reflect real core state, not mocked state.

Before stopping:

- Record what now works.
- Record what remains.
- Record exact test commands run.
- Record known failures and whether they are pre-existing.

## Scope Filter

If a change does not improve generation-aware continuity, last-good safety, process supervision, proof visibility, or preview/debug integration with generations, it is probably out of scope.

This filter is deliberately strict. It exists to prevent drift into Rust fantasy, UI polish, Wasm research, collaboration features, or another disconnected debug tool before the live core path is real.

## Implementation Bias

- Make the smallest working vertical slice before broadening abstractions.
- Preserve existing app behavior unless a supervised mode explicitly opts into Rust-owned process continuity.
- Keep all state transitions visible and durable.
- Prefer append-only records and derived views over hidden mutable state.
- Treat preview/debug edits as candidate-generation work, not as a separate authoring universe.
- Surface failure close to the user through Sourcery and status APIs.
- Keep future Wasm, AssemblyScript, Postgres, gossip, and collaboration compatible with the generation API, but do not implement them until the local continuity path is proven.

