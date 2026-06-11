# Roadmap

## North Star

Build a reflective application environment where memory is executable, witnessed, composable, and navigable.

The platform should eventually support:

- self-editing UI and process definitions
- first-class identity, authority, and perspective
- live evolution with safe migration and rollback
- clear product, shell, and extension boundaries
- witnessed execution and inspection across the same world model

This roadmap is now organized around the major missing seams rather than historical implementation phases. It is the short operational view of what matters next.

Related direction:

- [docs/EXPERIENCE.md](C:\Users\aaron\Documents\world\docs\EXPERIENCE.md)
- [docs/CAPABILITIES.md](C:\Users\aaron\Documents\world\docs\CAPABILITIES.md)

---

## Current Baseline

The project now has a credible runtime spine:

- witnessed state and replayable projections
- declarative routes, widgets, frontend programs, and widget version transitions
- generic host startup through `serverRunner` + `serve`
- identity-backed session handling on the main browser surfaces
- live projection refresh without full page reload
- dedicated Process View and generic frontend execution tracing
- a bootstrap seam that can recover a blank world into a runnable app
- a guided Todo assembly path that uses the real bootstrap surface

The baseline, bootstrap seam, and blank-to-Todo UI assembly path are done. The current runtime can honestly claim a coherent baseline without depending on hidden demo-only cheats at the core layer.

Completed baseline detail lives here:

- [PHASE1.md](C:\Users\aaron\Documents\world\PHASE1.md)
- [BASELINE.md](C:\Users\aaron\Documents\world\BASELINE.md)

The active question is no longer "can the baseline work?" It is "what seams most accelerate composition from here?"

---

## Primary Missing Seams

### 1. Capability Core

Status: active

This is the highest-leverage missing seam. The platform needs first-class capability/plugin objects rather than a world where composition still bottoms out in hidden wiring.

- [ ] Make capability/plugin objects first-class in the model and DSL.
- [ ] Define capability surfaces explicitly: public API, configuration, internals, context, and authority requirements.
- [ ] Make capability installation and placement first-class rather than a detached setup ritual.
- [ ] Make capability authoring part of the product story, not a privileged side channel.
- [ ] Introduce a capability catalog/store model with install/update/remove lifecycle, provenance, and compatibility surfaces.
- [ ] Keep the core engineering rule explicit: do not hide app semantics in JS unless they are universal runtime/shell behavior or explicit plugin implementation code.

This seam is the main transition from "wiring one app" to "assembling many capabilities."

### 2. Context, Identity, and Authority

Status: active

The runtime now has identity/session basics, but context and authority are still under-modeled relative to the product direction.

- [ ] Make context first-class as the boundary for names, local composition, imports/exports, and perspective-local meaning.
- [ ] Introduce local naming and cross-context reference semantics so the system stops depending on one global soup.
- [ ] Deepen identity into first-class witnessed things, relations, and identity-to-perspective structure.
- [ ] Model authority, delegation, and stewardship explicitly rather than leaving them as implied runtime behavior.
- [ ] Introduce proposal/gate flows for world mutation where direct mutation should no longer be the whole story.
- [ ] Define operator-owned recovery semantics for persistent worlds, including password reset and identity bootstrap recovery.

This seam is what lets composition scale beyond a single trusted operator and a single flat namespace.

### 3. Operating Surface

Status: active

The product still needs a real operating surface, not only bootstrap forms and inspector pages.

- [ ] Make editable-everywhere pages a first-class product rule.
- [ ] Define the page/widget/section editing grammar: inspect, hide, replace, upgrade, show process, show witnesses, show source.
- [ ] Add a true search/command surface spanning pages, widgets, capabilities, commands, hidden surfaces, and witnessed execution.
- [ ] Add a live editable inspector that maps rendered elements back to authored structures and can save changes into the world.
- [ ] Clarify and enforce the distinction between app content, harness/bootstrap content, and deep internals.
- [ ] Expand the base UI primitive vocabulary where needed so the operating surface does not stall on missing HTML/CSS-level building blocks.

This seam is what turns the system from "coherent architecture" into "a place you can actually operate."

### 4. Sourcery

Status: active

Sourcery should evolve from a single guided Todo tutorial into the truthful companion layer over the system.

- [ ] Make Sourcery contextual at world, page, section, widget, and chapter scope.
- [ ] Support restart-from-here behavior for the relevant scope rather than only full tutorial restart.
- [ ] Support per-context enable/disable while keeping disabled guidance visible and recoverable.
- [ ] Introduce concept-aware guidance that reveals ideas as they become relevant.
- [ ] Introduce ambient, truthful curation that can surface good next steps without hiding the machine.
- [ ] Keep Sourcery constrained to real product surfaces rather than letting it become a second fake authoring system.

This seam is about teaching, stewarding, and assisting without losing truthfulness or user agency.

### 5. Executable Runtime and Live Evolution

Status: active

The baseline runtime is coherent, but more of the system still needs to become honestly executable from the model and safely evolvable while live.

- [ ] Make more route/backend behavior directly executable from witnessed/runtime-authored definitions where that can be done honestly.
- [ ] Model cross-context request/response as one witnessed pattern across frontend, backend, compiler, human, and agent contexts.
- [ ] Remove remaining hidden runtime conventions by replacing them with explicit contracts or extension points.
- [ ] Extend live evolution beyond widget subtree refresh toward broader runtime/process evolution.
- [ ] Strengthen compatibility, migration, fork, block, and rollback semantics at the runtime level.
- [ ] Expand rollback/recovery beyond same-soul widget version rollback.

This seam is about making execution and live change trustworthy rather than merely declarative-looking.

### 6. Shells, Persistence, and Ecosystem

Status: active

The system is heading toward a real operating environment with multiple shells and a broader capability exchange layer.

- [ ] Define the shell contract cleanly: what belongs to the core, what belongs to shells, and what belongs to capabilities/plugins.
- [ ] Make desktop-shell capabilities explicit rather than letting them leak into the core model.
- [ ] Introduce a first-class desktop shell that proves local ownership without forking the world model.
- [ ] Make persistence, backup, import/export, and operator lifecycle first-class product concerns.
- [ ] Define the capability/store ecosystem direction: provenance, trust, compatibility, install/update channels, and review/report surfaces.
- [ ] Keep theming visible but subordinate here as a shell/product boundary problem rather than a top-level driver.

This seam is what turns the prototype into something ownable locally, reachable remotely, and extensible across worlds.

---

## Secondary / Ongoing

These items matter, but they should not visually compete with the primary missing seams above.

### Canvas and Interaction

- [ ] Selective undo that does not clobber later winning claims from other witnesses.
- [ ] Connector bundling for dense duplicate-instance pairs.
- [ ] Timeline strip virtualization and memoized prefix projection for large logs.
- [ ] Bring perspective layouts into the World Graph view.
- [ ] Allow manual override of auto-layout in the World Graph.

### Layout and Rendering

- [ ] Evaluate stronger layout/routing approaches when the lightweight graph layout stops being adequate.
- [ ] Improve the base styling/layout vocabulary needed for richer app surfaces without reintroducing one-off widget cheats.

---

## Notes

- [docs/CAPABILITIES.md](C:\Users\aaron\Documents\world\docs\CAPABILITIES.md) is the detailed inventory of missing reusable molecules.
- [docs/EXPERIENCE.md](C:\Users\aaron\Documents\world\docs\EXPERIENCE.md) is the broader product-experience thesis.
- This roadmap is intentionally not a full history log. Completed baseline detail belongs in the phase/baseline handoff documents, while this file stays focused on what matters next.
