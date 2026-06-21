# Server Runners

## What it is

A first-class runtime environment object.

`serverRunner` binds runtime execution to concrete hosts and runtime configuration.

## Main fields

The authored shape carries:

- `backendHost`
- `frontendHost`
- `handlerSet`
- `actors`
- `storage`
- `runtimeConfig`
- `allowActorHeader`
- `hosts`
- `default`
- `context`

## What an author uses it for

- define a concrete runtime environment
- bind backend and frontend host ownership
- choose handler and storage setup
- attach runtime configuration
- decide host exposure

## Why it matters

`serverRunner` is one of the main objects that turns semantic content into a running environment.
