# Intent Documentation

This directory holds the canonical representation of the platform's desires and intents.

It bridges:

- Stated product and architectural desires (documentation)
- Implemented mechanisms (code)

All entries link to source documentation and implementation using relative Markdown links.

See:

- [PRIMARY-INTENT.md](./PRIMARY-INTENT.md) — Executive summary and root node.
- [CATEGORIZED-LIST.md](./CATEGORIZED-LIST.md) — Raw list followed by categorized grouping.
- [INTENT-TREE.md](./INTENT-TREE.md) — Hierarchical tree with the primary intent at the root.

## The 12 Category Deep-Dives

One file per top-level branch of the intent tree. Each contains formal definitions, specific enacted implementations (code paths, data structures, plugins), honesty notes, and cross-links.

1. [01-foundational-philosophy-ontology.md](./01-foundational-philosophy-ontology.md)
2. [02-witness-substrate-projections.md](./02-witness-substrate-projections.md)
3. [03-semantic-authoring-kernel.md](./03-semantic-authoring-kernel.md)
4. [04-composition-primitives-authoring.md](./04-composition-primitives-authoring.md)
5. [05-capabilities-plugins-extensibility.md](./05-capabilities-plugins-extensibility.md)
6. [06-identity-context-authority-governance.md](./06-identity-context-authority-governance.md)
7. [07-runtime-execution-processes-inspection.md](./07-runtime-execution-processes-inspection.md)
8. [08-product-experience-guidance-academy.md](./08-product-experience-guidance-academy.md)
9. [09-surfaces-editing-grammar.md](./09-surfaces-editing-grammar.md)
10. [10-shells-persistence-ecosystem.md](./10-shells-persistence-ecosystem.md)
11. [11-platform-self-modeling-verification-knowledge.md](./11-platform-self-modeling-verification-knowledge.md)
12. [12-backend-external-integration-seams.md](./12-backend-external-integration-seams.md)

The work draws from:

- [../README.md](../README.md)
- [../SYSTEM.md](../SYSTEM.md)
- [../EXPERIENCE.md](../EXPERIENCE.md)
- [../CAPABILITIES.md](../CAPABILITIES.md)
- [../DESIRE.md](../DESIRE.md)
- [../DESIRE-SPA.md](../DESIRE-SPA.md)
- [../INTENT-REGISTRY-ROADMAP.md](../INTENT-REGISTRY-ROADMAP.md)
- [../CONTEXTHUB-SPEC.md](../CONTEXTHUB-SPEC.md)
- [../FIRST-5-MINUTES.md](../FIRST-5-MINUTES.md)
- [../PLATFORM-ALL-THE-WAY-ROADMAP.md](../PLATFORM-ALL-THE-WAY-ROADMAP.md)
- And implementation under [../../src/](../../src/) (especially `desire/`, `witness-log.js`, runtime files) and [../../plugins/](../../plugins/).

## Modeled Form (WTOML)

For ContextHub to become real, the doc/document and doc/code relationships are expressed declaratively rather than only as markdown links or hardcoded JS:

- [knowledge-relations.wtoml](./knowledge-relations.wtoml)

This file uses [[entity]] for `docNode`s and code locations, plus [[relation]] using typed links (`references`, `expands`, `explains`, `isRealizedBy`, `implements`, etc.) that can lower into the DESIRE model and be projected by ContextHub surfaces.

The platform model (plugins/platform/platform-model.js) now parses this WTOML at build time, adds nodes/edges, and augments doc.references with authoredDocLinks / authoredCodeLinks. The knowledge view surfaces them via the related cards.
