# Stewardship

## What it is

A first-class authority edge.

Current stewardship relation:

- `steward --stewards--> target`

with optional `targetKind` metadata.

## Main fields

Current grant/revoke bodies carry:

- `steward`
- `target`
- `targetKind`

## What an author uses it for

- delegate authority without changing ownership
- authorize another actor over a context or target
- drive direct mutation checks such as `canAcceptInto(...)`

## Why it matters

Ownership is too blunt for collaborative operation.

Stewardship is the platform’s explicit delegated-authority lane.
