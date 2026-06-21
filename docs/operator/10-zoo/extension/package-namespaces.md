# Package Namespaces

## What it is

A witnessed namespace binding between a context and a package line.

`packageNamespace` exists so package coexistence is explicit rather than hidden behind filename tricks or implicit merge behavior.

## Main fields

The current authored shape carries:

- `id`
- `context`
- `name`
- `package`
- `revision`
- `visibility`

## What an author uses it for

- bind a package name inside a context
- choose whether the binding is revision-specific
- make coexistence explicit
- control namespace visibility

## Current relation shape

The current runtime asserts:

- the namespace row is `inContext`
- it `namesPackage`
- the context `bindsPackageNamespace:<name>` to the namespace row

## Why it matters

Package namespace is one of the main tools the platform uses to explain coexistence without collapsing multiple authored lines into a fake single version.
