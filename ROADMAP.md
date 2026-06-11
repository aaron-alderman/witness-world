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
- [docs/BACKEND-SEAMS.md](C:\Users\aaron\Documents\world\docs\BACKEND-SEAMS.md)

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

Status: partial

This is the highest-leverage missing seam. The platform needs first-class capability/plugin objects rather than a world where composition still bottoms out in hidden wiring.

- [x] Make capability/plugin objects first-class in the model and DSL.
- [x] Define capability surfaces explicitly: public API, configuration, internals, context, and authority requirements.
- [x] Make capability installation and placement first-class rather than a detached setup ritual.
- [x] Make capability authoring part of the product story, not a privileged side channel.
- [x] Introduce a local capability catalog/install surface with provenance and compatibility read models.
- [ ] Turn the local catalog projection into a fuller catalog/store lifecycle with update flows, review surfaces, and remote provenance/trust channels.
- [ ] Deepen compatibility beyond typed facet presence into stronger install-time compatibility reasoning across versions, authorities, and richer target semantics.
- [ ] Keep the core engineering rule explicit: do not hide app semantics in JS unless they are universal runtime/shell behavior or explicit plugin implementation code.

This seam is the main transition from "wiring one app" to "assembling many capabilities."

Current first slice now exists:

- authored `capability` objects in the model and DSL
- typed facet groups for `publicApi`, `config`, `internals`, `authority`, and `placement`
- install/remove flows onto `context`, `serverRunner`, and route-root `Page` surfaces
- bootstrap capability authoring/install/remove forms
- local catalog/read-model exposure through bootstrap APIs
- world graph capability nodes plus install/dependency edges
- compatibility projection from legacy `context.capabilities` and host capability strings

Honest caveats / rollback watch:

- Host capability support still uses an internal `targetKind = "host"` path even though the first public placement slice only exposes `context`, `serverRunner`, and `routePage`.
  This is a pragmatic bridge for runtime startup compatibility, but if host capabilities later want a cleaner first-class public contract, this internal shape may need revision rather than being treated as final.
- Legacy capability sugar currently synthesizes placeholder capability definitions during projection/load.
  That keeps old worlds working, but it is still a compatibility bridge rather than a principled authored migration format.
- `routePage` placement is only route-root `Page` placement, not a true page entity or arbitrary widget-subtree placement model.
  If a stronger page concept lands later, this slice should be treated as intentionally narrow and replaceable.
- Install validation is typed and dependency-aware, but it is still shallow.
  It checks placement, dependency existence, and duplicate installs, but it does not yet perform deeper semantic compatibility checks, version negotiation, or authority conflict analysis.
- The current catalog is a local projection, not yet a real package/store protocol.
  The naming is directionally correct, but the implementation is still closer to a local indexed read model than a mature install ecosystem.
- The bootstrap capability authoring surface is intentionally minimal and JSON-heavy.
  It is truthful, but not yet a strong product-quality authoring experience.

### 2. Context, Identity, and Authority

Status: partial

The runtime now has identity/session basics, but context and authority are still under-modeled relative to the product direction.

- [x] Make context first-class enough to act as an authored authority boundary with owner, optional parent, optional stewards, and bootstrap read/write support.
- [ ] Make context the full boundary for names, local composition, imports/exports, and perspective-local meaning.
- [ ] Introduce local naming and cross-context reference semantics so the system stops depending on one global soup.
- [x] Deepen identity enough for real home-scope attachment through `homePerspective` plus optional `homeContext`.
- [x] Model authority, delegation, and stewardship explicitly for the generic bootstrap mutation surface.
- [x] Introduce proposal create/approve/reject flows for guarded generic bootstrap/world-authoring mutations.
- [ ] Extend those authority/proposal rules beyond the bootstrap authoring surface into broader operating surfaces and app behaviors.
- [ ] Define operator-owned recovery semantics for persistent worlds, including password reset and identity bootstrap recovery.

This seam is what lets composition scale beyond a single trusted operator and a single flat namespace.

Current authority-first bootstrap slice now exists:

- first-class authored `context`, `perspective`, `stewardship`, and `proposal` objects in the model/DSL/projections
- optional `context` attachment on widgets, frontend programs, routes, server runners, and capabilities
- shared authority derivation for bootstrap mutation handlers
- inherited parent-context stewardship for scoped bootstrap writes
- bootstrap read models for `contexts`, `perspectives`, `stewardships`, `authority`, and `proposals`
- bootstrap UI for context creation, perspective creation, stewardship grant/revoke, and proposal approve/reject
- cookie-backed session reads now surface `homeContext` when present

Honest caveats / rollback watch:

- This is an authority-first governance slice, not the full context-composition slice.
  Context exists as a real boundary for bootstrap governance, but naming/import/export semantics are still deferred.
- Authority derivation currently governs the generic bootstrap mutation surface, not arbitrary app-specific handler-set actions.
  If broader world editing later reuses different flows, this derivation layer should become the shared rule rather than another special case.
- Stewardship is currently actor-string based, not a richer principal/group model.
  If identity-backed principals become stricter later, grant semantics may need tightening rather than quiet extension.
- Proposal execution is a fixed supported-process executor, not a general workflow engine.
  It is honest for this slice, but it should not be mistaken for a complete review/queue system.
- Older authored objects may remain unscoped.
  That compatibility path is deliberate, but it means direct ownership is still part of the mutation model and some worlds will stay partially outside context governance until migrated.

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

### 6. Practical Backend Capabilities

Status: active

This seam is about practical app capability rather than platform purity.

Roadmap boxes in this section turn `[X]` only when runtime behavior, tests, and honest capability boundaries exist.

The current starting slice is Files + Uploads because it most quickly makes the product feel real while exercising storage, authority, hosting, and async seams.

#### Foundation Contracts

- [ ] Define `runtime.config` as the backend capability that owns config schema, secret references, local defaults, and runtime binding.
- [ ] Define the provider-adapter contract for practical backend capabilities so one product seam can support many concrete providers.
- [ ] Define the witness contract for external side effects: intent, attempt, success/failure, and external reference ids.
- [ ] Define authority expectations for backend capabilities so filesystem, network, secret, and provider powers stay explicit.

#### Files And Uploads First Slice

- [ ] Add `fs.blob` capability for folder-aware file operations, metadata, scoped paths, and stable asset references.
- [ ] Add `fs.stream` capability for streaming reads/writes and upload/download primitives.
- [ ] Add `upload.asset` capability for browser upload intake, validation, persistence, and hosted asset references.
- [ ] Add a local-disk provider path for `fs` and upload capabilities so the first slice is runnable without cloud dependencies.
- [ ] Add private and public asset hosting behavior through the generic host without collapsing uploads back into route glue.
- [ ] Add deterministic test and stub flows for file and upload behavior.

#### Data And Async Substrate

- [ ] Add `db.sql` as one relational-data seam with provider adapters for SQLite, Postgres, and MySQL.
- [ ] Add `jobs.queue` for async work, retries, delayed jobs, dead-letter state, and idempotency keys.
- [ ] Add `search.index` for indexing and reindex flows once stored records and assets exist.

#### Identity And External Integrations

- [ ] Add `auth.oauth` layered over the existing identity and session model rather than replacing it.
- [ ] Add `http.outbound` for signed requests, retries, and provider-bound external calls.
- [ ] Add `webhook.inbound` for verified inbound events, replay protection, and handoff into jobs or processes.
- [ ] Add `notify.email` as a stub-first outbox-backed notification seam.
- [ ] Add `notify.sms` as a stub-first outbox-backed notification seam.

#### Product Honesty And Operability

- [ ] Keep external systems modeled as proxies with witnessed external ids rather than hidden truth stores.
- [ ] Keep backend seams stub-first where external vendors would otherwise block product work.
- [ ] Add operator-visible diagnostics for capability config, provider status, and failed side effects.
- [ ] Add bootstrap or inspection surfaces for practical backend capabilities once the first runtime slice exists.

This seam is the difference between a runtime that can host a demo and a runtime that can support ordinary serious applications.

Detailed spike:

- [docs/BACKEND-SEAMS.md](C:\Users\aaron\Documents\world\docs\BACKEND-SEAMS.md)

### 7. Shells, Persistence, and Ecosystem

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
