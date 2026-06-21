# Frontend Programs

## What it is

A legacy witnessed frontend orchestration object.

`frontendProgram` points at a root widget and then accumulates `frontendStep` rows.

## Main fields

The current body carries:

- `id`
- `rootWidget`
- `context`

Related step rows carry:

- `program`
- `event`
- `op`
- `order`
- `params`
- `when`
- `repeat`
- `after`

## What an author uses it for

- bind a widget tree into a runnable frontend flow
- sequence frontend steps by event and order
- express legacy interactive behavior over widget trees

## Current status

The public authoring policy currently treats:

- `frontendProgram`
- `frontendStep`

as legacy-only rather than the main canonical authoring lane.

## Why it matters

This still exists in the platform and still appears in the operator taxonomy, so builders need to recognize it even though `surface` is the preferred direction.
