# Packages

## What it is

A first-class authored extension/runtime unit.

`package` is the top-level object that groups an installable or publishable line before revisions, patches, namespaces, and transformers are applied to it.

## Main fields

The current authored shape carries:

- `id`
- `context`
- `label`
- `packageKind`
- `version`
- `description`
- `defaultNamespace`
- `exports`
- `provenance`
- `compatibleRuntimeProfiles`
- `compatibleShells`
- `runtimeFlavor`

## What an author uses it for

- define an extension line
- label and describe it
- say what concepts it exports
- state default namespace expectations
- declare runtime and shell compatibility

## What it relates to

A package is the parent object for:

- package revisions
- package patches
- package namespaces
- package dependencies
- package transformers

## Why it matters

`package` is the stable identity of an extension line.

It is not the patch stream itself and not the published bundle itself.

Those are separate objects layered on top of the package identity.
