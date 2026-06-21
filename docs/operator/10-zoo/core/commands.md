# Commands

## What it is

A first-class action request object.

In the semantic core, `command` and `query` are specialized message roles.

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

- define an intended action
- define the request and response contract
- connect actions to route or boundary execution
- describe success and failure outcomes
- describe runtime refresh behavior
- describe multi-step action flow

## What it relates to

A command participates in:

- `process`
- `message`
- `boundary`
- `route`
- `surface` interactions
- runtime execution

## Query

`query` shares the same structural family as `command` but represents a read-oriented request rather than a mutation-oriented request.

## Why it matters

`command` is the clearest author-facing answer to:

- what action exists
- what inputs it takes
- what happens if it succeeds
- what happens if it fails
