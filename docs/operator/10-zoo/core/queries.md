# Queries

## What it is

A first-class read-oriented request object.

In the semantic core, `query` is a specialized message role parallel to `command`.

## Main fields

The semantic shape carries:

- `fields`
- `messageKind`
- `route`
- `requestSchema`
- `responseSchema`
- `requestState`
- `loadingState`
- `successEvent`
- `failureEvent`
- `refreshRuntime`
- `sequence`
- `boundary`
- `steps`

## What an author uses it for

- define a structured read request
- define request and response contracts
- attach read behavior to route or boundary execution
- describe success and failure outcomes

## What it relates to

A query participates in:

- `message`
- `process`
- `boundary`
- `route`
- `surface` interactions

## Why it matters

`query` is the explicit answer to read intent.

It prevents read flows from being hidden inside mutation-oriented command semantics.
