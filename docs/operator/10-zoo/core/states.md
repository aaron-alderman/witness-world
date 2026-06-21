# States

## What it is

A first-class value-holding object.

In the semantic core, `state` and `value` lower to the same state family.

## Main fields

The semantic shape carries:

- `valueType`
- `initial`

## What an author uses it for

- declare owned values
- define initial runtime or process state
- provide typed storage for process transitions
- back request, loading, ready, or disagreement state

## What it relates to

A state participates in:

- `process`
- `policy`
- `command`
- `query`
- `surface` bindings
- route-state synchronization

## Why it matters

`state` is the concrete answer to:

- where does this value live
- what is its initial value
- what transitions read or write it
