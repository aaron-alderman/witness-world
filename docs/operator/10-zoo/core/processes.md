# Processes

## What it is

A first-class execution and state-transition object.

`process` defines:

- owned state
- handled inputs
- emitted outputs
- transition rules

## Main fields

The semantic shape carries:

- `state`
- `handles`
- `emits`
- `rules`

The public authoring policy treats process authoring as supported through:

- `process.create`

## What an author uses it for

- own interactive or backend state
- react to messages
- emit messages or witnesses
- express transition rules
- provide the runtime owner behind interactive behavior

## What it relates to

A process participates in:

- `state`
- `message`
- `command`
- `query`
- `surface`
- `route` state synchronization
- runtime interactive state ownership

## Why it matters

`process` is the main answer to:

- where does this state live
- what handles this input
- what emits this outcome
