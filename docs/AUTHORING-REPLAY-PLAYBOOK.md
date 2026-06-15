# Authoring Replay Playbook

Use this playbook whenever an app slice must stay inside constrained
`plugin.authoring` work and the next platform gap needs to be identified
honestly.

## Purpose

The replay is not a demo and it is not a workaround path. It is a diagnostic
ladder for finding the first missing authoring primitive without widening the
platform speculatively.

## Core rules

1. Author only through the first-party MCP authoring surface.
2. Use the reference app only as an oracle for expected outcomes.
3. Prove the smallest possible slice at each rung.
4. Stop at the first missing primitive.
5. Record the blocker as a structured handoff, not as handwritten JS or a core
   runtime patch.

## Method

1. Read the machine-readable authoring/runtime capability matrix first.
2. Pick one gate from the canonical pathway.
3. Author the smallest artifact that could satisfy that gate.
4. Serve it through the real runtime path.
5. Verify the live result directly.
6. Attempt the next authored step immediately after the proved one.
7. If that step cannot be expressed, capture the blocker and stop.

## What counts as good evidence

- HTTP success alone is not enough.
- The served HTML must contain authored content that distinguishes success from
  fallback.
- If routing is in scope, at least two distinct request paths must resolve to
  distinct authored outputs.
- If navigation is in scope, the rendered HTML must contain the authored target
  that the generic runtime host will use.
- If a proposed next primitive does not exist, prove that through the actual
  first-party authoring surface rather than by assumption.

## Classifying the blocker

Before recording a blocked handoff, classify it:

- language limitation
  - the current DESIRE language cannot say the needed app intent
- platform limitation
  - the intent is DESIRE-shaped, but first-party authoring APIs, lowering, or
    runtime projection do not yet support it
- policy limitation
  - a workaround exists, but constrained mode forbids using it

Do not casually label a blocker as an `RVM/WTOML` limitation. First prove that
the gap is not merely missing authoring/runtime support for an otherwise DESIRE-
shaped concept.

## Current Engentus replay sequence

1. Capability-matrix gate
   - Read the constrained authoring/runtime matrix first.
   - Confirm the public canonical frontend model is
     `surface + process + projection + capability`.
   - Confirm legacy widget-program actions are not part of the constrained
     public MCP surface.
2. Surface serving proof
   - MCP authors a tiny `page.surface` shell tree.
   - The route serves real authored shell HTML.
3. Multi-screen surface proof
   - MCP authors more than one surface state under the same root.
   - Distinct request paths resolve to distinct authored shell states.
4. Canonical interaction-authoring probe
   - Try to express the next interactive step through the canonical public
     primitives.
   - `process.create` and `projection.create` should now succeed through the
     first-party authoring substrate.
   - If `page.surface` still cannot execute the authored canonical interaction
     model, record that runtime consumer gap rather than touching the legacy
     widget-program path.

## Current insight

After `surface.create`, the honest next blocker is not shell serving and it is
not missing semantic authoring. It is the runtime consumer gap for canonical
`surface + process + projection` interaction on `page.surface`.

The replay shows that:

- constrained inspection can state the intended public frontend model directly
- surface trees can now be authored through MCP
- semantic DESIRE processes can now be authored through MCP
- semantic DESIRE projections can now be authored through MCP
- `page.surface` can route between authored shell states live
- generic shell navigation targets can be authored and lowered
- legacy widget-program authoring is quarantined rather than used as fallback
- `page.surface` still reports the canonical interactive pairing as blocked

In other words: the next honest platform gap is no longer authoring. It is the
runtime execution seam for the canonical constrained path.

So the next platform question is not "can we serve a shell?" It is "what is the
first-party runtime path for canonical `surface + process + projection`
interaction semantics on `page.surface`?"

## Anti-patterns this playbook avoids

- jumping straight to the reference app's most complex screen
- widening core runtime code before the authored gap is proven
- creating app-local JS to bridge a missing authoring primitive
- copying reference controller logic and calling it progress
- letting green tests outrun architectural truth
