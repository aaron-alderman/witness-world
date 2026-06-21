# Operator Platform Spec

Status date: `2026-06-21`

This document is the platform contract for the operator product.

It is written to be usable without source-code access.

It answers:

- what the platform is
- what capabilities it provides
- how products are expected to use it
- what patterns are forbidden

This is not the operator product spec. It is the specification for the platform the operator must sit on top of.

---

## 1. Platform Purpose

The platform exists to let products be authored, served, governed, and evolved without each product inventing its own runtime substrate.

For the operator product, that means:

- the platform owns the write lane
- the platform owns the route host
- the platform owns governance and proposal fallback
- the platform owns the canonical frontend semantic model
- the platform owns the interactive surface runtime substrate

The operator is expected to be a product on top of that platform, not a second platform beside it.

---

## 2. Core Platform Model

The platform's constrained public frontend model is:

- `surface`
- `collection`
- `process`
- `projection`
- `message`
- `boundary`
- `policy`
- `capability`

These are the canonical nouns products are expected to use when expressing frontend/runtime behavior.

The important consequence is:

- products should be expressed in these nouns first
- host-specific UI concepts should not become the primary semantic language

---

## 3. Authoring Model

The platform supports an MCP-governed authoring lane.

### 3.1 Canonical write lane

The canonical mutation lane is:

- MCP calls
- platform-authorized handlers
- authored semantic changes
- proposal fallback when direct authority is unavailable

Products should assume:

- mutation happens through MCP-authoring flows
- direct ad hoc source editing is not the product-authoring lane
- write operations may be blocked and returned as structured governance/proposal work

### 3.2 Read lane

The canonical read lane is:

- `world.read`
- route-served authored output
- shared runtime state / process-owned state

### 3.3 Authoring mode

In constrained mode:

- direct fallback mutation is forbidden
- blocked means stop and surface the blocked handoff
- the system must not quietly invent a second mutation lane

---

## 4. Serving Model

The canonical app-serving host is `page.surface`.

Products are expected to be served through authored `page.surface` routes.

`page.surface` is responsible for:

- route-served authored output
- root surface mounting
- route-selected alternate surface output
- route/state synchronization
- same-document surface refresh after route-state changes
- delivery of the runtime manifest/bootstrap payload needed by the interactive surface runtime

Products are not expected to invent their own parallel page host.

---

## 5. Governance Model

The platform assumes that not all actors have direct authority to mutate everything.

Therefore it supports:

- direct mutation where authority exists
- proposal fallback where authority does not exist
- structured blocked handoff where the platform lacks a primitive or policy blocks the action

The intended product behavior is:

- try the canonical lane
- if allowed, mutate
- if not allowed, return a governed proposal path
- if impossible, return a blocked handoff

The intended product behavior is not:

- fail and silently mutate somewhere else
- bypass policy because a browser/Electron runtime can reach the filesystem

---

## 6. Runtime Model

The platform already includes an interactive runtime substrate for authored surfaces.

That substrate covers:

- runtime manifest emission
- interactive route/surface execution
- process-owned interactive state
- reconcile/execution/dom-host layering
- route-local runtime transport
- runtime honesty/diagnostic support

This means products do not need to invent:

- their own route interaction runtime
- their own browser-only state authority
- their own hidden shell controller just to make authored surfaces interactive

---

## 7. What The Platform Guarantees

If a product stays inside the platform contract, it can assume:

### 7.1 Stable authoring lane

- there is one sanctioned mutation lane
- sanctioned product mutations can be expressed as authored semantic changes

### 7.2 Stable serving lane

- there is one sanctioned app/document route host
- authored app output can be served through that host

### 7.3 Stable governance behavior

- insufficient authority does not require product-specific hacks
- proposal fallback is part of the platform model

### 7.4 Stable runtime ownership split

- product semantics are not supposed to live in browser/Electron host code
- host code is expected to remain a renderer/input adapter over shared runtime behavior

### 7.5 Stable honesty discipline

- hidden platform limitations should be surfaced, not patched over locally

---

## 8. What The Platform Does Not Promise

The platform does not promise:

- that every desired product concept already has a first-class primitive
- that arbitrary legacy browser behavior is supported
- that products may bypass authoring/governance because the runtime is local
- that host-specific UI structure is a valid semantic foundation

When a required primitive is missing, the correct response is:

- identify the missing primitive precisely
- stop improvising
- add the primitive through the platform lane

---

## 9. How Products Are Supposed To Use The Platform

### 9.1 Start with the platform model

When designing a product concept, ask:

1. can this be expressed in the platform nouns?
2. can this be authored through MCP?
3. can this be served through `page.surface`?
4. can the runtime state be owned by `process`/shared runtime state rather than host-local code?

If the answer is "no", the missing primitive must be named explicitly.

### 9.2 Treat hosts as hosts

Products may have:

- browser hosts
- Electron hosts
- shell/cell hosts later

But those hosts are expected to own only:

- input capture
- rendering
- windowing/platform integration
- clipboard/IME/accessibility integration

They are not supposed to own product semantics.

### 9.3 Treat serialization as secondary

Products may use:

- RVM
- WTOML
- other authored forms the platform supports

But serialization is not semantic authority.

The authored model is the authority.

### 9.4 Use governance honestly

Do not:

- create shadow write paths
- patch local files directly as a product authoring workflow
- use host-only mutations to avoid proposal flow

Do:

- route mutations through sanctioned MCP-authoring flows
- accept proposal fallback as part of the product experience where authority requires it

---

## 10. What To Avoid

The following are platform violations or strong platform anti-patterns:

- inventing a second mutation lane beside MCP authoring
- inventing a second app-serving lane beside `page.surface`
- placing product semantics in browser/Electron runtime code
- filling missing model structure with runtime defaults or fallback guesses
- using host-local repair logic to compensate for missing semantic primitives
- letting product-specific shell concepts become the semantic foundation
- treating blocked platform gaps as permission to improvise

---

## 11. Operator-Specific Implications

For the operator product specifically:

- the operator should be authored as a product over the platform
- the operator should use the existing MCP-governed lane
- the operator should be served through authored `page.surface`
- the operator should use the existing frontend semantic model as far as possible
- operator-specific work should mostly be product modeling, not platform reinvention

This means:

- the operator does not need a new write lane
- the operator does not need a new route host
- the operator does not need a second browser runtime substrate
- the operator does not need a second governance story

The operator only needs additional platform work when a real primitive is missing.

---

## 12. Practical Decision Rule

When someone proposes a new operator capability, classify it first:

### 12.1 Product work

It is product work if it is:

- a new semantic object
- a new product-specific relation
- a new product-specific action
- a new presentation arrangement
- a new operator-specific trait/substitution rule

### 12.2 Platform work

It is platform work if the product cannot proceed because the platform lacks:

- a required semantic noun
- a required authoring action
- a required governance path
- a required runtime primitive
- a required `page.surface` behavior that belongs to the shared platform rather than one product

If it is not clearly platform work, it should remain product work.

---

## 13. Summary

The platform already provides:

- a canonical mutation lane
- a canonical serving lane
- a governance model
- a canonical frontend semantic model
- a shared interactive runtime substrate
- an honesty discipline for blocked semantics

Products are expected to use those things directly.

The operator should consume this platform.

It should not build another one.

---

## Appendix A: Existing Proof Sources

These are useful implementation references and proof artifacts, but they are not required to understand the contract above:

- [DESIRE-SPA.md](C:\Users\aaron\Documents\world\docs\DESIRE-SPA.md)
- [RUNTIME-STACK-MAP.md](C:\Users\aaron\Documents\world\docs\RUNTIME-STACK-MAP.md)
- [runtime-authoring-policy.js](C:\Users\aaron\Documents\world\src\runtime-authoring-policy.js)
- [engentus-authoring-pathway.test.js](C:\Users\aaron\Documents\world\test\engentus-authoring-pathway.test.js)
- [mcp-authoring-replay-probe.mjs](C:\Users\aaron\Documents\world\scripts\mcp-authoring-replay-probe.mjs)
- [examples/engentus/app.wtoml](C:\Users\aaron\Documents\world\examples\engentus\app.wtoml)
