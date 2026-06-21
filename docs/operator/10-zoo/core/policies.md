# Policies

## What it is

A first-class rule/governance object.

`policy` expresses how a subject moves through allowed, ready, disagreement, and outcome states.

It is not only documentation.

It changes runtime and governance interpretation.

## Where it appears

RVM treats `policy` as a first-class semantic form.

The semantic shape includes:

- `subject`
- `initialState`
- `stateField`
- `readyState`
- `disagreementState`
- `disagreementOutcomes`
- `policyOutcomes`

The public authoring policy explicitly treats policy authoring as supported.

## What an author uses it for

- define who or what a policy applies to
- describe allowed or blocked state transitions
- describe disagreement handling
- describe policy-level outcomes
- make governance explicit instead of implicit

## What it relates to

A policy participates in:

- actors and authority
- feature access
- proposal fallback
- route and runtime behavior
- process and state interpretation
- capability and mutation governance

## Why it is special

Without `policy`, the system cannot answer:

- what is allowed here
- what happens when authority is insufficient
- what disagreement means in this part of the system
- which state changes are considered ready, blocked, or unresolved

That makes `policy` a privileged primitive.
