# Types

## What it is

A first-class semantic type family rather than one single object shape.

Current RVM produces type-like rows through forms such as:

- `enum`
- `version`
- `value`
- `state`

## Current roles

Observed roles include:

- enum
- version
- state

`value` and `state` currently normalize through the `state` semantic shape with:

- `valueType`
- `initial`

## What an author uses it for

- define named value domains
- define state shapes with initial values
- define enums
- define version markers and version fields

## Runtime usage

The interactive/runtime surface reads `desire.defineType` rows directly, especially for state-oriented runtime setup.

## Why it matters

Authors cannot model behavior cleanly without stable type declarations.

Type is part of the first list because every other area depends on it.
