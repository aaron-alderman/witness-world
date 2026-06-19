# Witness World Operator

This extension is the VS Code client for the collaborative operator environment described in [COLLABORATIVE-OPERATOR-ENVIRONMENT-PRODUCT-DIRECTION.md](../docs/COLLABORATIVE-OPERATOR-ENVIRONMENT-PRODUCT-DIRECTION.md).

Important boundary:

- this is a repo-local internal development extension for this repository
- it expects to run with the current repo opened as the workspace root
- it intentionally imports repo-relative runtime modules instead of shipping as a standalone packaged product
- it is not designed yet for marketplace publishing or use outside this repo checkout

Current v1 scope:

- detached and attached operator session posture inside VS Code
- app-project discovery from `app.wtoml`
- operator tree for targets, authored documents, source files, notes, and process blocks
- command palette workflow with `this`, aliases, source jumps, and deep links
- preview/runtime launch hooks through the existing `src/cli.js serve ...` path

This is intentionally an engine-backed repo client, not a pseudo-editor fork. It reuses the existing Witness World app-project loader and runtime CLI rather than rebuilding parallel session or mutation logic inside the extension.

## Local Development

Use the built-in launch harness in [.vscode/launch.json](../.vscode/launch.json):

- open this repo in VS Code
- run the `Witness World Operator` launch configuration
- the Extension Development Host opens this same repo as the workspace so `app.wtoml` discovery and repo-relative imports resolve correctly

## Validation

- Unit coverage: `npm run test:vscode-extension:unit`
- Host smoke coverage: `npm run test:vscode-extension:host`

The host smoke run launches a real Extension Development Host through the locally installed VS Code CLI, selects `examples/demo-todo-app/app.wtoml`, exercises the repo-local operator tree and command flow, starts a preview runtime, and verifies that a runtime URL is published.
