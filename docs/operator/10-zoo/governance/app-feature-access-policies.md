# App Feature Access Policies

## What it is

A first-class per-feature access policy row.

`appFeatureAccessPolicy` expresses feature gating as witnessed data rather than scattered route guards.

## Main fields

The current body carries:

- `id`
- `featureId`
- `label`
- `appId`
- `requireAuth`
- `visibilityMode`
- `allowedRoles`
- `guestBehavior`
- `deniedBehavior`

## What an author uses it for

- decide whether a feature requires authentication
- allow or deny access by role
- choose guest behavior
- choose denied behavior
- hide or expose features intentionally

## Why it matters

Feature access is part of the modeled world.

It is not just an incidental UI conditional.
