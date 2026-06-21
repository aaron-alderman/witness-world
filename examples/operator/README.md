# Operator Example

`examples/operator` is the plugin-owned operator workbench example fixture.

It is intentionally not tied to Electron. The product boundary here is:

1. authored operator ontology
2. layout reduction
3. cell buffer
4. framebuffer seam
5. canvas presentation

This example has two authoring layers:

- `shell.rvm`
  - uses the repo's current `operator_*` plugin grammar
  - this is a legacy adapter over the deeper canonical operator model
- `browser/operator.workbench.rvm`
  - browser-first prototype layout grammar
  - this is an experimental presentation adapter, not canonical ontology truth

The canonical operator model now lives above both of those authoring layers:

1. compact ontology root
2. session sidecar
3. legacy browse projection mappings
4. adapter mappings for current workbench grammars
5. later presentation layout and appearance phases

## Run

```bash
npm run operator:example
```

Or, on Windows:

```bat
examples\operator\run.cmd
```

If you want the browser-only prototype without the Electron shell:

```bash
npm run operator:example:browser
```

If you want the plugin-owned raw shell adapter explicitly:

```bash
npm run operator:example:shell
```

`operator:example` now launches the plugin-owned workbench against this example fixture.

`operator:example:browser` keeps the browser-first prototype path available as an explicit utility surface.

`operator:example:shell` keeps the moved raw shell available as a plugin utility instead of a top-level CLI product command.

Offline fixture boot is intentionally a lower-level developer/testing path, not a primary product launcher:

```bash
node scripts/run-operator-browser-example.mjs --fixture
```

That path is opt-in and read-only; it exists for offline/testing workflows and should not be treated as the normal product boot path.

## What It Proves

- browser-first operator runtime can be authored outside Electron
- authored viewport definitions can lower into a deterministic cell buffer
- split handles, overlays, and text-reader scrolling belong in the runtime model, not ad hoc DOM layout
- AssemblyScript is pulled into the design early as the framebuffer seam instead of being deferred until the renderer is already coupled to the host

## Current Prototype Scope

- deterministic 80x30 viewport
- top status strip, left tree pane, right text-reader pane, bottom command bar
- draggable pane handles
- centered context-menu and help overlays
- horizontal and vertical scrolling inside the right text-reader surface
- typed-array cell buffer with future framebuffer lowering seam
- contiguous cell-memory map so the browser runtime already has a deterministic pre-pixel contract

## Files

- `browser/operator.workbench.rvm`
  - prototype authored ontology
- `browser/operator-rvm.js`
  - parser for the prototype ontology
- `browser/operator-runtime.js`
  - layout, cell composition, interaction, and canvas presentation
- `browser/operator-framebuffer.js`
  - JS framebuffer / contiguous cell-memory-map contract
- `browser/operator-framebuffer.as.ts`
  - AssemblyScript seam mirroring the framebuffer contract

## Lowering Check

```bash
npm run utility:operator-browser:wasm
```

This compiles the framebuffer seam to Wasm now, so the example does not postpone the JS-to-AssemblyScript boundary until after the renderer model is already fixed.
