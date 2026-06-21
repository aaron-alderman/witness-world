# MCP Servers

## What it is

A first-class runtime exposure object.

`mcpServer` defines a tool-serving endpoint bound to a server runner.

## Main fields

The authored shape carries:

- `serverRunner`
- `serviceIdentity`
- `transports`
- `context`

Tool exposure is then extended through:

- `mcpToolInstall`

## What an author uses it for

- define a named MCP endpoint
- bind it to runtime execution
- choose transport exposure
- install tools onto that endpoint

## Why it matters

`mcpServer` is part of the concrete answer to:

- which tools exist here
- who serves them
- under which acting mode and scope
