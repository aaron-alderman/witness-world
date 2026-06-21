# Who

## Scope

The identity and authority layer.

This area answers:

- who is acting
- who owns a thing
- who stewards a thing
- which roles an identity has
- which features an actor may access
- whose authority is sufficient for a mutation

## First-class concerns

- actors
- roles
- identity role grants
- stewardship
- app feature access policy
- proposal fallback when direct authority is absent

## Core rule

Identity is not ornamental metadata.

Identity changes:

- what actions are allowed
- which mutations are direct
- which mutations become proposals
- which witnesses count as authored by whom
- which contexts and targets are editable

## Main objects

- `actor`
  - the acting or owning subject
- `authRole`
  - a named role
- `identityRoleGrant`
  - assignment of role to identity
- `identityRoleRevoke`
  - removal of role from identity
- `stewardship`
  - delegated mutation authority over a target
- `appFeatureAccessPolicy`
  - role/auth-based access control for product features
- `proposal`
  - governed path when direct authority is absent

## Relationship to the rest of the model

The `who` layer cuts across:

- contexts
- capabilities
- policies
- widgets and surfaces
- packages and plugins
- routes and runtime operations
- witnesses and change history

It is not a secondary concern. It is part of how the system decides what reality may be changed by whom.
