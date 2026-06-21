# Package Dependencies

## What it is

A witnessed dependency edge from a package revision to another target.

`packageDependency` is not limited to package-to-package only.

It carries an explicit `targetKind`.

## Main fields

The current authored shape carries:

- `id`
- `sourcePackage`
- `sourceRevision`
- `targetKind`
- `targetId`
- `versionRange`
- `compatibility`
- `runtimeProfiles`

## What an author uses it for

- declare what a revision depends on
- target non-package concepts explicitly
- narrow the dependency to specific runtime profiles
- carry compatibility constraints

## Current relation shape

The runtime asserts both:

- a dependency row with its own identity
- a direct `dependsOnPackageTarget` relation from the source revision to the target

## Why it matters

Dependency is first-class because package inspection, apply preview, and compatibility reasoning need something more precise than an opaque manifest blob.
