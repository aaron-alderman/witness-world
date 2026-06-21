# Proposals

## What it is

A first-class governance object for deferred or shared approval.

Current proposal rows are created when a mutation should be reviewed rather than applied directly.

## Main fields

The current body carries:

- `id`
- `proposer`
- `targetProcess`
- `targetKind`
- `targetId`
- `body`
- `reason`
- `status`

Follow-up review rows carry:

- `approver` and `executedWitnessIds`
- or `reviewer` and rejection `reason`

## What an author uses it for

- request a governed mutation
- capture the intended target process and target object
- carry review reason and payload
- separate proposal creation from execution

## Runtime role

Current governance tables explicitly classify many operations as:

- `direct-authority`
- `proposal-fallback`
- `operator-only`

Proposal rows are the object used when the path is not direct-authority.

## Why it matters

The platform does not model approval as chat or side-channel convention.

It models approval as an inspectable object.
