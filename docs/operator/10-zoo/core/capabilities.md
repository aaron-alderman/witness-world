# Capabilities

## What it is

A first-class affordance object.

`capability` names something the system can provide, consume, install, remove, or require.

It is not only permission.

It also carries execution and runtime meaning.

## Where it appears

RVM treats `capability` as a first-class semantic form.

The semantic shape includes:

- `scope`
- `provides`
- `source`
- `state`
- `driver`

The broader authoring surface also exposes:

- `capabilityInstall`
- `capabilityRemove`

The public authoring policy explicitly treats capability work as supported.

## What an author uses it for

- define an affordance
- describe what it provides
- attach it to a target
- remove it from a target
- reason about runtime requirements
- reason about feature or integration availability

## What it relates to

A capability participates in:

- contexts
- boundaries
- routes and runtime consumers
- capability install targets
- runtime plugin and package authorship
- governance and proposal flows

## Why it is special

Without `capability`, the system cannot answer:

- what power is available here
- what power is missing here
- which targets may consume this affordance
- which runtime behaviors depend on it

That makes `capability` a privileged primitive rather than just another type label.

## Important distinction

There are two layers:

- capability definition
- capability installation on a target

Those should not be conflated.
