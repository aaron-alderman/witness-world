# 08 - Product Experience, Guidance & Academy

## Role in Primary Intent

The first contact must be a genuinely useful, attractive app (not a meta environment). Discovery of the deeper world, authorship, and stewardship happens through physical/spatial reveal and guided practice over real state. Sourcery / Academy is a truthful companion layer that never invents a fake simpler world or becomes mandatory.

See [../EXPERIENCE.md](../EXPERIENCE.md), [../FIRST-5-MINUTES.md](../FIRST-5-MINUTES.md), [../ACADEMY.md](../ACADEMY.md).

## Core Desires / Intents

### 8.1 Attractive real Todo facade as minute-0 landing ("this might just be the product")
- Starts with one seeded task: "be a sourcerer"
- Calm, tactile, finished-looking
- Sourcery present but quiet

**Enacted:**
- Demo app served at `/` via the maintained demo world + plugin composition.
- Seeding in [../../plugins/starter/](../../plugins/starter/) and demo todo runtime.
- [../../plugins/demo/](../../plugins/demo/) (todo-runtime.js, private-notes-runtime.js)

### 8.2 Physical / spatial reveal ("use the mouse wheel to zoom out") instead of wizard overlay
From the first pullback the user discovers that the app is one surface in a larger world (World Graph, Process View, Canvas, Edit Page, etc.).

**Enacted in current Eden + live surfaces:**
- Eden canvas hosts the spatial neighborhood: [../../plugins/eden/](../../plugins/eden/)
- Reveal flows, action chips, and locked gates in eden-stage, eden-surface, eden-view-runtime, etc.
- Prompt and chapter logic driven from tutorial progress.

### 8.3 Bounded first agency before broad stewardship (Personal Box model)
User receives a small owned area where they can add/edit/delete widgets, restyle, etc. before earning rights to edit shared/canonical surfaces.

**Enacted:**
- eden-personal-box, eden-personal-client
- Capability gates that unlock from practiced work (see eden-academy, eden-chapter-client)
- "Claim Your Room", "Restyle The Page" etc. complete from actual witnessed actions.

### 8.4 Sourcery as optional truthful companion (never steers, never mandatory)
**Defined in EXPERIENCE:**
- "Sourcery guides. It does not steer."
- Always available, never mandatory, aware of page/section/widget scope, can be disabled per page, restart-from-here replays guidance from real tutorial state.
- Explains only what has actually appeared.

**Enacted:**
- Large body of guidance runtime: [../../src/runtime-guidance-*.js](../../src/) (bootstrap, client, companion, overlay, progress, scope-inventory, suggestions, etc.)
- [../../plugins/tutorial/](../../plugins/tutorial/)
- Eden academy + theory + chapter client
- Persisted tutorial progress used for recovery commands (projection-backed, not fake registry)
- F1 command surface + whoami expert path

### 8.5 Academy / quests driven from real witnessed practice and persisted progress
Quests, responsibility bands, teach-back, repeated practice consequences are backed by actual work (context creation, proposal approval, widget edits, etc.).

**Enacted:**
- eden-academy.js, eden-theory.js, eden-organization, eden-versions, etc.
- Chapter rail and progression read from witnessed tutorial state + real mutations.

### 8.6 Named capability gates (visible before unlocked)
Powers are shown early; actual use requires demonstrated practice.

## Implementation Map (Selected)

- Todo facade + demo: plugins/demo/* + plugins/starter/*
- Spatial neighborhood & first agency: plugins/eden/* (many files)
- Guidance system: src/runtime-guidance-* (15+ files), plugins/tutorial/*
- Academy / progression: plugins/eden/eden-academy.js, eden-chapter-client.js, eden-theory.js
- First-5-minutes contract: docs/FIRST-5-MINUTES.md (and realization in the above)

## Honesty Notes
- The Todo + Eden reveal path is now one of the strongest realized product experiences.
- Sourcery is still largely bootstrap / page-scoped; ambient cross-surface and widget-scope curation is future work.
- Restart-from-here replays guidance but does not (yet) roll back live app state.
- Guidance is deliberately "projection but real" (derived from persisted tutorial progress).

## Cross References
- Depends on: 02 (projections of progress), 06 (gated by authority/stewardship), 07 (explains real execution & witnesses)
- Produces on-ramps into: 04 (authoring), 05 (capability discovery/install), 09 (editing)
- See [../CAPABILITIES.md](../CAPABILITIES.md#7-sourcery-and-guided-composition)

## Primary Docs
- [../EXPERIENCE.md](../EXPERIENCE.md) (full story from arrival to stewardship + Sourcery direction)
- [../FIRST-5-MINUTES.md](../FIRST-5-MINUTES.md)
- [../ACADEMY.md](../ACADEMY.md)
- Eden Canvas Roadmap section in EXPERIENCE
