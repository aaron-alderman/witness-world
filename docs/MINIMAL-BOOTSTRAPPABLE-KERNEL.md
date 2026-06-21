# Minimal Bootstrappable Kernel

## Purpose

This document defines the smallest honest kernel from which the rest of the system could, in theory, be built.

It is not a browser app.
It is not `/world`.
It is not `inspect`.
It is not `operator-workbench`.
It is not even the full authored semantic surface.

It is the minimum substrate that can:

1. preserve durable truth,
2. derive current world state,
3. execute governed behavior,
4. cross into host effects through explicit boundaries, and
5. keep source provenance attached so the system can rebuild itself.

If this kernel exists, everything else can be layered above it.

## Design Rule

The kernel must be small enough that:

- all durable meaning fits in one append-only truth model,
- all higher views are projections,
- all behavior is replayable,
- all side effects cross named capability boundaries,
- all authored material can point back to source,
- no product UI is required for the kernel to function.

## The Six Irreducible Parts

### 1. Append-only witness log

The system of record is a single append-only stream of witnessed events.

The kernel never mutates durable truth in place.
Every "change" is another witness appended to the log.

This is the only canonical truth store.

### 2. Stable identities and claims

The kernel needs stable ids and a minimal claim language so witnesses can say:

- this thing exists,
- this thing relates to that thing,
- this thing has this value,
- this thing was retired or superseded.

Without this, there is no durable world model, only opaque event text.

### 3. Deterministic projection

Given the witness log, the kernel must be able to deterministically derive:

- current entities,
- current relations,
- current values,
- higher read models built from those primitives.

Projection is how "current state" exists without violating append-only truth.

### 4. Process interpreter

The kernel needs one generic behavior engine that:

- accepts an input message,
- reads projected state,
- emits new witnesses,
- requests named effects.

This is the seed of all workflow, automation, interaction, and system evolution.

### 5. Capability boundary

The kernel must not perform arbitrary host mutation directly.

All non-pure work crosses a named capability boundary, for example:

- `fs.read`
- `fs.write`
- `http.serve`
- `http.fetch`
- `process.spawn`
- `clock.now`

This keeps the kernel replayable and makes effects governable.

### 6. Source provenance

Every durable definition and every meaningful derived object must be able to point back to authored source.

Without provenance, the kernel may run a world, but it cannot support real rebuilding, debugging, editing, or self-hosting.

## What Is Explicitly Not In The Kernel

The following are downstream systems, not kernel requirements:

- browser pages
- `/world` and `/process`
- inspector UI
- command palettes
- package-manager UI
- operator shell UI
- tutorials
- route rendering
- DOM trees
- CSS
- app-specific schemas
- plugin installation UX

Those may be important products, but they are not kernel-essential.

## Exact Minimal Data Model

The following shapes are the smallest practical kernel contract.

### Witness record

```js
type WitnessRecord = {
  id: string,
  ts: string,
  actor: string,
  process: string,
  cause?: string | null,
  body: Record<string, unknown>,
  claims: Claim[]
}
```

Rules:

- `id` is stable and unique.
- `ts` is append time, not mutable object state.
- `actor` is who or what emitted the witness.
- `process` is the behavior or system path that emitted it.
- `cause` links causal chains without mutating prior rows.
- `body` is process-local detail.
- `claims` carry the durable world meaning.

### Claim language

```js
type Claim =
  | { op: "thing", id: string, kind?: string | null }
  | { op: "relation", from: string, rel: string, to: string, meta?: Record<string, unknown> }
  | { op: "value", target: string, key: string, value: Value }
  | { op: "retire", target: string, reason?: string | null }
```

### Value language

```js
type Value =
  | { type: "string", value: string }
  | { type: "number", value: number }
  | { type: "boolean", value: boolean }
  | { type: "json", value: unknown }
  | { type: "ref", target: string }
  | { type: "null", value: null }
```

This is intentionally small.
More elaborate authored semantics can lower into this.

## Minimal Projection Contract

The kernel projector must expose at least these deterministic views:

```js
type KernelProjection = {
  things: Map<string, ThingState>,
  relations: RelationState[],
  values: Map<string, Map<string, Value>>,
  retired: Set<string>
}
```

Where:

```js
type ThingState = {
  id: string,
  kind?: string | null,
  lastWitnessId: string
}

type RelationState = {
  from: string,
  rel: string,
  to: string,
  meta: Record<string, unknown>,
  witnessId: string
}
```

Higher projections such as:

- world graph,
- process view,
- source view,
- operator snapshot,
- package inventory,
- capability matrix

must be derived from this substrate plus explicit higher-level conventions.

## Minimal Process Contract

The kernel behavior engine only needs one generic shape:

```js
type ProcessInput = {
  process: string,
  actor: string,
  message: string,
  body?: Record<string, unknown>
}

type ProcessResult = {
  emit: WitnessDraft[],
  effects: EffectRequest[]
}
```

Where:

```js
type WitnessDraft = {
  actor: string,
  process: string,
  body: Record<string, unknown>,
  claims: Claim[],
  cause?: string | null
}

type EffectRequest = {
  capability: string,
  action: string,
  input: Record<string, unknown>,
  correlationId?: string
}
```

Process rules:

1. A process reads only projected state plus explicit input.
2. A process returns witnesses and requested effects.
3. A process does not directly mutate host state.
4. Effect outcomes re-enter the system as new witnesses.

That last rule matters.
It means the world stays append-only even when real host work happens.

## Minimal Capability Contract

Capabilities are explicit host functions registered outside the pure kernel:

```js
type CapabilityHandler = (input: {
  action: string,
  payload: Record<string, unknown>,
  actor: string
}) => Promise<{
  ok: boolean,
  output?: Record<string, unknown>,
  error?: string
}>
```

The kernel only knows:

- capability id,
- requested action,
- input payload,
- returned outcome witness.

The kernel does not need to know implementation details.

## Minimal Provenance Contract

Every durable definition should be annotatable with source metadata:

```js
type SourceProvenance = {
  target: string,
  file: string,
  sourceKind: string,
  startLine?: number | null,
  endLine?: number | null,
  originNodeId?: string | null
}
```

Provenance is not just a debug nice-to-have.
It is required for:

- rebuilding authored truth,
- explaining why an object exists,
- self-hosted editing,
- package revisioning,
- operator navigation from runtime state to source.

## Minimal Boot Sequence

The smallest boot sequence is:

1. Open the witness log.
2. If the log is empty, append a genesis witness.
3. Register builtin capabilities.
4. Replay the witness log into the base projection.
5. Register builtin process handlers.
6. Accept process messages and effect completions.
7. Expose projections to higher layers.

The genesis witness should establish only the minimum anchors:

- `system`
- `kernel`
- builtin capability identities
- builtin process identities

Everything else should be authored or witnessed above that.

## Theoretical Closure Proof

To say "all downstream could be built from this" we need to show how.

### Identity and authority

Build as:

- things for identities, sessions, grants, perspectives
- processes for sign-in, sign-out, grant, revoke
- capabilities for secret verification or token persistence

No special kernel primitive is required.

### Packages and revisions

Build as:

- things for packages, revisions, files, dependencies
- provenance links to source
- processes for publish, activate, rollback
- capabilities for filesystem or object storage

No special kernel primitive is required.

### Surfaces and routes

Build as:

- things and values describing semantic surfaces
- things and values describing routes and handlers
- projections that lower semantic surfaces into host renderers
- capabilities for HTTP or desktop display

No browser-specific kernel primitive is required.

### Operator control plane

Build as:

- process messages like `operator.command`
- projections like `operator.snapshot`
- capabilities for persistence, shell, file IO, runtime activation

No operator UI primitive is required in the kernel.

### Editors and inspectors

Build as:

- projections over source provenance, packages, witnesses, entities, and process history
- surface definitions rendered by a host
- edit processes that append new witnesses rather than mutating hidden state

No inspect-specific kernel primitive is required.

## First Five Layers Above The Kernel

If building upward from scratch, the first five layers should be:

### Layer 1. Authority and identity

Add:

- identities
- sessions
- grants
- actor resolution

Why first:

Without authority, the rest of the system has no governable mutation path.

### Layer 2. Authored source and package layer

Add:

- source files
- provenance witnesses
- packages
- revisions
- publish and rollback flows

Why second:

This is what makes the world rebuildable instead of one-off.

### Layer 3. Semantic runtime layer

Add:

- message definitions
- process definitions
- boundaries
- policies
- higher projections

Why third:

This is where general authored behavior becomes portable and composable.

### Layer 4. Surface and route layer

Add:

- semantic surfaces
- route declarations
- renderer lowering
- operator API endpoints

Why fourth:

Only after durable truth, authority, and behavior are stable should you project product surfaces.

### Layer 5. Operator shell and self-hosting tools

Add:

- operator snapshot
- command execution
- source browser
- witness explorer
- process explorer
- package activation tools

Why fifth:

This is the first point where the system can begin to build and repair itself from inside itself.

## Smallest Practical Module Split

An implementation should be able to fit into these modules:

- `witness-log`
- `claims`
- `projector`
- `process-runtime`
- `capability-host`
- `provenance`
- `boot`

Everything else should be outside this set unless proven kernel-essential.

## Hard Constraints

To keep the kernel honest:

1. No hidden mutable canonical store beside the witness log.
2. No direct host mutation from process logic.
3. No renderer-specific surface semantics in the kernel.
4. No routes, URLs, DOM tags, or CSS as kernel truth.
5. No app-specific concepts promoted into kernel status unless they are proven universal.
6. No loss of provenance when authored material lowers into executable form.

## Practical Reading For This Repo

In current repo terms, this kernel is narrower than the full current authored/runtime stack.

It corresponds most closely to:

- witness log and world substrate,
- deterministic projections,
- generic process execution,
- explicit capability boundaries,
- source provenance,
- append-only truth as the only durable authority.

It does **not** imply that current browser-era inspect surfaces belong in the kernel.

## Final Test

The kernel is small enough if this question has a clean answer:

> If every UI, route table, operator shell, and product app disappeared, could the system still preserve truth, replay itself, explain itself, and rebuild higher layers from witnessed authored source?

If yes, the kernel is small enough.
If no, product concerns are still trapped in the substrate.
