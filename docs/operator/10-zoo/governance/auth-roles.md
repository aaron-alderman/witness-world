# Auth Roles

## What it is

A first-class named authorization role.

Current runtime stores auth roles as witnessed things with `hasModuleKind = authRole`.

## Main fields

The current body carries:

- `id`
- `label`
- `description`

## What an author uses it for

- define named permission groupings
- target feature policies
- grant or revoke role membership from identities

## Why it matters

Role is the bridge between identity and policy.

Without first-class role rows, access policy has no stable language for “who is allowed”.
