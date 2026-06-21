# Adapters

## What it is

An authored boundary operation that binds a command to a concrete transport or host operation.

In the RVM semantic layer, `adapter` lowers into a `boundary` operation rather than a separate top-level runtime kind.

## Main fields

Current adapter semantic fields include:

- `transport`
- `command`
- `operationKind`
- `method`
- `route`
- `hostOperation`
- `requestSchema`
- `responseSchema`
- `requestState`
- `actorState`
- `loadingState`
- `successEvent`
- `failureEvent`
- `refreshRuntime`
- `collectionOutputs`

## What an author uses it for

- bind a command to an external transport
- route command dispatch into a host operation
- declare the request/response schema contract
- connect command execution to success and failure events

## Why it matters

Without adapters, processes can emit commands but cannot explain how those commands cross the boundary into the outside world.
