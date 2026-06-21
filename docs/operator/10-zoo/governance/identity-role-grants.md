# Identity Role Grants

## What it is

A witnessed grant or revoke edge between an identity and an auth role.

Current grant relation:

- `identityId --hasAuthRole--> roleId`

## Main fields

Current grant/revoke bodies carry:

- `identityId`
- `roleId`

## What an author uses it for

- assign a role to an identity
- remove a role from an identity
- drive feature-access checks and policy evaluation

## Why it matters

Roles do not matter unless their assignment is explicit, inspectable, and reversible.
