# Widgets

## What it is

A legacy witnessed UI object family.

Current widget runtime supports:

- widget definitions
- widget versions
- widget version transitions
- widget attachment
- frontend program targeting

## Main fields

Base widget rows carry:

- `id`
- `kind`
- `props`
- `context`

Versioned widget rows additionally carry:

- `soul`
- `version`
- `index`

Transition rows carry:

- `soul`
- `from`
- `to`
- `strategy`

## What an author uses it for

- define legacy UI structure
- version widget implementations
- activate a version for a widget soul
- attach widgets into trees

## Current status

The public authoring policy currently marks `widget` as legacy-only rather than the main canonical authoring lane.

## Why it matters

Widgets still back real runtime and operator-visible state.

They are not the future north-star, but they are still part of the real platform zoo.
