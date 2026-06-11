# The Witness-Oriented System

## Purpose

This document defines the philosophical, ontological, architectural, and product foundations of a witness-oriented software system.

The goal is not to build a better programming language, database, workflow engine, or collaboration tool.

The goal is to build a system that preserves continuity of agency through witnessed memory.

---

# 1. Philosophy

Most software systems are built around state.

Humans are not.

Humans reason through:

* observations
* memory
* intent
* consequences
* inheritance
* trust
* challenge
* continuity

The system therefore preserves evidence rather than judgement.

The system remembers.

Humans interpret.

---

## Anti-Goal

The system must never become a social credit system.

The system records:

* what happened
* who claimed what
* who witnessed what
* what followed

The system does not record:

* objective virtue
* moral worth
* canonical trust scores
* final judgement

Trust is always derived.

Trust is never stored.

---

# 2. Boundary Condition

All systems eventually require an axiom.

The axiom is:

## Genesis

Genesis is the first accepted witness.

Everything else derives from Genesis through witnessed chains.

Examples:

* Genesis Block
* Initial Commit
* Certificate of Incorporation
* Adam

Authority is not primitive.

Authority is inherited from Genesis.

---

# 3. Ontological Ground

The current irreducible ontology is:

## Thing

A distinguishable entity.

Examples:

* Aaron
* Callan
* Sourcery
* Widget
* Compiler
* Proposal

A Thing is not a property bag.

A Thing is a referent.

---

## Relation

An association between Things.

Examples:

* owns
* delegates
* references
* proxies
* createdBy

Meaning emerges through relations.

---

## Process

An attempt to transform reality.

Examples:

* Compile
* TransferOwnership
* Vote
* Clone
* Render
* Deploy

Processes act.

---

## Witness

Immutable evidence that a process occurred.

Examples:

* Created
* Accepted
* Rejected
* Failed
* Succeeded
* Observed

Witnesses are evidence.

Witnesses are not truth.

---

# 4. Derived Concepts

Everything below derives from the ontology.

---

## Soul

A continuity projection.

A soul is a thing viewed through its witnessed persistence.

A soul may:

* be born
* change
* fork
* handoff
* die
* be remembered

A soul is not an ID.

IDs are representations of souls.

---

## Ownership

A projection over witnessed relations.

Ownership is not stored.

Ownership is derived.

---

## Delegation

A witnessed relation.

Delegation transfers agency without transferring ownership.

---

## Stewardship

A projection over witnessed delegations.

Stewardship is how organizations actually operate.

---

## Authority

A projection over:

* Genesis
* Ownership
* Delegation
* Witness history

Authority is inherited.

Authority is never intrinsic.

---

# 5. Recognition

Creation and discovery are not sufficient.

A third concept exists:

## Recognition

A thing enters the witnessed universe.

Examples:

* Import CRM Customer
* Discover Device
* Create Digital Twin
* Link External Asset

Recognition is often more fundamental than creation.

---

# 6. Proxies

A proxy is a thing representing another thing.

Examples:

* Digital Twin
* CRM Customer
* Git Branch
* Pull Request
* Local Cache
* Perspective Object

A proxy exists because the represented thing is not owned or directly mutable.

Example:

Actual Human
← CRM Customer
← Sourcery Customer
← Frontend Customer View

Each layer is a proxy.

---

# 7. Perspectives

A perspective is a bounded view of reality.

A perspective is not reality.

A perspective is:

* observer
* scope
* representation
* stewardship context

Examples:

* Aaron Personal
* Frontend Team
* Incident Investigation
* Customer View

Multiple perspectives may coexist.

---

# 8. Personal Views

Nothing view-specific belongs on the represented thing.

Example:

Wrong:

Callan.position = (100,200)

Correct:

AaronViewCallanProxy.position = (100,200)

The position is a fact about the view.

Not a fact about Callan.

---

# 9. Governance

Governance emerges naturally.

Example:

Aaron creates Sourcery.

Aaron creates Widget W.

Aaron proposes incorporation.

Aaron votes.

Ownership transfers to Sourcery.

Callan creates W'.

Callan proposes W'.

Aaron delegates stewardship of Frontend to Callan.

Callan accepts W'.

No permissions table is required.

Governance emerges from witnessed chains.

---

# 10. Intent

Intent is not observable.

Intent may only be claimed.

The system stores:

Claimed Intent

not:

True Intent

Intent remains challengeable.

---

# 11. Trust

Trust is a projection.

Trust derives from:

* witnesses
* outcomes
* intent claims

Trust is never canonical.

Trust is always contextual.

---

# 12. Processes and Gates

A process may be attempted.

A process may fail before execution.

A gate is a process whose witness determines whether another process may proceed.

Examples:

* Type Validation
* Stewardship Check
* Deployment Approval
* Ownership Verification

Gates are processes.

Not a separate mechanism.

---

# 13. Witnesses

Witnesses are the central storage primitive.

A witness records:

* process
* participants
* context
* outcome

Witnesses are immutable.

Witnesses preserve causality.

Witnesses preserve provenance.

Witnesses preserve continuity.

---

# 14. State

State is not primitive.

State is:

Projection(Witnesses)

Current ownership.

Current value.

Current authority.

Current UI.

All are projections.

---

# 15. User Interface

The UI is a projection.

The canvas is a projection.

The inspector is a projection.

Nothing visible is reality.

Everything visible is interpretation.

---

# 16. LLMs

LLMs are processes.

LLMs operate within perspectives.

LLMs do not access reality.

LLMs access projections.

LLMs generate witnesses.

LLMs may propose.

LLMs do not possess authority.

---

# 17. Optimization Function

Maximize:

* continuity
* learning
* composability
* agency
* observability
* inheritance of knowledge

Minimize:

* surveillance
* dogma
* false certainty
* context switching
* manual coordination

---

# 18. Core Law

Processes create witnesses.

Witnesses are immutable.

Relations connect things.

Projections derive meaning.

Authority derives from witnessed chains back to Genesis.

Everything else is composition.

---

# 19. Product Direction

The system is not only a runtime architecture. It is also aiming at a coherent product experience.

The intended product shape is:

* one world model
* many expression surfaces
* truthful inspection
* guided but non-coercive composition

This has several consequences.

## Sourcery

Sourcery should be understood as a process/context companion, not as a second hidden system.

It may:

* explain
* suggest
* prefill
* reveal
* step back

It must not:

* hide real modeled structure
* mutate the world through secret backdoors
* replace the actual authoring surfaces with a fake simplified one

## Plugins and Capabilities

Capabilities should become first-class expressed structures in the world.

A capability should remain inspectable as:

* public API
* configuration surface
* internals
* context boundary
* authority requirements

The system should avoid the black-box pattern where user intent results in hidden runtime structures that are not represented in the world.

## Context

Context is not mere presentation metadata.

Context is how the system should eventually bound:

* names
* composition
* authority
* stewardship
* perspective-local meaning

## Shells

Desktop, browser, and hosted/server operation should be treated as shell adapters over the same world model rather than separate products with incompatible truths.

The desktop shell proves ownership.
The web shell proves reachability.
The shared world model proves coherence.
