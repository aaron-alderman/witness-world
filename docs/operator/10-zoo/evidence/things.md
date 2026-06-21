# Things

## What it is

The minimal “this exists” primitive.

At the claim level a thing is just:

- `thing(id)`

At the authored lane, `thing` is a first-class top-level form.

## What the current runtime does

`createThing(world, { actor, id, owner })` emits:

- `thing(id)`
- `relation(owner, "owns", id)`
- `relation(actor, "created", id)`

That means a created thing is immediately placed into ownership and creation history.

## What an author uses it for

- create a stable identity before richer structure exists
- establish ownership
- create graph anchors for later relations
- model domain objects that are not yet specialized into another module kind

## What it relates to

Most higher-order objects end up being things first and then gain shape through relations such as:

- `hasModuleKind`
- `inContext`
- `owns`
- other module-specific relations

So “thing” is the substrate identity and other module kinds refine it.

## Why it matters

If an object cannot first exist as an addressable thing, it cannot participate cleanly in:

- provenance
- ownership
- linking
- relation space
- operator inspection
