# Package Revisions

## What it is

A named authored state of a package line.

`packageRevision` separates package identity from a specific revision that can be inspected, published, previewed, or superseded.

## Main fields

The current authored shape carries:

- `id`
- `package`
- `version`
- `status`
- `supersedes`
- `emittedBundleHash`
- `manifest`
- `compatibility`

## What an author uses it for

- create a draft or published revision
- mark revision lineage through `supersedes`
- bind a revision to bundle material
- attach compatibility metadata

## Current lifecycle

The current runtime emits both:

- `definePackageRevision`
- `publishPackageRevision`

So draft and publish are separate witnessed steps even though they share the same normalized shape.

## Why it matters

Revision is the unit that package apply preview, coexistence, and convergence reasoning operate over.

Without revision rows, “the package” is too coarse to explain what line is being inspected or promoted.
