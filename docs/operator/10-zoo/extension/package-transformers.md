# Package Transformers

## What it is

A first-class convergence or migration contract between package lines.

`packageTransformer` explains how one package revision or namespace moves toward another instead of leaving that as an unwitnessed human story.

## Main fields

The current authored shape carries:

- `id`
- `package`
- `sourceRevision`
- `sourceNamespace`
- `targetRevision`
- `targetNamespace`
- `strategy`
- `status`
- `mappings`
- `remainingGlue`
- `notes`

## What an author uses it for

- describe revision-to-revision follow-up
- describe namespace-to-namespace migration
- state mapping rules between old and new shapes
- track unresolved glue explicitly

## What the current runtime does with it

Package apply preview and convergence inspection read transformer rows to determine whether a revision is:

- ready
- coexisting
- converging
- glue-required
- blocked

## Why it matters

Transformer rows are how the platform avoids pretending divergent authored lines already merge cleanly.

They make migration and convergence inspectable.
