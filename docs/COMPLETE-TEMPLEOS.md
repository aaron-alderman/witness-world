# Complete TempleOS

## Thesis

TempleOS made the computer personally inhabitable. Witness World should make a connected world computationally inhabitable without surrendering truth, agency, or inspectability.

TempleOS' failure mode was purity through isolation: one machine model, one authorial universe, one truth surface, and no honest way for plurality or external systems to enter.

Witness World should complete the useful part of that idea by making external relation explicit instead of forbidden.

## Dependency Honesty

Witness World is not dependency-free. It is dependency-honest.

A dependency is acceptable only when its authority is named, bounded, witnessed, inspectable, and replaceable.

This turns integration into a modeled relation:

- what depends on it
- what capability it provides
- which boundary it crosses
- who or what owns it
- what evidence records its use
- whether it is authoritative, fallback, legacy, or blocked

## V1 Shell Contract

The first concrete tranche is a shared runtime substrate plus a canonical operator API.

Every meaningful runtime object surfaced there should be:

- addressable
- typed
- related
- owned or provider-attributed
- inspectable
- witnessed or observation-backed
- ready for later challenge, revoke, or replacement flows

V1 is intentionally read-only. It makes the live system visible before adding new authority controls.

## Operating Surface

The operating surface is not an inspect-owned page. It is a shared substrate consumed through a dedicated operator contract.

It must answer:

- what exists
- what is running
- what has authority
- what changed recently
- what is connected to the outside world
- what can be inspected next

The first System Overview tranche focuses on capabilities, boundaries, runtime health, processes, sources, proofs, external systems, and recent evidence.

Concretely:

- `inspect` owns low-level read/debug endpoints only
- operator consumers converge on `/api/operator/*`
- System Overview logic is shared projection substrate, not a browser page
