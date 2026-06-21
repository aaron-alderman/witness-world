# Events

## What it is

A first-class message with event role.

Current RVM `event` lowers to:

- `message`
  - `role = event`

## Main fields

Current semantic event fields include:

- `schema`
- `fields`
- `writes`

## What an author uses it for

- describe a happened outcome
- carry payload structure
- declare what state writes or effects the event implies
- serve as adapter success/failure outputs

## What it relates to

Events participate in:

- process handling
- command outcomes
- adapter success and failure flows
- runtime/state write models

## Why it matters

The platform distinguishes commands from events so authors can separate:

- intent
- outcome
