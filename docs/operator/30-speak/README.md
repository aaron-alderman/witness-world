# Speak

## Canonical action families

The operator action surface must distinguish:

- ontology actions
  - inspect
  - open
  - link
  - search
  - reference
  - source
  - provenance
- session/view actions
  - navigate
  - filter
  - sort
  - help
- sanctioned mutation commands
  - edit
  - rename

## Scope

The sanctioned public action surface.

This area answers:

- what may be authored directly
- which actions are canonical
- which actions are legacy-only
- which runtime consumers rely on those actions

## Canonical write lane

The sanctioned mutation lane is MCP authoring.

The public write path exposed by policy is:

- `plugin.authoring`

## Supported public authoring concepts

Current supported concepts include:

- `surface`
  - `surface.create`
- `collection`
  - `collection.create`
- `process`
  - `process.create`
- `projection`
  - `projection.create`
- `type`
  - `type.create`
- `message`
  - `message.create`
- `boundary`
  - `boundary.create`
- `policy`
  - `policy.create`
- `capability`
  - `capability.create`
  - `capability.update`
  - `capability.install`
  - `capability.remove`
  - `capability.rollback`
  - `capability.migrateLegacy`
- `computeModule`
  - `computeModule.create`
  - `computeModule.source.upsert`
  - `computeModule.source.markDeleted`
  - `computeModuleSmokeTest.upsert`
  - `computeModuleSmokeTest.markDeleted`
  - `computeModuleSmokeTest.run`
- `package`
  - `package.create`
  - `packageRevision.create`
  - `packageRevision.publish`
  - `packagePatch.source.upsert`
  - `packageNamespace.create`
  - `packageDependency.create`
  - `packageTransformer.create`
- legacy bridge
  - `frontend.upliftLegacy`

## Legacy-only concepts

Current policy marks these as legacy-only rather than current canonical authoring:

- `widget`
- `frontendProgram`
- `frontendStep`

## Main runtime consumer

The main canonical runtime consumer is:

- `page.surface`

It currently consumes:

- `surface`
- `collection`
- `process`
- `projection`
- `message`
- `boundary`
- `policy`

## Why this matters

The `speak` layer is the answer to:

- what is the sanctioned verb here
- is this object current or legacy
- what runtime consumes the result of this action

It is also where we keep ontology verbs separate from:

- session-local view mechanics
- presentation shortcuts
- legacy workbench adapter commands
