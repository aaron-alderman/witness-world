# 01 - Foundational Philosophy & Ontology

## Role in Primary Intent

This category grounds every other desire. The platform exists to preserve continuity of agency through witnessed memory rather than state mutation or hidden implementation. The irreducible ontology (Thing, Relation, Process, Witness) provides the single conceptual grammar used everywhere: in the kernel, in projections, in Sourcery, in plugins, and in product language.

See [../PRIMARY-INTENT.md](../PRIMARY-INTENT.md) for the root statement and [../INTENT-TREE.md](../INTENT-TREE.md) for placement.

## Core Desires / Intents

### 1.1 Genesis as the first accepted witness
Everything derives from an initial witnessed act. Authority, ownership, and meaning are inherited through chains of witnessed relations, never intrinsic.

**Formal definition:**
- [../SYSTEM.md](../SYSTEM.md) (Genesis section): "Genesis is the first accepted witness. Everything else derives from Genesis through witnessed chains." Examples include Genesis Block, Initial Commit, Certificate of Incorporation.
- Authority is never primitive: "Authority is inherited from Genesis."

**Enacted in code:**
- [../../src/kernel.js](../../src/kernel.js): `createWorld` emits the genesis witness on a fresh log:
  ```js
  const genesisWitness = makeWitness({
    cause: null,
    process: "genesis",
    actor: "genesis",
    claims: [
      thing("genesis"),
      thing("adam"),
      relation("genesis", "authorizes", "adam"),
      relation("adam", "owns", "adam"),
      ...
    ]
  });
  log.append(genesisWitness);
  ```
- All subsequent worlds are created via `makeWorldFromLog` or `fork()`, always replaying from witnesses.
- `emit` and `observe` always record `cause` (prior witness id).

### 1.2 Irreducible ontology: Thing, Relation, Process, Witness
These four are the primitives. All higher concepts (Soul, Ownership, etc.) are projections or relations over them.

**Formal definition:**
- [../SYSTEM.md](../SYSTEM.md):
  - **Thing**: "A distinguishable entity. ... A Thing is not a property bag. A Thing is a referent."
  - **Relation**: "An association between Things."
  - **Process**: "An attempt to transform reality." "Processes act."
  - **Witness**: "Immutable evidence that a process occurred." "Witnesses are evidence. Witnesses are not truth."

**Enacted in code:**
- [../../src/kernel.js](../../src/kernel.js) re-exports from [../../src/projectors-core.js](../../src/projectors-core.js):
  ```js
  export { thing, relation, retract, projectors } from "./projectors-core.js";
  ```
- `thing(kindOrId)`, `relation(from, type, to)` produce claim objects appended via witnesses.
- Witnesses are the only durable records; projectors derive all views.

### 1.3 Derived concepts are always projections (Soul, Ownership, Stewardship, Authority, Proxy, Perspective, Governance)
No derived concept is stored as primitive truth.

**Formal definition:**
- [../SYSTEM.md](../SYSTEM.md) sections "Soul", "Ownership", "Delegation", "Stewardship", "Authority", "Recognition", "Proxies", "Perspectives", "Governance":
  - Ownership: "A projection over witnessed relations. Ownership is not stored. Ownership is derived."
  - Governance "emerges naturally" from witnessed chains.
  - "Authority is inherited. Authority is never intrinsic."

**Enacted in code:**
- Projection machinery in [../../src/projectors-core.js](../../src/projectors-core.js) and [../../src/desire/projection-eval.js](../../src/desire/projection-eval.js).
- Runtime governance and authority resolution in [../../src/runtime-governance.js](../../src/runtime-governance.js) and [../../src/runtime-authz.js](../../src/runtime-authz.js).
- Identity-to-actor mapping and assumption grants are explicit (see category 06).
- No code path stores "ownership" or "authority level" as a scalar on an object; all are computed from witness history + current relations.

### 1.4 Humans reason through observations/memory/intent/consequences; the system preserves evidence, not judgement
**Formal definition:**
- [../SYSTEM.md](../SYSTEM.md) Philosophy section: "The system therefore preserves evidence rather than judgement. The system remembers. Humans interpret."

**Enacted:**
- Witness log is append-only (see category 02).
- No "trust score", "reputation", or final judgement tables exist in the model.
- Sourcery (category 08) is explicitly "guides. It does not steer."

### 1.5 Anti-goal: never become a social credit / objective virtue system
Explicitly called out to prevent misuse of the witnessed record.

**Formal definition:**
- [../SYSTEM.md](../SYSTEM.md): "The system must never become a social credit system." Lists what the system records vs. does not record.

## Cross-links
- Directly enables: 02 (Witness Substrate), 06 (Authority/Governance), 07 (Process execution).
- Reflected in honesty vocabulary across [../CAPABILITIES.md](../CAPABILITIES.md) ("projection", "real but narrow", never "fake").
- The ontology is the required mental model for authoring in DESIRE (category 03) and all plugin development.

## Current Status & Honesty Notes
- Ontology is present as conceptual ground and enacted in the witness/claim model.
- "More consistent use of the ontology in product language and editing surfaces" is still listed as missing in [../CAPABILITIES.md](../CAPABILITIES.md#1.2).
- Code uses `thing`/`relation` claims heavily in kernel and projectors; product surfaces increasingly expose "witnesses" and "relations" in inspectors.

## Related Files
- Definition: [../SYSTEM.md](../SYSTEM.md)
- Capability inventory of this layer: [../CAPABILITIES.md](../CAPABILITIES.md#1-world-truth-and-witness-substrate) and [../CAPABILITIES.md](../CAPABILITIES.md#4-identity-context-and-authority)
- Kernel entry: [../../src/kernel.js](../../src/kernel.js)
- Projectors (truth projection): [../../src/projectors-core.js](../../src/projectors-core.js)
