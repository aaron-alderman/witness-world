# Runtime Preload

## What it is

A first-class runtime preload policy.

`runtimePreload` tells the surface/runtime layer what should be loaded ahead of need and when that load should happen.

## Main fields

The current authored shape carries:

- `id`
- `when`
- `targets`
- `context`

## Supported `when` kinds

Current normalize rules allow:

- `boot`
- `routeEnter`
- `idleAfterRoute`

Route-based preload rules currently require a `route`.

`idleAfterRoute` also requires `delayMs`.

## Supported target kinds

Current normalize rules allow:

- `route`
  - `route`
  - optional `command`
  - `load` from:
    - `manifest`
    - `capabilityAssets`
    - `command`
- `capability`
  - `capability`
  - `load` from:
    - `assets`

## What an author uses it for

- preload route manifests
- preload capability assets
- preload command payloads for route entry
- move load earlier than first interactive need

## Runtime use

The surface runtime filters preload policies against:

- routes actually reachable from the current root
- capabilities actually required by the current root surface

So preload is not a blind global bag.

It is interpreted against the active surface/runtime graph.
