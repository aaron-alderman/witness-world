# Entities

## What it is

A first-class semantic domain object with explicit identity and storage hints.

Current entity shape is richer than a bare thing but still lives above the witness/thing/relation substrate.

## Main fields

Current semantic fields include:

- `context`
- `store`
- `identity`
- `versionRef`
- `fields`

## What an author uses it for

- define a durable domain record shape
- say which field identifies it
- say which field versions it
- place the entity in a context
- declare entity fields without collapsing into raw storage plumbing

## Why it matters

Entity is the main domain-shape bridge between:

- semantic modeling
- durable/runtime state
- rendered or operated-on records
