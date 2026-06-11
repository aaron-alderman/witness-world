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
- [x] Introduce a first context-composition slice: local alias rows, explicit export/import edges, explanatory scope projections, and contextual ref lowering on covered bootstrap/DSL surfaces.
- [ ] Make context the full boundary for names, local composition, imports/exports, and perspective-local meaning across the whole product, not only the covered first-slice surfaces.
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

Current context-composition first slice now exists:

- explicit `contextBinding`, `contextExport`, and `contextImport` authored structures in the model, DSL, bootstrap APIs, and projections
- `contextScopes` read models that explain local vs imported visibility
- explicit named-import semantics with duplicate visible-name rejection
- shared contextual-resolution and first-slice composition validation used by bootstrap and DSL authoring
- contextual ref lowering for `parentRef`, `rootWidgetRef`, `servesRef`, `serverRunnerRef`, `routeRef`, `backendHostRef`, and `frontendHostRef`
- canonical ids still stored in witnesses after authoring-time resolution
- bootstrap UI for bind/export/import create/remove flows

Honest caveats / rollback watch:

- This started as an authority-first governance slice, but it now includes a real first context-composition slice as well.
  What is still deferred is the full product-wide naming/package system, not the existence of bindings/exports/imports themselves.
- Authority derivation currently governs the generic bootstrap mutation surface, not arbitrary app-specific handler-set actions.
  If broader world editing later reuses different flows, this derivation layer should become the shared rule rather than another special case.
- Stewardship is currently actor-string based, not a richer principal/group model.
  If identity-backed principals become stricter later, grant semantics may need tightening rather than quiet extension.
- Proposal execution is a fixed supported-process executor, not a general workflow engine.
  It is honest for this slice, but it should not be mistaken for a complete review/queue system.
- Older authored objects may remain unscoped.
  That compatibility path is deliberate, but it means direct ownership is still part of the mutation model and some worlds will stay partially outside context governance until migrated.
- Context composition is still a narrow first slice, not the full naming/package system.
  It covers bootstrap + DSL + runtime reads for a bounded set of reference-bearing fields, not every reference in the platform.
- Parent context is still authority inheritance only.
  It does not imply name visibility, import inheritance, or package-style containment semantics.
- Imports are named-import only.
  There is still no wildcard import, namespace import, re-export chain, or automatic transitive visibility.
- Imported visibility is intentionally non-transitive and export tables only expose locally bound targets.
  That keeps the model honest now, but if future package semantics want re-export or import-of-import behavior this slice may need a structural extension rather than incremental patching.
- Contextual refs are parallel authoring fields, not a universal replacement for canonical ids.
  Capability installs, proposal targets, stewardship targets, and app-specific handler-set actions still mostly operate on canonical ids.
- Canonical-id authoring is still a compatibility bypass around contextual visibility.
  Covered surfaces now accept contextual `*Ref` fields, but their parallel canonical id fields can still reference foreign scoped objects directly. That is deliberate for first-slice compatibility, but if contexts later become hard composition boundaries this path will need an explicit migration/lockdown plan rather than quiet tightening.
- The low-level JS helpers for `context.bind` / `context.export` / `context.import` remain permissive witness emitters.
  The first-slice guardrails are enforced on the real authoring paths (`DSL` and bootstrap APIs), not as a universal hard wall around every internal helper call.
- Some explanatory read surfaces are still thinner than the write path.
  For example, `parentRef` now lowers correctly, but the bootstrap widget read model is still mostly a flat definition list rather than a rich attachment table with parent/slot/order explanation.
- The current bootstrap UI is truthful but minimal.
  Some removal flows still expect explicit row fields rather than richer row-pickers, so the product surface should not be mistaken for the final composition UX.

### 3. Operating Surface

Status: active

The product still needs a real operating surface, not only bootstrap forms and inspector pages.

- [x] Add a first world-surface search/command slice spanning real graph objects, page/surface handoffs, hidden browser modes, and process-view execution handoff.
- [x] Add a first operating-surface tiering slice so app routes, harness recovery, and deep internal/operator surfaces are explicitly labeled in the world graph and command palette.
- [x] Extend the world-page command palette to expose disabled tutorial guidance recovery backed by real persisted tutorial state, not only graph objects and static surface links.
- [x] Add a first live-page inspector slice with right-click widget inspection, truthful world/source/witness/process handoff, and in-place widget version activate/rollback on rendered app pages.
- [x] Add a true search/command surface spanning pages, widgets, capabilities, commands, hidden surfaces, and witnessed execution.
- [ ] Make editable-everywhere pages a first-class product rule.
- [ ] Define the page/widget/section editing grammar: inspect, hide, replace, upgrade, show process, show witnesses, show source.
- [ ] Add a live editable inspector that maps rendered elements back to authored structures and can save changes into the world.
- [ ] Clarify and enforce the distinction between app content, harness/bootstrap content, and deep internals.
- [ ] Expand the base UI primitive vocabulary where needed so the operating surface does not stall on missing HTML/CSS-level building blocks.

This seam is what turns the system from "coherent architecture" into "a place you can actually operate."

Honest caveats / rollback watch:

- The editing grammar is no longer empty, but it is still only a first narrow subset.
  Inspect, widget version upgrade/rollback, show source, show witnesses, and process-view handoff now exist on both the world surface and a first live-page inspector on rendered app pages, but hide/replace/live save-back editing do not.
- The current command surface is world-page scoped, not universal.
  It now exists on both the real `/world` operating surface and rendered app pages, and it indexes projected world-graph objects, current-page widgets, real surface handoffs, and tutorial recovery commands derived from persisted tutorial state.
  It still does not cover every shell, plugin-owned surface, or arbitrary disabled surface in the product.
- The new app/harness/internal distinction is only a first explicit surface-tier slice.
  It currently classifies route-backed operating surfaces and builtin handoffs on the world page; it is not yet a universal content-boundary model across every widget, page, shell, or capability surface.
- Search ranking is still simple local matching over truthful labels and metadata.
  That is acceptable for a first operating slice, but if later ranking wants stronger context-awareness it should remain inspectable rather than becoming opaque assistant magic.
- The shared command surface is projection-backed, not registry-backed.
  Live-page results come from rendered `[data-widget]` ancestry, `/api/world-graph`, and explicit route/process/version endpoints, not from a second assistant-owned command namespace.
- The live-page inspector currently depends on rendered `[data-widget]` ancestry plus projected world-graph metadata.
  That is a truthful first bridge, but it is not yet a universal page/entity editing contract across every rendered surface or shell.
- The current live-page process handoff is derived from authored frontend-program/event structure around the selected widget.
  It is honest for buttons, forms, and root load behavior, but it is not yet a generic process explainer for arbitrary runtime effects.

### 4. Sourcery

Status: active

Sourcery should evolve from a single guided Todo tutorial into the truthful companion layer over the system.

- [x] Add chapter-scoped restart controls across the real bootstrap, live-app, and world-page tutorial surfaces, with persisted rewind to the first step of the active chapter.
- [x] Add a first page-scoped Sourcery slice: page-aware continuation between bootstrap and live-app surfaces plus per-page disable/re-enable persistence.
- [x] Extend that page-scoped Sourcery slice onto the real `/world` operating surface so the shipped tutorial can end on a real inspection surface instead of stopping at the live app.
- [ ] Make Sourcery contextual at world, page, section, widget, and chapter scope.
- [x] Support restart-from-here behavior for the relevant scope beyond chapter rewind.
- [ ] Support per-context enable/disable while keeping disabled guidance visible and recoverable.
- [x] Introduce concept-aware guidance that reveals ideas as they become relevant.
- [x] Introduce ambient, truthful curation that can surface good next steps without hiding the machine.
- [ ] Keep Sourcery constrained to real product surfaces rather than letting it become a second fake authoring system.

This seam is about teaching, stewarding, and assisting without losing truthfulness or user agency.

Current Sourcery slices now include:

- chapter-scoped restart on the real bootstrap, live-app, and world-page tutorial surfaces
- page-aware continuation plus per-page disable/re-enable across bootstrap, the live app, and the real `/world` operating surface
- bootstrap-visible disabled guidance surfaces plus direct recovery actions for page-disabled guidance on the other real surface
- step-level restart-from-here replay pins on those same surfaces, including stable replay when backing onto an already-complete step
- authored concept metadata revealed progressively on those same surfaces as tutorial progress reaches the relevant steps
- bootstrap-first next-step suggestions derived from real world/session/tutorial state and wired only to real controls or real surface handoffs
- a final shipped Todo tutorial handoff into `/world`, with a world-page guidance panel driven by the same persisted tutorial progress model rather than a separate onboarding-only state path

Honest caveats / rollback watch:

- Current Sourcery context is page-aware only across the real bootstrap, live-app, and `/world` surfaces.
  It still does not understand world-as-scope, section, or widget scope, so the broader contextual-companion goal remains open.
- Chapter restart rewinds to the first authored step of the active chapter.
  Restart-from-here now replays the current authored step and pins completed steps when the user navigates back, but it still does not provide true page-level, section-level, or widget-level restart semantics.
- Restart-from-here is guidance replay only.
  It does not roll back authored world state, live app state, persisted todos/notes, or other side effects, so any future broader "restart this scope" promise may need a different model rather than extending this slice past its honest shape.
- Page disable currently lives on tutorial progress as explicit page-name state for the known bootstrap/app surfaces.
  Bootstrap and the world page can now surface and recover those disabled pages directly, but the persisted shape is still page-name state for the known bootstrap/app/world surfaces. If Sourcery later grows richer scope anchors this should evolve into a more general scope-key model rather than accumulate more page-specific exceptions.
- The blank-world tutorial starter now authors `/world` and its supporting program/routes as part of the starter fast path.
  That is an honest product handoff, not a fake tutorial-only page, but it is still a starter blueprint convenience rather than a general "all worlds always have an operating surface" rule. If future worlds need more varied operating-surface composition this slice should generalize around authored operating-surface packages rather than harden the starter blueprint shape by accident.
- Concept awareness now comes from authored tutorial concept metadata and real tutorial progress.
  That is a truthful first step, but it is still linear and tutorial-scoped rather than a general concept graph or semantic inference layer over arbitrary worlds.
- Ambient curation is currently bootstrap-first and deterministic.
  It surfaces a small set of derived next moves from visible world/session/tutorial state, not a broader cross-surface ranking or recommendation system.

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

Status: complete

This seam is about practical app capability rather than platform purity.

Roadmap boxes in this section turn `[X]` only when runtime behavior, tests, and honest capability boundaries exist.

The current starting slice is Files + Uploads because it most quickly makes the product feel real while exercising storage, authority, hosting, and async seams.

#### Foundation Contracts

- [X] Define `runtime.config` as the backend capability that owns config schema, secret references, local defaults, and runtime binding.
- [X] Define the provider-adapter contract for practical backend capabilities so one product seam can support many concrete providers.
- [X] Define the witness contract for external side effects: intent, attempt, success/failure, and external reference ids.
- [X] Define authority expectations for backend capabilities so filesystem, network, secret, and provider powers stay explicit.

#### Files And Uploads First Slice

- [X] Add `fs.blob` capability for folder-aware file operations, metadata, scoped paths, and stable asset references.
- [X] Add `fs.stream` capability for streaming reads/writes and upload/download primitives.
- [X] Add `upload.asset` capability for browser upload intake, validation, persistence, and hosted asset references.
- [X] Add a local-disk provider path for `fs` and upload capabilities so the first slice is runnable without cloud dependencies.
- [X] Add canvas drag-and-drop asset creation with automatic context association and fallback `Files` context behavior.
- [X] Add private asset hosting behavior through the generic host without collapsing uploads back into route glue.
- [X] Extend asset hosting with explicit public-serving mode through the generic host with runner-level opt-in and tested private/public boundaries.
- [X] Add asset-seam diagnostics and inspection surfaces for storage status and recent upload or content-read failures.
- [X] Add deterministic test and stub flows for file and upload behavior.

#### Data And Async Substrate

- [X] Add `db.sql` as one relational-data seam with a shipped SQLite provider path and explicit Postgres/MySQL adapter contract boundaries.
- [X] Add `jobs.queue` for async work, retries, delayed jobs, dead-letter state, and idempotency keys.
- [X] Add `search.index` for indexing and reindex flows with a shipped local-text provider path over explicit documents and asset-backed sources.

#### Identity And External Integrations

- [X] Add `auth.oauth` layered over the existing identity and session model with a shipped stub provider, account-link flow, and session establishment.
- [X] Add `http.outbound` for signed requests, retries, and provider-bound external calls.
- [X] Add `webhook.inbound` for verified inbound events, replay protection, and handoff into jobs or processes.
- [X] Add `notify.email` as a stub-first outbox-backed notification seam.
- [X] Add `notify.sms` as a stub-first outbox-backed notification seam.

#### Product Honesty And Operability

- [X] Keep external systems modeled as proxies with witnessed external ids rather than hidden truth stores.
- [X] Keep backend seams stub-first where external vendors would otherwise block product work.
- [X] Add operator-visible diagnostics for capability config, provider status, and failed side effects.
- [X] Add bootstrap or inspection surfaces for practical backend capabilities once the first runtime slice exists.

This seam is the difference between a runtime that can host a demo and a runtime that can support ordinary serious applications.

The seam-definition program for section 6 is complete.

The first asset-product follow-on slice is now shipped:

- dropped files are more useful world objects through richer inspector affordances, open/download flows, and honest typed preview where the runtime can really support it

The next execution order in this area should be:

1. Add first-class asset reference or attachment semantics so files can be associated with notes, records, and other world objects without collapsing back into ad hoc file paths or handler-specific glue.
2. Push heavier asset follow-on work behind `jobs.queue` and `search.index`: extraction, thumbnailing, reindex, and other async ingestion steps with witnessed processing state.
3. Add a hosted provider path for `fs.stream` and `upload.asset`, then tighten larger-payload, multipart, and backpressure behavior against that provider boundary.
4. Wire a real `db.sql` Postgres adapter before adding MySQL so the relational seam is proven against one serious hosted provider.
5. Add one real `notify.email` provider path before attempting SMS-provider complexity.
6. Add one real `auth.oauth` provider path to prove callback, secret, and account-link behavior against a live external provider.
7. Shift the main adjacent emphasis to section 5 so more backend behavior becomes honestly executable from witnessed or runtime-authored definitions rather than remaining handler-set glue.

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
