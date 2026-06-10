# Witness-Oriented Canvas System Specification v2

## Purpose

This specification redefines the diagram canvas/editor around the Witness-Oriented System model.

The canvas is not the system.

The canvas is a projection.

Objects on the canvas are not primary records.

They are visual representations of Things, Relations, Processes, Witnesses, and Projections.

---

# Core Principle

The previous specification was organized around:

- Shapes
- Connectors
- Layers
- Pages

This specification is organized around:

- Things
- Relations
- Processes
- Witnesses

Everything else is a projection.

---

# Primary Ontology

## Thing

A Thing is a referent.

Examples:

- Person
- Organization
- Project
- Asset
- Proposal
- Device
- Component

Things possess identity.

Things do not possess view-specific state.

---

## Relation

Relations connect Things.

Examples:

- owns
- delegates
- createdBy
- references
- memberOf

Relations are first-class.

---

## Process

Processes attempt to transform reality.

Examples:

- Create
- Accept
- Reject
- Transfer
- Deploy
- Render
- Merge

Processes create witnesses.

---

## Witness

Witnesses are immutable records of observation.

Witnesses record:

- process
- participants
- context
- outcome

Witnesses are the primary persistence primitive.

---

# State Model

State is never stored directly.

State is derived.

Examples:

- Current ownership
- Current authority
- Current stewardship
- Current status
- Current visual layout

All are projections over witness history.

---

# Projection Layer

The editor primarily manipulates projections.

The projection layer is responsible for:

- Layout
- Positioning
- Visibility
- Grouping
- Styling
- Filtering
- Perspective-specific organization

These are not properties of Things.

These belong to Perspectives.

---

# Perspectives

A Perspective is a bounded interpretation of reality.

Examples:

- Personal Workspace
- Team Workspace
- Incident Investigation
- Customer View

A Perspective owns:

- Layouts
- Layer visibility
- Camera position
- Selection state
- Visual grouping
- Presentation structure

---

# Canvas Model

The canvas is a projection engine.

The canvas displays:

- Things
- Relations
- Processes
- Witnesses

through a Perspective.

The canvas itself does not contain truth.

---

# Visual Nodes

Visual nodes are proxies.

Example:

Thing
-> Visual Node

A Thing may appear multiple times.

Each appearance is a Projection Instance.

Example:

Customer
    -> Sales View
    -> Support View
    -> Architecture View

All represent the same Thing.

---

# Connectors

Connectors represent Relations.

Connectors should not merely be drawing primitives.

Connector types:

- Ownership
- Delegation
- Reference
- Membership
- Dependency
- Custom relation

Connectors should be backed by actual Relation records.

---

# Witness Timeline

Timeline becomes a first-class system concept.

Not merely animation.

Timeline should display:

- Witnesses
- Processes
- Delegations
- Ownership transitions
- Recognition events

Animation later becomes a projection of witness history.

---

# Animation Architecture

Animation is reinterpreted.

Traditional animation:

Object moves.

Witness-oriented animation:

State transitions become observable through witness playback.

Animation system should support:

- Scrubbing
- Replay
- Time travel
- Event visualization
- Process playback

---

# PowerPoint Reframed

Slides become Perspectives.

Presentation becomes a curated sequence of Perspectives.

A slide deck is:

Perspective Sequence

not

Collection of Drawings

---

# Layers Reframed

Layers become Perspective organization tools.

Layer membership is not a property of a Thing.

Layer membership belongs to a Perspective.

---

# Property Inspector

The inspector should distinguish:

## Thing Properties

Reality-oriented.

Examples:

- Name
- Type
- Metadata

## Projection Properties

Perspective-oriented.

Examples:

- Position
- Color
- Layer
- Visibility

---

# RAD System Direction

The system should adopt the strongest ideas from:

- VB6
- Delphi
- Flash
- Excel
- PowerPoint

Specifically:

- Property inspector
- Object explorer
- Event system
- Visual authoring
- Timeline
- Components
- Rapid composition

---

# Event Model

Events are Process Attempts.

Events generate Witnesses.

Example:

Button Click
    -> Process
    -> Witness

The event system should therefore integrate naturally with the witness model.

---

# Scripting

Scripts are Processes.

Scripts do not mutate state directly.

Scripts propose actions.

Actions create Processes.

Processes generate Witnesses.

---

# Serialization

Everything must serialize.

Including:

- Things
- Relations
- Processes
- Witnesses
- Perspectives
- Layouts
- Timelines
- Scripts

The serialization format becomes the canonical system memory.

---

# Undo / Redo

Undo and Redo should be implemented as witness-aware commands.

Rather than:

Apply Change
Undo Change

The preferred model is:

Witness Action
Replay Projection

This preserves continuity and provenance.

---

# Long-Term Vision

The editor evolves from:

Diagram Tool

to:

Witness-Oriented Reality Modeling Environment

The canvas is merely one projection.

Other future projections may include:

- Timeline View
- Governance View
- Organization View
- Process View
- Stewardship View
- Authority View
- Narrative View

All derive from the same underlying witness graph.
