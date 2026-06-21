# Materialized Views

## What it is

A first-class derived runtime cache or slice object.

`materializedView` is where the platform models persisted or maintained read models instead of treating them as invisible implementation detail.

## Main fields

The current body carries:

- `id`
- `title`
- `kind`
- `sliceKey`
- `modelView`
- `maintenance`
- `storageClass`
- `resourceBudgetClass`
- `blocking`
- `ttlMs`
- `sourceProjectors`
- `sourceWitnessProcesses`
- `invalidation`
- `values`

## What an author uses it for

- declare a maintained read model
- choose maintenance strategy
- choose storage class and budget class
- state invalidation inputs
- attach the view to projector or witness sources

## Why it matters

Materialized view is the runtime answer to:

- what expensive derived slice exists
- how is it maintained
- what invalidates it
- where does it source from
