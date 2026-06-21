# Package Patches

## What it is

A canonical authored patch row within a package revision.

`packagePatch` is the source-edit/change unit inside package authorship.

## Main fields

The current authored shape carries:

- `package`
- `revision`
- `ordinal`
- `path`
- `operation`
- `sourceLanguage`
- `transformer`
- `previousHash`
- `nextHash`
- `body`

The patch id is canonicalized from package patch content rather than being hand-authored.

## What an author uses it for

- add or update source within a revision
- bind change to a concrete package path
- express patch operation and source language
- connect a patch to a package transformer
- carry content-addressed before/after hashes

## What it relates to

Package patches hang off:

- a package
- a package revision
- optionally a package transformer

They are later materialized into bundles and preview rows.

## Why it matters

This is the concrete authored change stream for package evolution.

If package revision is the named line, package patch is the edit record inside that line.
