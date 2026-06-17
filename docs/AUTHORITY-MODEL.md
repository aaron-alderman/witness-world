# Authority Model

This repo now treats **actor** as the canonical acting authority.

Identity is adjacent, but different:

- **identity** is the authentication and profile shell
- **actor** is what acts in the world
- assumption grants are **identity -> actor**
- service execution uses the same authority tuple as direct and assumed execution

## Canonical Tuple

All runtime auth, session, and request resolution should normalize through one tuple:

- `authenticatedIdentity`
- `authenticatedActor`
- `effectiveIdentity`
- `effectiveActor`
- `authorityMode = "direct" | "assumed" | "service"`
- `assumptionGrantId`

Interpretation:

- `authenticated*` answers who signed in or established the session
- `effective*` answers who is acting now
- `effectiveIdentity` is optional because an actor does not need a 1:1 backing identity
- `assumptionGrantId` is only populated for explicit assumed authority

## Modes

### `direct`

The authenticated side and effective side resolve to the same actor.

This is the normal login case:

- `authenticatedIdentity = identity.aaron`
- `authenticatedActor = aaron`
- `effectiveIdentity = identity.aaron`
- `effectiveActor = aaron`

### `assumed`

The authenticated identity is allowed to act as a different target actor through an explicit grant.

Example:

- `authenticatedIdentity = identity.aaron`
- `authenticatedActor = aaron`
- `effectiveIdentity = identity.callan`
- `effectiveActor = callan`
- `authorityMode = "assumed"`
- `assumptionGrantId = "identity.aaron=>callan"`

Invalid states are rejected unless the matching assumption grant exists.

### `service`

Service-backed execution uses the same tuple model rather than a separate authority story.

In the current MCP/runtime slice, service mode typically resolves:

- `authenticatedActor = <service actor>`
- `effectiveActor = <service actor>`
- `authorityMode = "service"`

If the service actor also resolves to an identity, profile or feature projection may surface it as `effectiveIdentity`; otherwise that field remains `null`.

## Evaluation Rules

- access checks evaluate from **effective actor**
- role and feature evaluation follow the effective side
- authentication or profile shell concerns may still read from the authenticated side
- request/session/runtime code must not collapse the tuple back to one `identity` field

## Compatibility Aliases

The runtime still exposes compatibility aliases during migration:

- `session.identity` => effective identity
- `session.actor` => effective actor

These aliases are **not canonical truth**.

Allowed migration edges:

- legacy session HTTP response shapes
- existing client/session consumers
- tests that intentionally verify compatibility output

Internal runtime code should normalize through the tuple instead of reading those aliases directly.

## Runtime Inspection and Grant Management

The runtime now exposes first-class assumption-grant APIs before any impersonation UI exists:

- `GET /api/authority/grants`
- `POST /api/authority/grants`
- `DELETE /api/authority/grants/:grantId`

Grant semantics:

- grants are explicit `identity -> actor`
- duplicate active grants are rejected
- revocation preserves history/provenance and blocks new assumed sessions
- revocation does not retroactively invalidate existing sessions in this tranche

Inspection surfaces should expose the canonical tuple directly:

- `authenticatedIdentity`
- `authenticatedActor`
- `effectiveIdentity`
- `effectiveActor`
- `authorityMode`
- `assumptionGrantId`

If a response still includes `identity` or `actor`, those fields are compatibility aliases for the effective side only.
