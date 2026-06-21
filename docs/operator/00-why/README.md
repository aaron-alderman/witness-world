# Why

## North star

Build environments that explain themselves.

The platform is trying to make structure, authority, runtime, and change visible enough that:

- a human can inspect it
- an operator can navigate it
- an agent can act on it
- the runtime can execute it

without each of those consumers needing a different hidden model.

## Core intent

Prefer:

- explicit structure over convention hidden in code
- witnessed change over untracked mutation
- governed mutation over ambient authority
- inspectable runtime objects over invisible wiring
- shared semantic objects over duplicated product-specific models

## What this means in practice

Important things should be:

- addressable
- typed
- related explicitly
- owned by someone
- inspectable in evidence space
- navigable in operator space
- executable in runtime space

## Why the zoo exists

The object zoo is not there to be academically neat.

It exists so builders can answer:

- what exists
- how does it connect
- what can I change
- who can change it
- what evidence proves the current state

## Failure mode to avoid

Do not hide the real product model inside:

- incidental file layout
- private runtime state
- one-off UI conventions
- unnamed side effects

If the object is real, it should be modeled plainly enough that the operator, runtime, and authoring layers can all point at the same thing.
