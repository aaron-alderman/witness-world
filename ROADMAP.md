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

Terminology used in this roadmap:

- `fake`: a surface that pretends a behavior exists without deriving it from the real world model or persisting it truthfully
- `stub`: a real seam with a deliberately simplified local or deterministic provider path
- `projection`: a real derived read model; useful and inspectable, but not canonical truth
- `real but narrow`: a truthful first slice with intentionally limited coverage or scope; not fake, but not yet the final general form
- `compatibility bridge` or `compatibility sugar`: a transitional path that keeps older authored worlds or runtime behavior working while the first-class model catches up

Current honesty snapshot:

- The command/search surface is projection-backed, not registry-backed.
- Tutorial recovery commands are derived from persisted tutorial progress, not from a fake command registry.
- Internal runtime bundle/profile composition is now explicit and inspectable through startup reporting plus `/api/runtime/diagnostics`; it is no longer only an internal convention.
- The shipped practical backend seams are mostly stub-first, not fake; provider realism is intentionally deferred there.
- Legacy capability strings still synthesize placeholder capability objects, which is a compatibility bridge rather than a final authored migration story.
- Contextual naming exists, and covered authoring surfaces no longer allow hidden foreign-scoped canonical-id bypasses.
  Canonical ids still remain as a compatibility path for same-context, unscoped, and already-visible targets.
- Live page proposal approval is real and now refreshes rendered pages through the witness stream, but the proposal path is still narrow and still depends on the generic proposal flow rather than a richer in-surface review model.
- The next honesty risks are governance and migration gaps, not a secret command or registry layer.
  The main ones today are placeholder capability synthesis, remaining canonical-id compatibility paths, and the still-unfinished push to bring every operating-surface or app-specific mutation route under one shared authority/proposal path.

Current honesty ledger:

- `fake` at the core seam level: none currently called out here.
  The main current risks are not hidden theatre; they are narrow first slices, stubbed providers, and compatibility bridges that could calcify if left unattended.
- `stub` today: practical backend provider seams.
  Those surfaces are real runtime seams with simplified/local providers, and they are intentionally tracked outside this roadmap slice because other agents are already developing them.
- `projection but real` today: command/search and tutorial recovery.
  Those surfaces are derived read models, but they are still grounded in the world graph, witness log, and persisted tutorial progress rather than a hidden registry or assistant-only namespace.
- `real but narrow` today: live proposal review, route-root page capability placement, current-identity editing, first-slice canvas authority-bound world mutation, and contextual naming coverage on the first covered authoring surfaces.
  These are truthful slices with bounded scope, not product-complete general rules yet.
- `compatibility bridge` today: legacy capability-string synthesis and the remaining same-context / unscoped / already-visible canonical-id authoring paths.
  Those paths keep older worlds working, but they are not the intended final composition story.

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

The immediate runtime follow-up is now clearer:

- decide whether runtime profile selection stays an operator-only startup input or becomes a first-class declared runtime choice on `serverRunner` or runtime config
- extend the current profile-gated explanation path beyond diagnostics, plugin availability/review reads, and CLI summaries so inactive bundles do not still read as arbitrary 404s or mysteriously missing authoring affordances in broader product surfaces
- keep pushing toward explicit plugin/store contracts without pretending the internal bundle model is already an external ecosystem
- keep moving remaining runtime and backend behavior out of handler-set glue and into authored or bundle-owned executable seams

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
- [ ] Replace legacy capability-string synthesis with an explicit authored migration path so old worlds stop depending on placeholder capability objects during projection/load.
- [x] Keep the core engineering rule explicit: do not hide app semantics in JS unless they are universal runtime/shell behavior or explicit plugin implementation code.

This seam is the main transition from "wiring one app" to "assembling many capabilities."

Current first slice now exists:

- authored `capability` objects in the model and DSL
- typed facet groups for `publicApi`, `config`, `internals`, `authority`, and `placement`
- install/remove flows onto `context`, `serverRunner`, and route-root `Page` surfaces
- bootstrap capability authoring/install/remove forms
- local catalog/read-model exposure through bootstrap APIs, including per-capability source attribution such as `catalog-only`, `package-only`, and `both`
- world graph capability nodes plus install/dependency edges
- compatibility projection from legacy `context.capabilities` and host capability strings
- internal runtime bundles/profiles with strict operator-facing profile selection and a shared runtime diagnostics endpoint
- local plugin package discovery through `plugins/<plugin-id>/plugin.json`, `RUNTIME_PLUGIN_ROOT`, `GET /api/runtime/plugins`, and bootstrap package-source read models
- startup-local runtime plugin activation through repeatable CLI `--runtime-plugin <id>` and `RUNTIME_PLUGINS=plugin.a,plugin.b`, with runtime composition resolved as `profile + activated plugins`
- runner-authored `runtimePlugin.install` / `runtimePlugin.remove` intent plus bootstrap availability and installed-state reads, so capability assembly can expose executable-vs-metadata-only packages and per-runner installability truth
- explicit plugin-backed composition attribution through `capabilityPackageSources`, `capabilitySourceState` / `packageSources`, `runtimePluginAvailability`, and authored/operator/effective plugin source reporting rather than treating plugin contributions as ambient runtime behavior
- the maintained demo example now proves authored plugin composition directly: `demo_server` installs `plugin.authoring`, `plugin.inspect`, and `plugin.canvas`, and served demo entrypoints run on `minimal` rather than relying on implicit `full`
- the core engineering rule is now written down explicitly in the capability docs: app semantics belong either in the world/model, universal runtime/shell infrastructure, or explicit plugin boundaries rather than hidden generic JS glue

Honest caveats / rollback watch:

- Host capability support still uses an internal `targetKind = "host"` path even though the first public placement slice only exposes `context`, `serverRunner`, and `routePage`.
  This is a pragmatic bridge for runtime startup compatibility, but if host capabilities later want a cleaner first-class public contract, this internal shape may need revision rather than being treated as final.
- Legacy capability sugar currently synthesizes placeholder capability definitions during projection/load.
  That keeps old worlds working, but it is still a compatibility bridge rather than a principled authored migration format.
- The world graph still shows legacy context capability strings as badges on context nodes alongside the new first-class capability/install edges.
  That is helpful for continuity right now, but if the graph later wants one canonical capability story this duplicated presentation should be removed rather than normalized.
- `routePage` placement is only route-root `Page` placement, not a true page entity or arbitrary widget-subtree placement model.
  If a stronger page concept lands later, this slice should be treated as intentionally narrow and replaceable.
- Install validation is typed and dependency-aware, but it is still shallow.
  It checks placement, dependency existence, and duplicate installs, but it does not yet perform deeper semantic compatibility checks, version negotiation, or authority conflict analysis.
- The current catalog is a local projection, not yet a real package/store protocol.
  The naming is directionally correct, but the implementation is still closer to a local indexed read model than a mature install ecosystem.
- Internal bundles now own executable runtime extension, while local plugin packages provide an externalizable filesystem manifest contract.
  Discovery, validation, compatibility, startup-local activation, runner-authored install intent, and package/source visibility are now real, but execution remains bundle-bridge only and provider loading, trust, install/update lifecycle, and remote provenance are still future store work.
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
- [x] Add a first operating-surface proposal path so signed-in live-inspector users without direct widget authority can create real `widget.update` proposals for later approval.
- [x] Add a first live-page version proposal path so signed-in live-inspector users without direct version authority can create real `widgetVersion.activate` and `widgetVersion.rollback` proposals for later approval.
- [x] Add a first Eden version proposal path so signed-in Eden users without direct version authority can create real `widgetVersion.activate`, `widgetVersion.rollback`, and `edenVersions.publish` proposals for later approval.
- [x] Add a first Eden capability-install proposal path so signed-in Eden users without direct target authority can create real `capability.install` proposals for later approval.
- [x] Tighten context-composition boundaries by phasing out hidden foreign-scoped canonical-id bypasses on covered bootstrap/DSL authoring surfaces while preserving local and legacy compatibility.
- [x] Extend shared authority checks into a first non-bootstrap canvas world-mutation slice so context-scoped perspective creation, direct thing title/relation edits, and asset attach/detach writes now respect context/target authority.
- [x] Add a first canvas proposal-fallback slice so signed-in non-stewards can use the same canvas mutation surface to create real `canvas.perspective.create`, `canvas.thing.setTitle`, `canvas.relate`, and `canvas.unrelate` proposals instead of only receiving authority failures.
- [x] Extend that same canvas proposal-fallback seam to shared asset attach/detach writes so signed-in non-stewards can use the normal attachment endpoints to create real `asset.attach` / `asset.detach` proposals instead of only receiving authority failures.
- [x] Extend that same canvas shared-governance seam to shared thing creation so scoped `canvas.createThing` writes are governed by context authority, created shared things inherit their perspective context for later target-based checks, and signed-in non-stewards can use the normal canvas surface to create real `canvas.createThing` proposals.
- [x] Extend that same canvas shared-governance seam to shared layout mutation so scoped `canvas.batch` writes derive authority from the governing perspective context and signed-in non-stewards can use the normal live canvas surface to create real `canvas.batch` proposals.
- [x] Extend that same canvas shared-governance seam to shared projection-instance and direct perspective ops so scoped `canvas.move` / `canvas.moveMany` / `canvas.style` / `canvas.remove` / `canvas.removeMany` / `canvas.duplicate` / `canvas.camera` / `canvas.grid` derive authority from the governing perspective context, and signed-in non-stewards can use the same canvas mutation surface to create real proposals for the shared edits that are exposed there.
- [x] Extend that same canvas shared-governance seam to shared placement so scoped `canvas.place` derives authority from the governing perspective context and signed-in non-stewards can use the same live palette/canvas surface to create real `canvas.place` proposals.
- [x] Bring shared widget-version and Eden version mutation routes under the same authority derivation story by governing version souls through authored context.
- [x] Add a first app-specific shared CRUD slice where shared Todo writes are governed by authored context authority, direct writes and approved proposals share the same execution helpers, and signed-in non-stewards can use the same Todo endpoints to create real `todo.create` / `todo.update` / `todo.delete` proposals.
- [x] Extend that same app-surface proposal fallback to the shipped shared widget-version controls so signed-in non-stewards can use the same `/api/widget-versions/*` endpoints to create real `widgetVersion.activate` / `widgetVersion.rollback` proposals.
- [x] Extend that same shared app-surface proposal fallback to the shipped widget editor so shared `POST /api/widgets` creates governed `frontend` widgets directly for stewards and real `widget.define` proposals for signed-in non-stewards.
- [x] Make the first app-local/private seam explicit so private notes stay actor-private by contract, API shape, and page copy rather than only by handler convention.
- [x] Add a second explicit personal-projection slice where Eden page theme stays actor-scoped and product-visible instead of collapsing into shared context truth.
- [ ] Decide whether same-context and already-visible canonical-id authoring should remain permanent compatibility sugar or eventually yield to a stricter contextual-name-first product rule.
- [ ] Extend those authority/proposal rules beyond the current bootstrap/live-inspector/Todo/widget-editor/canvas/Eden slices into the remaining operating surfaces and app behaviors.
- [ ] Bring the remaining app-specific and other operating-surface mutation routes under the same shared authority/proposal derivation story instead of leaving them as adjacent special cases.
- [ ] Unify those first personal-surface slices into one clearer personal/perspective-local contract so session defaults, witness visibility, notes, theme, and future actor-scoped projections stop depending on ad hoc route-by-route convention.
- [ ] Define operator-owned recovery semantics for persistent worlds, including password reset and identity bootstrap recovery.

This seam is what lets composition scale beyond a single trusted operator and a single flat namespace.

Current authority-first bootstrap slice now exists:

- first-class authored `context`, `perspective`, `stewardship`, and `proposal` objects in the model/DSL/projections
- optional `context` attachment on widgets, frontend programs, routes, server runners, and capabilities
- shared authority derivation for bootstrap mutation handlers
- inherited parent-context stewardship for scoped bootstrap writes
- bootstrap read models for `contexts`, `perspectives`, `stewardships`, `authority`, and `proposals`
- bootstrap UI for context creation, perspective creation, stewardship grant/revoke, and proposal approve/reject
- cookie-backed session reads now surface actor-scoped `homeContext` and `perspective`, and current-identity edits refresh those defaults on the active session
- a first operating-surface extension: signed-in live-inspector users without direct widget authority can create real `widget.update` proposals from the rendered page
- a first live-page version proposal extension: signed-in live-inspector users without direct version authority can create real `widgetVersion.activate` and `widgetVersion.rollback` proposals from the rendered page, with approval still flowing through the generic proposal APIs
- a first Eden versions-panel proposal extension: signed-in Eden users without direct version authority can create real `widgetVersion.activate`, `widgetVersion.rollback`, and `edenVersions.publish` proposals from the versions surface, with approval still flowing through the generic proposal APIs
- a first direct canvas authority extension: `canvas.perspective.create` and scoped `canvas.createThing` now enforce context authority for shared perspectives, created shared things now inherit that governing context for later target-based checks, `canvas.thing.setTitle` / `canvas.relate` / `canvas.unrelate` now enforce target authority over the mutated source thing, and asset attach/detach writes now enforce authority over both the asset and the target
- a first canvas proposal-fallback extension: the same live canvas mutation endpoint now falls back to real `canvas.perspective.create`, `canvas.thing.setTitle`, `canvas.relate`, and `canvas.unrelate` proposals for signed-in non-stewards on shared surfaces, and the live canvas status copy now reflects that proposal-mode success instead of only surfacing raw rejection
- a second canvas proposal-fallback extension: the normal asset attachment endpoints now fall back to real `asset.attach` / `asset.detach` proposals for signed-in non-stewards on shared surfaces, and the live canvas attachment controls now surface proposal-mode status copy instead of only surfacing raw rejection
- a third canvas proposal-fallback extension: shared `canvas.createThing` now derives authority from the scoped perspective’s governing context, stamps newly created shared things into that context for later target-based governance, and falls back to real `canvas.createThing` proposals for signed-in non-stewards on the normal live canvas surface
- a fourth canvas proposal-fallback extension: shared `canvas.batch` layout writes now derive authority from the scoped perspective’s governing context and fall back to real `canvas.batch` proposals for signed-in non-stewards on the normal live canvas surface, so drag and reposition changes stay on the same endpoint instead of hard failing
- a fifth canvas governance extension: shared projection-instance ops (`canvas.move`, `canvas.moveMany`, `canvas.style`, `canvas.remove`, `canvas.removeMany`, `canvas.duplicate`) plus direct perspective-local ops (`canvas.camera`, `canvas.grid`) now derive authority from the scoped perspective's governing context, the same canvas mutation surface now falls back to real proposals for the shared direct-edit paths that are surfaced there, and direct `canvas.undo` / `canvas.redo` authority checks are now context-aware even though their proposal semantics remain deferred
- a sixth canvas governance extension: shared `canvas.place` now derives authority from the scoped perspective's governing context and falls back to real `canvas.place` proposals for signed-in non-stewards on the normal live palette/canvas surface, so re-placing existing shared things uses the same governed mutation seam as the rest of the shared canvas edits
- a first version-governance extension: shared `/api/widget-versions/*` and Eden version mutation routes now respect the governing context of the versioned widget soul instead of acting like sign-in-only mutators
- a first app-specific shared-governance extension: the shared Todo routes now treat shared todos as governed objects under the authored `frontend` context, expose Todo authority mode on `GET /api/todos`, and fall back to real `todo.create` / `todo.update` / `todo.delete` proposals on the same CRUD endpoints for signed-in non-stewards
- a first app-surface shared-version extension: the shipped Todo page now flips its shared widget-version controls between direct and proposal copy, and the same `/api/widget-versions/*` endpoints now fall back to real `widgetVersion.activate` / `widgetVersion.rollback` proposals for signed-in non-stewards instead of hard failing
- a second app-surface shared-governance extension: the shipped widget editor now stamps newly created shared widgets into the authored `frontend` context and uses the same `POST /api/widgets` endpoint for either direct steward creates or real `widget.define` proposals for signed-in non-stewards
- a first explicit personal-surface extension: `/api/private-notes` now exposes actor-private privacy metadata and the shipped Todo page now states that those notes belong only to the current signed-in perspective instead of relying on implicit privacy behavior
- a second explicit personal-projection extension: Eden page theme now persists actor-scoped page treatment through real `edenPageTheme.set` writes and signed-in page renders, while anonymous or other-actor renders still see their own/default projection
- a third explicit personal/defaults extension: actor-scoped session state and visible witness filtering are now real product seams, and `homeContext` already drives contextless asset-drop fallback while `homePerspective` already shapes signed-in default perspective state

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
- Authority derivation now governs the generic bootstrap mutation surface plus real shared Todo, widget-editor, canvas, version, asset-attachment, and capability-install slices, but it still does not cover every remaining app-specific or other operating-surface mutation action.
  If broader world editing later reuses different flows, this derivation layer should become the shared rule rather than another special case.
- Stewardship is currently actor-string based, not a richer principal/group model.
  If identity-backed principals become stricter later, grant semantics may need tightening rather than quiet extension.
- Proposal execution is a fixed supported-process executor, not a general workflow engine.
  It is honest for this slice, but it should not be mistaken for a complete review/queue system.
- The first non-bootstrap proposal-authoring path is intentionally narrow.
  It currently exists on the live widget inspector for `widget.update`, on the live shared Todo board for `todo.create` / `todo.update` / `todo.delete`, on the shipped widget editor for same-surface `widget.define` proposals, on the shipped shared widget-version controls for same-surface `widgetVersion.activate` / `widgetVersion.rollback` proposals, on the live canvas mutation endpoint for same-surface `canvas.perspective.create` / `canvas.createThing` / `canvas.place` / `canvas.move` / `canvas.moveMany` / `canvas.style` / `canvas.remove` / `canvas.removeMany` / `canvas.duplicate` / `canvas.camera` / `canvas.grid` / `canvas.batch` / `canvas.thing.setTitle` / `canvas.relate` / `canvas.unrelate` proposals, on the live asset attachment endpoints for same-surface `asset.attach` / `asset.detach` proposals, on the live version seams for first-slice `widgetVersion.activate` / `widgetVersion.rollback` proposal creation, on the Eden versions surface for `widgetVersion.activate` / `widgetVersion.rollback` / `edenVersions.publish`, and on the Eden capability shelf for `capability.install`; approval/rejection still happens through the generic proposal APIs and broader app-specific actions are still outside this slice.
- Canvas now has a first direct authority-bound world-mutation slice plus a narrow first proposal fallback, but broader canvas governance is still incomplete.
  Scoped perspective creation, shared thing creation, shared placement, shared layout mutation, shared projection-instance edits, direct thing title/relation edits, and shared asset attach/detach writes now all have a first proposal-aware fallback on their normal live surfaces, but the history-sensitive actions still do not.
  The current canvas slice lets signed-in non-stewards create real `canvas.perspective.create`, `canvas.createThing`, `canvas.place`, `canvas.move`, `canvas.moveMany`, `canvas.style`, `canvas.remove`, `canvas.removeMany`, `canvas.duplicate`, `canvas.camera`, `canvas.grid`, `canvas.batch`, `canvas.thing.setTitle`, `canvas.relate`, `canvas.unrelate`, `asset.attach`, and `asset.detach` proposals from the shared canvas mutation seam, while the history-sensitive `canvas.undo` / `canvas.redo` actions still are not routed through that shared proposal/governance path.
- The shared Todo routes are now the first app-specific CRUD seam under the shared authority/proposal story, but that slice is still deliberately narrow.
  Shared todos are explicitly governed by the authored `frontend` context and now emit enough contextual object claims for later target-based governance, while the shipped widget editor now uses that same shared context as its create boundary; private notes remain intentionally actor-private and broader non-app or cross-surface mutation flows still need the same shared derivation treatment.
- Personal projections and actor-scoped defaults are now explicit in several real places, but still only as first slices.
  `/api/private-notes` returns explicit actor-private privacy metadata and the page copy reflects that, Eden page theme persists actor-scoped treatment that does not become shared context truth, visible witness/session state already varies by actor, and `homeContext` / `homePerspective` now affect live product behavior; yet those seams still do not share one common personal/perspective-local contract.
- Widget-version and Eden version mutation routes now use the same authority derivation path as the broader governance slice, but version proposal fallback is still only a narrow first slice.
  The live inspector can now create real `widgetVersion.activate` and `widgetVersion.rollback` proposals for read-only shared versioned widgets, the shipped Todo page now does the same on its shared version controls through the normal `/api/widget-versions/*` endpoints, and the Eden versions panel can now create real `widgetVersion.activate`, `widgetVersion.rollback`, and `edenVersions.publish` proposals for that same shared seam, while broader version or app-specific mutation routes still remain outside that shared proposal/governance path.
- Eden capability installs now also have a first proposal-aware fallback on the shared world surface, but it is still only a narrow first slice.
  Signed-in Eden users without direct authority over the target can now create real `capability.install` proposals from the place the missing capability is discovered, while approval still runs through the generic proposal APIs and capability removal or richer review/package flows remain outside this slice.
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
  Capability installs, proposal targets, stewardship targets, and many remaining app-specific runtime actions still mostly operate on canonical ids.
- Canonical-id authoring is still a compatibility path, but it no longer bypasses hidden foreign scoped targets on covered bootstrap/DSL authoring surfaces.
  The parallel canonical id fields still work for same-context targets, unscoped legacy targets, and foreign targets that are already explicitly visible through import/binding.
  If contexts later become stricter package boundaries, the remaining canonical-id compatibility should be decided explicitly rather than left to drift.
- Identity editing is now real, but still only as a narrow current-identity slice.
  The current `identity.update` path edits `label`, `username`, `password`, `homeContext`, and `homePerspective`, refreshes the active session when needed, and is now reachable both from bootstrap and from the live `F1 -> whoami` shortcut for the current signed-in identity.
  It still intentionally keeps identity `id` plus `actor` immutable. If future identity lifecycle work wants principal migration, rename history, or stronger credential handling, this slice should be extended deliberately rather than treated as the final model.
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
- [x] Add a first bundle-contributed internal/operator diagnostics surface through `/backend-seams`, so practical-backend inspection participates in the same route/surface tiering model instead of living only as raw JSON endpoints.
- [x] Add first hidden world-browser modes for primitive, witness, source, and process inspection, with witnessed-source gating, object-linked source highlighting, and an explicit handoff into the dedicated process surface instead of treating those views as raw debug endpoints.
- [x] Extend the world-page command palette to expose disabled tutorial guidance recovery backed by real persisted tutorial state, not only graph objects and static surface links.
- [x] Add a first live-page inspector slice with right-click widget inspection, truthful world/source/witness/process handoff, and in-place widget version activate/rollback on rendered app pages.
- [x] Add a first dedicated process operating surface with authored process catalogs, recent runs, correlated request inspection, and step-by-step replay for selected runs.
- [x] Add a true search/command surface spanning pages, widgets, capabilities, commands, hidden surfaces, and witnessed execution.
- [x] Add a first direct expert shortcut (`F1 -> whoami`) on live app surfaces and Eden, revealing current-user truth through the shared command surface.
- [x] Add a first identity-edit handoff from `F1 -> whoami` into the real bootstrap identity editor.
- [x] Add a first inline current-identity edit path on live app surfaces and Eden through `F1 -> whoami`, backed by real `identity.update` writes and active-session refresh.
- [x] Add a first live-page hide/show mutation slice for non-versioned widgets through real `widget.update` save-back.
- [x] Add a first live-page proposal path for read-only widget edits through real `widget.update` proposals.
- [x] Add a first Eden world-surface capability install slice with curated capability state, direct installs for authorized actors, and truthful refresh on the same surface.
- [x] Add a first Eden world-surface proposal path for read-only capability installs through real `capability.install` proposals.
- [x] Add a first Eden academy progression slice with witnessed quest completion, chapter-rail quest state, and earned shared-stewardship unlocks on the neighborhood action chips.
- [x] Close the live proposal/live-refresh gap so approved page edits propagate without requiring a manual reload.
- [X] Extend Eden progression into the first later operator/runtime gate so `Process View -> Alter Runtime` opens from real publish + process inspection practice and can run a witnessed failure drill in-world.
- [x] Extend Eden progression into the optional `Tree -> Theory Annex` / `trained` side path.
- [x] Add the first repeated-practice Eden layer so stewardship, operator work, and teaching are projected as real responsibility tracks rather than only one-off first-loop quest completion.
- [x] Broaden those Eden responsibility tracks beyond the first stewardship/operator/teaching slice into the first wider quest-family consequences, including `Shared Table`, `Run A Stall`, and `Ship A Tiny SaaS` unlocks on Tree and adjacent action surfaces.
- [x] Extend Eden into the first real commons/governance loop so `Start A Group`, `Set The Rules`, and `Run An Open Organization` complete from witnessed context, stewardship, and proposal practice on the `Commons` surface.
- [ ] Expand Eden progression beyond this first responsibility family into broader academy taxonomies, deeper thresholds, and stronger cross-surface unlock consequences.
- [ ] Make editable-everywhere pages a first-class product rule.
- [ ] Define the page/widget/section editing grammar: inspect, hide, replace, upgrade, show process, show witnesses, show source.
- [ ] Add a live editable inspector that maps rendered elements back to authored structures and can save changes into the world.
- [ ] Clarify and enforce the distinction between app content, harness/bootstrap content, and deep internals.
- [ ] Expand the base UI primitive vocabulary where needed so the operating surface does not stall on missing HTML/CSS-level building blocks.

This seam is what turns the system from "coherent architecture" into "a place you can actually operate."

Honest caveats / rollback watch:

- The editing grammar is no longer empty, but it is still only a first narrow subset.
  Inspect, widget version upgrade/rollback, show source, show witnesses, process-view handoff, and a first real hide/show mutation now exist on both the world surface and a first live-page inspector on rendered app pages.
- The process surface is now more than a bare handoff target, but it is still only a first replay/inspection slice.
  It already exposes authored process catalogs, recent runs, per-node timeline/history, correlated backend requests, and replay cursor/failure jumps on a dedicated page, but it is still read-only rather than a generalized debugger, editor, or cross-shell execution console.
- The hidden source/primitive/witness/process browsers are now real surfaces, but they are still intentionally constrained.
  The world surface can open dedicated primitive, witness, and source modes plus a lightweight process explorer handoff, with selected-object highlighting and source-file navigation, yet source reads are still limited to witnessed imported DSL files and process exploration still hands off into the separate process page rather than becoming a full in-place debugger.
- There is now a narrow real `widget.update` save-back path for non-versioned widgets, but it is not editable-everywhere.
  The backend/API witness flow is real, yet the live inspector only exposes it when the current actor actually owns the unscoped widget or has authority over its governing context.
- That narrow save-back path now includes `hidden` in addition to `text`, `title`, and `class`.
  It is enough to make hide/show truthful on supported widgets, but not enough to claim general widget-structure editing, replace, or editable-everywhere coverage.
- The shipped demo world now explicitly grants `aaron` stewardship over the `frontend` context so the first live save-back slice is actually usable on app chrome.
  That is an honest governance choice in the demo world, not a general editable-everywhere rule; other actors such as `callan` do not get direct save and instead only get the new narrow proposal path.
- The live inspector now has a first proposal-aware fallback for signed-in actors without direct authority.
  It can create real `widget.update` proposals from the rendered page, and approved changes now refresh through the live witness stream without a manual reload, but approval still happens through the generic proposal flow rather than a richer in-surface review queue.
- The operating surfaces now have two first version-proposal slices for read-only shared versioned widgets.
  The live inspector covers real `widgetVersion.activate` and `widgetVersion.rollback` proposal creation plus generic approval and live witness-refresh after approval, while the Eden versions panel now covers real `widgetVersion.activate`, `widgetVersion.rollback`, and `edenVersions.publish` proposal creation with explicit refresh from the same truthful version state; broader version proposal coverage and in-surface review still remain open.
- The Eden world surface now has a first real capability-install slice, but it is still only partial.
  Authorized users can install curated capabilities directly onto the shared target and see truthful refreshed install state on the same surface, while signed-in users without direct authority fall back to real `capability.install` proposals; review still happens through the generic proposal flow and capability remove/propose symmetry is still missing there.
- The current command surface is world-page scoped, not universal.
  It now exists on both the real `/world` operating surface and rendered app pages, and it indexes projected world-graph objects, current-page widgets, real surface handoffs, and tutorial recovery commands derived from persisted tutorial state.
  It still does not cover every shell, plugin-owned surface, or arbitrary disabled surface in the product.
- The new expert shortcut is truthful but narrow.
  `F1 -> whoami` can now reveal the current user truth, edit the current signed-in identity inline, refresh the active session when that identity changes, and still hand off into real world/source/bootstrap views on live app pages and Eden's embedded board.
  It is still only a first identity-edit slice rather than a broader expert transport grammar or full identity lifecycle surface.
- The first Eden academy progression slices are now real, but still intentionally narrow.
  The chapter rail now reads real quest completion, the first shared-stewardship gates open from practiced work, the first operator gate on `Process View` is real with a witnessed failure drill, the optional `Theory Annex` can now witness real lesson study plus the `trained` assessment path, the first stewardship/operator/teaching tracks are now projected from repeated work, and the first broader responsibility-family consequences now exist through `Shared Table`, `Run A Stall`, and `Ship A Tiny SaaS`.
  What is still ahead is broadening that model into more academy families, deeper thresholds, and stronger unlock results derived from those tracks.
- The new app/harness/internal distinction is only a first explicit surface-tier slice.
  It currently classifies route-backed operating surfaces and builtin handoffs on the world page, including the practical-backend `/backend-seams` diagnostics surface; it is not yet a universal content-boundary model across every widget, page, shell, or capability surface.
- Search ranking is still simple local matching over truthful labels and metadata.
  That is acceptable for a first operating slice, but if later ranking wants stronger context-awareness it should remain inspectable rather than becoming opaque assistant magic.
- The shared command surface is projection-backed, not registry-backed.
  That means it is real but derived, not fake; the remaining limitation is coverage, not truthfulness.
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
- [x] Make Sourcery contextual at world, page, section, widget, and chapter scope.
- [x] Support restart-from-here behavior for the relevant scope beyond chapter rewind.
- [ ] Broaden scope-aware Sourcery authoring beyond the shipped Todo slice so more real surfaces expose authored section/widget anchors, clearer recovery naming, and truthful local scope actions.
- [ ] Generalize authored scope-anchor catalogs beyond the shipped Todo surfaces so app/world packages can opt into truthful Sourcery recovery and focus without being turned into tutorial steps.
- [x] Support per-context enable/disable while keeping disabled guidance visible and recoverable.
- [x] Introduce concept-aware guidance that reveals ideas as they become relevant.
- [x] Introduce ambient, truthful curation that can surface good next steps without hiding the machine.
- [ ] Keep Sourcery constrained to real product surfaces rather than letting it become a second fake authoring system.

This seam is about teaching, stewarding, and assisting without losing truthfulness or user agency.

Current Sourcery slices now include:

- chapter-scoped restart on the real bootstrap, live-app, and world-page tutorial surfaces
- a canonical scope-aware tutorial-progress model with stable `world`, `page:*`, `section:*`, `widget:*`, and `chapter:*` keys plus canonical `disabledContextIds` state, plus compatibility sugar for legacy `disabledPages` / `replayStepId` state
- scope-aware continuation plus scope-aware disable/re-enable across bootstrap recovery, the live app, and the real `/world` operating surface
- bootstrap-visible, live-app-visible, and world-visible disabled guidance scope recovery, including explicit reveal actions plus direct re-enable/open-surface actions on the real surface list
- live-app and `/world` per-context disable/re-enable on authored frontend surfaces, with bootstrap recovery visibility for disabled contexts so off-surface guidance can still be found and resumed truthfully
- truthful real-control focus actions on those shipped surfaces, including `Show Current Control` and same-surface disabled-scope reveal where the authored target already exists
- a first authored non-step scope-anchor catalog on the shipped Todo app and `/world`, so Sourcery can name and focus real widget/section controls like the widget editor submit path and world process/back links without inventing extra tutorial steps
- restart-from-this-scope replay pins on those same surfaces, including stable replay when backing onto an already-complete step
- authored scope anchors on the shipped Todo tutorial so bootstrap, the live app, and `/world` guidance attach to real world/page/section/widget/chapter surfaces rather than only page names, with the shipped live-app handoff now anchored to the real app-title widget and the shipped world handoff now anchored to the real world command entry instead of only broad page/surface scope
- shared `tutorialTarget` rendering across bootstrap-authored and DSL-authored widget surfaces, so the same Sourcery focus contract now survives both starter-authored worlds and the shipped demo/example worlds instead of only bootstrap-created app state
- real surface-context plumbing on the shipped Todo app and `/world`, with the blank-world starter now authoring its frontend widgets/programs/routes into `frontend` context and the live rendered surfaces exposing truthful context/route/widget/program anchors that now drive per-context Sourcery controls
- authored concept metadata revealed progressively on those same surfaces as tutorial progress reaches the relevant steps
- bootstrap-first next-step suggestions derived from real world/session/tutorial state, wired only to real controls or real surface handoffs, and now keeping disabled-scope recovery visible when it competes with optional fast-path curation
- a final shipped Todo tutorial handoff into `/world`, with a world-page guidance panel driven by the same persisted tutorial progress model rather than a separate onboarding-only state path

Honest caveats / rollback watch:

- Current Sourcery context is now scope-aware, but only where steps are explicitly authored with real scope anchors.
  The shipped Todo slice now covers `world`, `page`, `section`, `widget`, and `chapter` scope across bootstrap, the real live app, and `/world`, including widget-scoped app-title and world-command-entry handoffs; broader tutorials and product surfaces still need more authored scope metadata instead of inference theatre.
- Chapter restart rewinds to the first authored step of the active chapter.
  Restart-from-this-scope now replays the current authored scope and pins completed steps when the user navigates back, but it still does not provide world/app state rollback semantics.
- Restart-from-here is guidance replay only.
  It does not roll back authored world state, live app state, persisted todos/notes, or other side effects, so any future broader "restart this scope" promise may need a different model rather than extending this slice past its honest shape.
- Scope disable is now persisted canonically as scope-key state with page-name compatibility derived alongside it, and context disable is now persisted canonically as authored context ids.
  Bootstrap, the live app, and the world page can now surface and recover disabled guidance through that same real state, while direct per-context disable/re-enable currently exists on the live app and `/world` surfaces rather than every possible tutorial surface.
- Live app and `/world` surfaces now expose truthful authored surface context anchors and Sourcery now acts on the shipped `frontend` context.
  Broader context coverage still depends on authoring more real context metadata onto more tutorials and surfaces instead of inferring it from page names or invented semantic tags.
- The shipped Todo app and `/world` now have a first authored non-step scope-anchor path, but broader packages still need to opt in explicitly.
  The current catalog can recover and focus extra real controls without turning them into tutorial steps, yet most other surfaces still have no authored scope-anchor metadata and should not be inferred automatically.
- Bootstrap now has real section-scoped guidance on the shipped tutorial forms, but it is not yet a full widget-scoped bootstrap companion.
  The current bootstrap slice is truthful for the real authored form surfaces it uses, while finer-grained bootstrap widget/control anchors remain future work rather than something Sourcery should infer.
- The blank-world tutorial starter now authors `/world` and its supporting program/routes as part of the starter fast path.
  That is an honest product handoff, not a fake tutorial-only page, but it is still a starter blueprint convenience rather than a general "all worlds always have an operating surface" rule. If future worlds need more varied operating-surface composition this slice should generalize around authored operating-surface packages rather than harden the starter blueprint shape by accident.
- Concept awareness now comes from authored tutorial concept metadata and real tutorial progress.
  That is a truthful first step, but it is still linear and tutorial-scoped rather than a general concept graph or semantic inference layer over arbitrary worlds.
- Ambient curation is currently bootstrap-first and deterministic.
  It surfaces a small set of derived next moves from visible world/session/tutorial state, not a broader cross-surface ranking or recommendation system.

### 5. Executable Runtime and Live Evolution

Status: active

The baseline runtime is coherent, but more of the system still needs to become honestly executable from the model and safely evolvable while live.

- [x] Add a first authored backend-program seam with first-class backend program/version/step objects, request-time active-version dispatch, bootstrap mutation flows, and shared backend process tracing.
- [x] Add a first authored backend-program version-transition slice with explicit `compatible` / `migrate` / `block` / `fork` activation semantics plus live rollback of the active dispatched version.
- [x] Convert the shipped demo `GET /api/todos` route from handler-set glue to an authored backend program while keeping the response contract stable.
- [x] Convert the shipped demo `POST /api/todos` route from handler-set glue to an authored backend program with authored request parsing plus success/error branching while keeping the response contract stable.
- [x] Convert the shipped demo `PATCH /api/todos/:id` route from handler-set glue to an authored backend program with authored request parsing, route-param seeding, and proposal-aware success/error branching while keeping the response contract stable.
- [x] Convert the shipped demo `DELETE /api/todos/:id` route so authored backend programs cover the remaining CRUD path rather than leaving delete on handler-set glue.
- [x] Convert the shipped `GET /api/private-notes` and `POST /api/private-notes` routes onto authored backend programs so the backend seam is proven beyond shared Todo CRUD while preserving actor-private behavior.
- [x] Convert the governed save-back `POST /api/widgets` route onto an authored backend program so authored backend execution is proven on mutation surfaces beyond app data routes.
- [x] Make mounted authored routes win over generic bundle fallback endpoints so live authored backend routes are not shadowed by runtime-profile route tables.
- [x] Convert one more non-Todo demo/backend route by moving `GET /api/witnesses` onto an authored backend program so authored backend execution is not limited to data + save-back slices.
- [x] Convert one more non-Todo failure/inspection route by moving `GET /api/simulate-network-error` onto an authored backend program so authored backend execution also covers explicit failure-path backend behavior.
- [x] Convert one operator inspection route by moving `GET /api/world-graph` onto an authored backend program so authored backend execution reaches bundle-owned inspection surfaces, not just app data, witness-log reads, and simulated failure paths.
- [x] Convert one more process/inspection route by moving `GET /api/process-view` onto an authored backend program so authored backend execution also covers live process inspection surfaces, not only graph projection.
- [x] Convert the remaining dedicated process-run inspection route `GET /api/process-runs/:runId` onto an authored backend program so both shipped process-inspection JSON surfaces run through the same backend seam.
- [x] Convert operator trace-ingest `POST /api/process-events` onto an authored backend program so the shipped process inspection loop is authored for both read and ingest surfaces, not just read-only inspection.
- [x] Lift transport-style live-runtime stream `GET /api/events` out of `runtime-server` hardcode into an explicit `events.stream` handler plus shipped mounted route so the SSE seam is visible and route-addressable even though it remains outside backend-program execution.
- [x] Expose handler route-kind metadata plus method constraints in bootstrap model and route validation so `page`, `backendProgram`, `json`, and `stream` route contracts stop depending on hardcoded UI guesses or hidden server rules.
- [x] Extend that handler route-kind metadata into runtime diagnostics so the same contract that drives bootstrap authoring is also inspectable from the shipped runtime explanation surface.
- [x] Extend that same handler route-kind metadata into plugin package summaries and plugin install/remove compatibility previews so manifests and review flows explain route semantics, not only route strings and bundle ids.
- [x] Extend that handler route-kind metadata into stable runtime-bundle manifests and CLI startup summaries so the contract is available outside server-only API payloads too.
- [ ] Decide whether streaming transports such as `GET /api/events` should gain a first-class authored streaming seam or remain explicit bundle/runtime handlers outside the current JSON-only backend-program model.
- [x] Turn handler/profile availability explanations into stronger inline operator feedback inside bootstrap route authoring and runtime-plugin review/install surfaces, not only diagnostics, manifests, and CLI summaries.
- [x] Extend that inline operator feedback across the remaining profile-gated bootstrap/operator seams such as capability installs and MCP authoring/install flows, so those actions no longer depend only on raw state or generic help text.
- [x] Extend the same inline explanation pattern into governed version/proposal actions such as widget activation/rollback, backend-program activation/rollback, and other authority-gated mutations that still mainly report success/failure after submit.
- [ ] Carry the same governed-action explanation contract into live inspector and other non-bootstrap version-control surfaces, especially widget version activate/rollback proposal flows that still rely on local wording instead of the richer bootstrap/operator guidance.
- [ ] Model cross-context request/response as one witnessed pattern across frontend, backend, compiler, human, and agent contexts.
- [ ] Remove remaining hidden runtime conventions by replacing them with explicit contracts or extension points.
- [ ] Decide which generic bundle endpoints should remain global fallbacks versus move behind explicit authored mounts now that mounted-route precedence is live-critical for authored execution.
- [ ] Decide whether `serverRunner.handlerSet` survives as a long-term execution boundary or remains only a migration compatibility seam while more backend/runtime behavior moves into authored or bundle-owned executable paths.
- [ ] Extend live evolution beyond widget subtree refresh toward broader runtime/process evolution.
- [ ] Strengthen compatibility, migration, fork, block, and rollback semantics at the runtime level.
- [ ] Unify rollback/recovery across widget versions, backend-program versions, and world-level operator replace flows so live evolution has one clearer runtime story instead of several separate local seams.
- [ ] Replace the current narrow backend result-envelope convention with a cleaner authored response contract for dynamic status, body, and error shaping across backend programs.

This seam is about making execution and live change trustworthy rather than merely declarative-looking.

Current first authored backend-runtime slice now exists:

- first-class `backendProgram`, `backendProgramVersion`, and `backendStep` authored objects in the model, DSL, bootstrap APIs, starter blueprint, and demo world
- a generic `backendProgram.run` route handler that resolves the active backend-program version at request time without restarting the server
- authored backend-program version transitions plus activation history with explicit `compatible`, `migrate`, `block`, and `fork` semantics, and live rollback to the previous active version
- authored backend request state now includes real matched route params so route-bound programs can orchestrate path-targeted mutations honestly
- shared backend traces (`backend.process.*`, `backend.step.*`, `backend.request.finish`) surfaced through Process View alongside frontend runs
- bootstrap operator forms for backend-program create/version/step/activate/rollback and backend-route authoring through `backendProgram.run`
- mounted authored routes now take precedence over generic bundle fallback endpoints, so the live route table can actually override bundle-owned defaults instead of being silently shadowed by them
- bundle-provided handler-set definitions still exist as a live runner seam during migration, with runtime diagnostics and bootstrap runner authoring exposing `serverRunner.handlerSet` explicitly instead of keeping it host-hardcoded
- shipped demo/backend starter conversion of `GET /api/todos` to authored `todo.todos.list`
- shipped demo/backend starter conversion of `POST /api/todos` to authored `todo.todos.create`
- shipped demo/backend starter conversion of `PATCH /api/todos/:id` to authored `todo.todos.update`
- shipped demo/backend starter conversion of `DELETE /api/todos/:id` to authored `todo.todos.delete`
- shipped demo/backend starter conversion of `GET /api/private-notes` to authored `todo.privateNotes.list`
- shipped demo/backend starter conversion of `POST /api/private-notes` to authored `todo.privateNotes.create`
- shipped demo/backend starter conversion of `POST /api/widgets` to authored `todo.widgets.create`
- shipped demo/backend starter conversion of `GET /api/witnesses` to authored `todo.witnesses.list`
- shipped demo/backend starter conversion of `GET /api/simulate-network-error` to authored `todo.network.simulateError`
- shipped demo/backend starter conversion of `GET /api/world-graph` to authored `todo.worldGraph.read`
- shipped demo/backend starter conversion of `GET /api/process-view` to authored `todo.processView.read`
- shipped demo/backend starter conversion of `GET /api/process-runs/:runId` to authored `todo.processRun.read`
- shipped demo/backend starter conversion of `POST /api/process-events` to authored `todo.processEvents.record`
- shipped demo/backend starter mount of `GET /api/events` to explicit `events.stream`
- bootstrap model + route authoring validation now expose explicit handler route kinds/methods for `backendProgram.run`, `events.stream`, and shipped page/json handlers

Honest caveats / rollback watch:

- Backend orchestration is now authored, but practical leaf behavior still bottoms out in JS handlers such as `todos.readModel`, `todos.createModel`, `todos.updateModel`, `todos.deleteModel`, `privateNotes.readModel`, and `privateNotes.createModel`.
  That is intentional for this slice, but it is still orchestration-over-leaf-capabilities rather than fully authored backend behavior.
- `serverRunner.handlerSet` is now bundle-provided instead of host-hardcoded, but its long-term role is still unresolved.
  The system still exposes handler-set selection on runners, preserves handler-set produced services in runtime startup, and reports handler-set composition in diagnostics, so this is no longer hidden glue; what remains open is whether it stays a first-class execution boundary or collapses as authored/bundle execution coverage expands.
- Generic bundle endpoints still exist as fallback routes even though mounted authored routes now win first.
  That removes accidental shadowing, but the longer-term contract for when a route should exist as a generic always-on endpoint versus an authored mount is still unsettled.
- Shared Todo CRUD, private notes, widget authoring, witness-log reads, simulated network failure, world-graph projection, and process-view/process-run inspection plus trace ingest now run on authored backend programs, but other non-Todo backend flows still sit outside that seam.
- `GET /api/events` is now explicit and mounted, but it is still a bundle/runtime streaming handler rather than a backend-program route.
  That is honest for the current slice because backend programs are still JSON-only and do not model long-lived streaming responses.
- Route authoring now knows about stream/page/backend-program route kinds and method constraints, but that contract currently lives in bootstrap/runtime metadata rather than as a more universal runtime semantic layer.
- Dynamic backend response shaping now works across the authored Todo and private-notes write-route slices, but it currently depends on a narrow internal result-envelope convention rather than a more principled authored contract.
- Only the demo Todo CRUD, private notes, widget authoring, witness-log route, simulated network failure route, world-graph route, process-view route, process-run route, and process-events route are fully converted so far, and `GET /api/events` is now an explicit mounted runtime stream route.
  Other demo/backend routes still execute through handler-set or bundle-owned generic glue.
- Backend-program transition semantics are real, but still local to the backend-program seam.
  `compatible`, `migrate`, `block`, `fork`, and rollback now exist for active backend-program dispatch, but the broader runtime still lacks one shared migration/rollback story across other mutable executable seams.
- Backend-program rollback is live and truthful at dispatch time, but it only changes which authored program version handles the next request.
  It does not roll back already-written world state, proposals, or projection files.
- Rollback and recovery now exist in more than one truthful layer, but they are still separate contracts.
  Widget versions can roll back live on a soul, backend programs can roll back active dispatch versions, and operator restore/import can replace whole-world canonical truth; what is still missing is one clearer cross-seam evolution and recovery story tying those layers together.

### 6. Practical Backend Capabilities

Status: active

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
- [ ] Decide whether `runtime.config` remains a core runtime substrate, moves fully behind `bundle-practical-backend`, or splits into a smaller core primitive plus bundle-owned provider config semantics.

This seam is the difference between a runtime that can host a demo and a runtime that can support ordinary serious applications.

The seam-definition program for section 6 is complete, but the next execution wave in this area is still active.

The first cross-capability operator inspection slice is now also real:

- `/backend-seams` is now a real operator workbench over the shipped practical backend surface, not just a raw diagnostics dump
- that surface links safe runtime-config inspection plus the shipped SQL, search, OAuth, jobs, outbound, webhook, and notification endpoints from one operator-facing page
- `/api/runtime-config` already exposes redacted safe inspection for the active runner instead of forcing operators to infer runtime state from startup flags or hidden environment convention

The first asset-product follow-on slice is now shipped:

- dropped files are more useful world objects through richer inspector affordances, open/download flows, and honest typed preview where the runtime can really support it
- assets can now attach to other world things through first-class witnessed attachment semantics instead of ad hoc file-path glue
- uploads now queue honest asset-ingestion work through `jobs.queue`, write derived text into world-managed storage, and reindex asset-backed search sources with visible processing state on the asset
- queued asset ingestion now supports structured local extraction for `json`, `csv`, `tsv`, `yaml`, `toml`, markup-style text, and first-slice PDF text extraction, including extension-aware structured detection when MIME types are generic, plus an explicit `search.index.assetRefreshPolicy` instead of always forcing reindex on ingest
- queued asset ingestion now derives image metadata plus local thumbnail artifacts for supported image uploads, with private thumbnail hosting through the same generic host boundary
- derived asset text is now exposed through the generic host and the canvas inspector, so ingestion output is visible as a real asset surface rather than only as backend state
- queued asset ingestion now derives and exposes richer structured asset metadata for supported document and structured-text uploads, including first-slice PDF page facts, CSV table facts, markdown heading or frontmatter facts, and initial YAML/TOML structure facts surfaced through projections and the canvas inspector
- asset repair is now a real product surface too: the canvas inspector can expose asset-local `Retry ingest` / `Refresh search` actions when repair is honest, and `/backend-seams` exposes direct operator retry/reindex actions for stale or failed asset state

#### Current Execution Follow-On

The drag-and-drop, storage, context-association, placement, and private-hosting contract is now a stable base, and the first ingestion-derived asset surface is real through derived-text links and inspector preview. The logically next product wave in this area is deeper asset understanding through background ingestion, not a new upload surface or a second upload entry point. The remaining order is: keep broadening async ingestion, widen the product-visible derived surface, then harden hosted-provider and adjacent provider paths.

The next concrete slice inside that wave is context-aware asset understanding: dropped files should become more useful through stronger context or attachment-aware inspection, richer derived metadata, and clearer processing state before this seam pivots to hosted providers or secondary backend capabilities.

The execution order inside that slice is: make context and attachment state more legible on the asset itself, widen the product-visible derived surface, then keep broadening async extraction and rendition depth behind the same upload and ingestion seam.

Completed base for this follow-on wave:

- [X] Expose derived asset text as a first-class product surface through the generic host, search-backed asset projections, and canvas inspector preview so queued ingestion results are directly usable.
- [X] Expose first product-facing repair affordances for asset ingestion/search failures through both the canvas inspector and `/backend-seams`, not only through raw diagnostics JSON.

Next execution steps:

- [ ] Make context-aware asset understanding the active next slice for `upload.asset` + `jobs.queue` + `search.index`, with context resolution, attachment state, and background ingestion continuing to be the main product wave rather than introducing a separate upload surface.
- [ ] Continue extending the asset product surface so ingestion results become more visible and useful: clearer processing and failure states, stronger context or attachment-aware asset inspection, broader derived metadata coverage beyond the shipped PDF, CSV, markdown, YAML, and TOML facts, and more useful structured facts in search and inspection surfaces.
- [ ] Broaden asset background processing behind `jobs.queue` and `search.index`: richer document and binary extractors, stronger thumbnail and rendition pipelines, and other async ingestion steps beyond the shipped structured-text, extension-aware YAML/TOML, PDF-text, image-metadata, local-thumbnail, and first structured-facts slice.
- [X] Add operator repair and retry flows for asset ingestion and asset-backed reindex so failed or stale derived outputs are inspectable and recoverable instead of remaining passive diagnostics.
- [ ] Add richer first-class asset surfaces after ingestion succeeds: more honest previews, derived representations, and inspection affordances that let dropped files feel like live world objects instead of stored blobs with metadata.
- [ ] Add a hosted provider path for `fs.stream` and `upload.asset`, then tighten larger-payload, multipart, and backpressure behavior against that provider boundary.
- [ ] Wire a real `db.sql` Postgres adapter before adding MySQL so the relational seam is proven against one serious hosted provider.
- [ ] Add one real `notify.email` provider path before attempting SMS-provider complexity.
- [ ] Add one real `auth.oauth` provider path to prove callback, secret, and account-link behavior against a live external provider.
- [ ] Shift the main adjacent emphasis to section 5 so more backend behavior becomes honestly executable from witnessed or runtime-authored definitions rather than remaining handler-set glue.

Detailed spike:

- [docs/BACKEND-SEAMS.md](C:\Users\aaron\Documents\world\docs\BACKEND-SEAMS.md)

### 7. Shells, Persistence, and Ecosystem

Status: active

The system is heading toward a real operating environment with multiple shells and a broader capability exchange layer.

Current base now exists:

- executable internal bundles as the honest runtime extension layer
- operator-selected runtime profiles with explicit bundle/capability/route/surface diagnostics
- a metadata-first local plugin package contract rooted at `plugins/<plugin-id>/plugin.json`
- startup-local activated local plugins that can opt into pre-registered internal bundles through `activatesBundles`
- authored `serverRunner` plugin installs that persist runtime plugin intent in the world model and compose additively with CLI/env operator overrides
- direct authoring endpoints plus shared proposal-execution parity for `runtimePlugin.install` and `runtimePlugin.remove`, so runtime plugin intent can be governed through the same world/proposal machinery as other authoring writes
- bootstrap runtime-plugin install/remove/proposal forms plus runner-scoped availability and installed-state lists, with first installability reasoning for metadata-only, incompatible, missing-dependency, installed, and blocked packages, and with bootstrap intentionally showing durable authored intent while CLI/env overlays stay in runtime diagnostics and startup reporting
- runtime-owned review reads plus bootstrap plugin detail panels that preview authored runner composition deltas, no-op installs, dependency chains, and declared-vs-resolved plugin contributions before install/remove
- authored `mcpServer` and `mcpToolInstall` objects with explicit delegated vs service acting modes, scoped tool installs, CLI stdio bridging, and runtime-owned HTTP MCP transport routes
- a first MCP tool catalog over real witnessed seams such as world reads, authoring/proposals, canvas, blobs/streams/assets, runtime config, SQL, search, jobs, outbound HTTP, webhooks, and notifications, with installed-tool filtering per server
- direct authoring endpoints plus generic proposal-target support for `mcpServer.define`, `mcpTool.install`, and `mcpTool.remove`
- a first bootstrap MCP authoring and operations surface with direct create/install/remove forms, proposal parity, grouped per-server inventory, transport visibility, service-identity display, scope explanation, and active-runtime attachment visibility
- runtime diagnostics and package catalog surfaces that expose package validity, compatibility, requested/active state, resolved bundles, and declared capability sources without auto-loading third-party code
- profile-gated authoring/runtime catalogs where `authorableHandlers`, `pageHandlers`, `dispatchHandlers`, and even bootstrap route availability vary truthfully by the active bundle/profile composition
- an explicit shell contract plus shell diagnostics for `browser`, `mcp`, and a first shipped `desktop` ownership shell, with shell-only powers and prohibited ambient powers kept visible
- a first Electron desktop adapter over the shared runtime with a launcher window, single active-world session manager, persisted recent-world list, explicit `window.witnessDesktop` powers, and `WORLD_HOME` open/create/reveal flows that do not fork the world model
- a first-class `WORLD_HOME` operator contract with `world-home-v1`, `cold`, `warm`, `warm-compatibility`, and `ephemeral` lifecycle modes
- an explicit operator lifecycle contract that distinguishes canonical witness/observation truth from derived runtime storage and declares supported flows such as `warm-restart`, `cold-start`, `backup`, `restore`, `export`, `import`, and `repair-rebuild`
- real whole-world operator artifacts through CLI plus authenticated bootstrap routes and UI: `backup`, `export`, `restore`, and `import`
- operator diagnostics and bootstrap state that expose mutation availability, managed artifact inventory, recent operator activity, and active persistence layout

- [x] Define the shell contract cleanly: what belongs to the core, what belongs to shells, and what belongs to capabilities/plugins.
- [x] Make desktop-shell capabilities explicit rather than letting them leak into the core model.
- [ ] Decide whether runtime profile selection remains an operator-only startup choice or becomes declared on `serverRunner` / runtime config, and make that choice explicit in the product/runtime contract.
- [ ] Add a clearer product-facing explanation path for profile-gated authoring and surface absence beyond the current diagnostics, plugin availability/review reads, and CLI startup summaries so inactive bundles do not still show up as arbitrary 404s or silently missing authoring affordances.
- [x] Introduce a first-class desktop shell that proves local ownership without forking the world model.
- [ ] Broaden the desktop shell beyond the first ownership proof without turning it into a forked product personality: packaging/update lifecycle, richer native integrations, and stronger end-to-end desktop ops/testing still remain ahead.
- [x] Make persistence, backup, import/export, and operator lifecycle first-class product concerns.
- [x] Define the first ecosystem trust/compatibility contract: provenance, trust states, compatibility dimensions, and metadata-only execution boundaries stay explicit.
- [x] Prove the first explicit MCP automation seam through authored server/tool-install objects, acting-mode rules, and shell-owned transport handling instead of treating automation as an ambient runtime power.
- [ ] Build the broader capability/store ecosystem beyond the shipped local catalog and runtime-plugin review/detail surfaces: install/update channels, broader report/review flows, and remote provenance/trust distribution.
- [x] Add a first product-quality MCP server/tool-install authoring and operations surface over the shipped DSL, direct authoring routes, generic proposal support, bootstrap-state read models, and CLI bridge.
- [x] Add a first bootstrap runtime-plugin install/remove surface with proposal parity, package availability reads, and runner-scoped install visibility.
- [x] Deepen runtime-plugin review and operations surfaces beyond the first bootstrap forms: richer dependency/source explanation, composition diffs, and clearer package review/detail affordances.
- [ ] Finish migrating the maintained demo off the remaining runtime-owned `bundle-demo` / `handlerSet = "demo"` compatibility seam so served-example composition is entirely explained by authored installs plus explicit runtime-owned bundle ownership, not hidden example glue.
- [ ] Remove the remaining demo handler-set model shims from authored backend programs, starting with `todos.*Model`, `privateNotes.*Model`, `widgets.createModel`, and `network.simulateModel`, so the pluginized maintained demo no longer routes core app logic back through `src/demo-handler-set.js`.
- [ ] Bring blank-world bootstrap/tutorial startup onto the same explicit runtime-composition story as the maintained demo so bootstrap can eventually run from a narrow baseline instead of a compatibility-heavy runtime path.
- [ ] Add runner-scoped runtime-plugin reconcile and repair flows so authored installs that point at missing, invalid, incompatible, or dependency-broken local packages become operable cleanup work instead of only startup failures and review warnings.
- [ ] Add operator-owned reset/recovery/repair flows beyond replace-only whole-world artifacts, including identity/bootstrap recovery where needed.
- [ ] Keep theming visible but subordinate here as a shell/product boundary problem rather than a top-level driver.

This seam is what turns the prototype into something ownable locally, reachable remotely, and extensible across worlds.

Current contract and persistence slice detail lives here:

- [docs/SHELLS-PERSISTENCE-ECOSYSTEM.md](C:\Users\aaron\Documents\world\docs\SHELLS-PERSISTENCE-ECOSYSTEM.md)

Honest caveats / rollback watch:

- The desktop shell is now real, but intentionally narrow.
  Electron now proves the first ownership shell with a launcher window, a single active-world session manager, persisted recent worlds, explicit `openWorldHome` / `createWorldHome` / `revealWorldHome` powers, and bootstrap-visible desktop shell state, but packaging/update lifecycle, notifications, broader native integrations, and stronger non-mock desktop coverage still remain future work.
- Runtime profile composition is now visible and truthful, but its source of authority is still narrow.
  Profiles, active bundles, and missing surface/capability consequences are exposed through CLI startup and runtime diagnostics, yet profile choice still behaves primarily as an operator startup input rather than a first-class authored runtime declaration on `serverRunner` or runtime config.
- Profile-gated authoring is now real, but still mostly operator-facing.
  Active profile/bundle selection already changes bootstrap availability plus the `authorableHandlers`, `pageHandlers`, `dispatchHandlers`, and handler-route contract catalogs, and bootstrap route authoring/runtime-plugin review/capability installs/MCP flows now surface more of that truth inline, yet governed mutation paths like version changes and proposal-mediated actions still need richer in-place explanations.
- Operator persistence is now real, but intentionally narrow.
  Current flows are whole-world only, replace-only for `restore` and `import`, and preserve inspectable canonical truth instead of adding merge semantics or hidden side stores.
- Mutating operator actions are intentionally gated.
  CLI and bootstrap mutation paths are first-class only for `WORLD_HOME` / `world-home-v1`; compatibility-path and ephemeral startups remain readable, but not first-class mutation targets.
- HTTP restore/import is intentionally path-restricted.
  Bootstrap actions only resolve managed artifact ids inside the active `WORLD_HOME/backups`, `exports`, and `imports` roots, not arbitrary absolute filesystem paths.
- Restoring derived runtime payloads may still require restart semantics.
  Canonical witness/observation truth is reloaded live, but derived runtime payload replacement remains truthful about when a restart is required instead of pretending universal hot swap.
- The operator lifecycle contract is now explicit, but some flows are still declarative rather than fully productized.
  Bootstrap state and runtime diagnostics already distinguish canonical truth kinds from derived/runtime kinds and declare supported flows like `repair-rebuild`, yet operator-owned reset/recovery UX beyond whole-world replace flows still remains incomplete.
- The MCP automation seam is now explicit, but still intentionally narrow.
  Authored `mcpServer` / `mcpToolInstall` objects, delegated vs service acting modes, install-time scope narrowing, first shipped tool catalogs, stdio bridging, and HTTP transport handling are real, but richer remote session models, broader tool families, and deeper review/operations surfaces still remain ahead.
- The HTTP MCP transport is now hardened as a local/operator seam, but still intentionally simple.
  It already enforces protocol-version negotiation, rejects cross-origin use, filters tool exposure by installed server scope, and supports bearer-token service access for service-mode installs, yet it is still not a broader remote multi-tenant automation boundary.
- The MCP product surface now has a real first slice, but it is still thin.
  Bootstrap now exposes dedicated MCP server/tool install/remove/proposal forms plus grouped server inventory, transport visibility, service-identity display, scope explanation, and active-runtime attachment state, yet richer review, remote-session, and broader automation operations surfaces still remain future work.
- The ecosystem trust model is currently metadata and diagnostics, not enforcement.
  Provenance, trust state, compatibility, and execution-boundary reasoning are surfaced now, but remote store mechanics, signature enforcement, review workflows, and update channels still remain future work.
- Runtime-plugin intent is now real world state and has a first useful product surface, but runtime operations are still incomplete.
  Bootstrap now exposes install/remove/proposal forms plus runner-scoped availability, installed-state, blocked/installable reason badges, and authored-composition review/detail panels for `runtimePlugin.install` / `runtimePlugin.remove`, yet reconcile/repair flows, store/update lifecycle, and broader trust operations still remain future work.
- The maintained demo project is now pluginized, but blank-world bootstrap is still a separate runtime path.
  The served example app proves authored plugin composition on `minimal`; bootstrap/tutorial continuity still depends on runtime-owned bundles and remains intentionally outside that migration slice for now.
- The maintained demo still depends on one explicit compatibility seam: `handlerSet = "demo"` currently causes the runtime to add `bundle-demo` at startup.
  That bundle ownership is now reported honestly, but the remaining demo behavior is not yet fully pluginized or authored away.
- The maintained demo's authored backend programs still rely on a narrower compatibility seam inside that bundle.
  Several shipped backend-program versions still call demo handler-set model helpers such as `todos.*Model`, `privateNotes.*Model`, `widgets.createModel`, and `network.simulateModel` rather than fully bundle-owned or authored executable seams.

---

## Secondary / Ongoing

These items matter, but they should not visually compete with the primary missing seams above.

### Canvas and Interaction

- [x] Add a first actor/perspective-scoped canvas undo/redo slice with witnessed compensation claims, HTTP actions, and log-derived replay of undo state.
- [x] Add a first canvas history/timeline slice with a read-only history view, scrub/play controls, and witness-derived playhead state on the canvas surface.
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
