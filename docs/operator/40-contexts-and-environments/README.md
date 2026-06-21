# Contexts And Environments

## Scope

Where things belong and where they execute.

This area answers two different questions:

- semantic scope: where is this object visible and local
- runtime environment: where does this object run or get served

Those are related, but they are not the same thing.

## Context

`context` is the semantic scope object.

It controls:

- naming
- visibility
- import/export
- local binding
- authored placement

Related objects:

- `context`
- `contextBinding`
- `contextExport`
- `contextImport`

## Environment

Environment is expressed through runtime and serving objects rather than one single primitive.

The current environment-defining objects are:

- `serverRunner`
- `mcpServer`
- `route`
- `serve`
- `runtimePreload`
- `materializedView`

## Server/client split

The current code-backed split is roughly:

- semantic authoring and interactive frontend consumption flow through `page.surface`
- runtime attachment and execution environment flow through `serverRunner`
- server-facing tool exposure flows through `mcpServer`
- route delivery flows through `route` and `serve`

This means "server" and "client" are not just labels. They are modeled through concrete runtime objects.

## What an author uses this area for

- decide where a thing belongs
- decide where a name is visible
- decide where a route is served
- decide which runtime hosts are attached
- decide which MCP server exposes which tools
- decide which preload behaviors apply

## Why this area is special

Without the context/environment layer, the system cannot answer:

- where is this object local
- where is this object visible
- which runtime owns this route
- which host serves this surface
- which server exposes this tool

This is why `context` and environment objects cannot be flattened into generic metadata.
