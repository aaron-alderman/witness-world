# 09 - Surfaces & Editing Grammar

## Role in Primary Intent

UI is expressed at the level of semantic intent (`surface` nodes in the kernel) rather than renderer-specific DOM. Every meaningful surface is inspectable and, when the actor has authority, directly editable in place. Changes are witnessed back into the world model. "Every Surface Is Potentially Editable."

## Core Desires / Intents

### 9.1 Semantic `surface` as the kernel-level UI description (renderer agnostic)
**Defined in:**
- DESIRE kernel: `surface` kind with bind/intents/view (screen, section, group, text, field, action, list, detail, when).
- Initial FieldKind set: text, multiline, toggle, select.
- "DOM tags, classes, layout atoms, and renderer hints are not kernel-level." — [../experiment/new-desire/DESIRE-KERNEL.md](../experiment/new-desire/DESIRE-KERNEL.md)

**Enacted:**
- Kernel definition: [../../src/desire/ir.js](../../src/desire/ir.js) includes "surface"
- Lowering produces surface nodes; concrete realization happens downstream.
- Runtime surface primitives: [../../src/runtime-surface-content-primitives.js](../../src/runtime-surface-content-primitives.js), form-controls, inspector-primitives, etc.

### 9.2 Editable-everywhere interaction grammar
Right-click → hide/inspect/show-witnesses/show-process/replace/upgrade. In-place theme, local mood, widget property, structure edits.

**Defined:**
- [../EXPERIENCE.md](../EXPERIENCE.md) (Every Surface Is Potentially Editable)
- [../CAPABILITIES.md](../CAPABILITIES.md#55-editable-everywhere-page-grammar), 5.4 (Live editable inspector)

**Enacted (real but narrow slices expanding):**
- [../../plugins/inspect/](../../plugins/inspect/) — surface-inspector-*, widget-page.js, widget-versions.js, world-surface-view
- Live inspector toggle on rendered pages.
- Non-versioned widgets can save text/title/class/hidden through real `widget.update` witness path when authorized.
- Versioned widgets use `widgetVersion.activate` / `rollback` proposals.
- Eden embedded board supports inspector + mutations without leaving the canvas.
- Theme / page chrome mutation via Edit Page (now flows through real model in Eden + live surfaces).

### 9.3 Versioned artifacts with witnessed activate / rollback / publish
**Enacted:**
- Widget versions, Eden versions panels.
- Proposal targets registered for governance.
- Changes refresh the live surface through the witness stream.

### 9.4 Safe local personalization as on-ramp (theme, light, typography, material, mood)
**Enacted:**
- Page theme / material editing surfaces (Eden + runtime presentation).
- WCSS authoring and runtime: [../../plugins/wcss-authoring/](../../plugins/wcss-authoring/), [../../plugins/wcss-runtime/](../../plugins/wcss-runtime/)
- [../../src/runtime-wcss-adapter.js](../../src/runtime-wcss-adapter.js)
- Uplift work (WHTML-WCSS) feeds authored parity without giving it authority.

### 9.5 Last-good-version + restore as first-class recovery (makes users brave)
Visible in the Todo board, Eden versions, and proposal flows.

## Concrete Rendering Paths (not kernel)
- Main runtime surface host: [../../src/runtime-surface-page.js](../../src/runtime-surface-page.js), runtime-surface-dom-host.js, runtime-surface-route-runtime.js
- Widget page renderer: runtime-widget-page.js + plugins/inspect/widget-page.js
- Canvas renderer: plugins/canvas/canvas-render-runtime.js
- Eden page document / styles / theme: plugins/eden/eden-page-*.js

## Honesty Notes
- Semantic surface intent level: present in kernel.
- Full editable-everywhere + in-place structure replacement: real but narrow (strongest on widget properties, versions, page chrome in Eden; broader app chrome and non-versioned widget trees still incomplete).
- "Replace/widget-structure mutation" and "wider property editing across authored app chrome" listed as missing.

## Cross References
- Semantic model from: 03 (DESIRE surface nodes)
- Execution/inspection of surfaces: 07
- Editing gated by: 06
- First experience surfaces: 08
- See [../CAPABILITIES.md](../CAPABILITIES.md#5-authoring-surfaces-and-editing-grammar)

## Key Documentation
- [../DESIRE.md](../DESIRE.md) (surface form, live program surface)
- [../CANVAS.md](../CANVAS.md) (spatial reading of surfaces)
- [../EXPERIENCE.md](../EXPERIENCE.md) (editable-everywhere, live inspector direction)
- [../CAPABILITIES.md](../CAPABILITIES.md#5-authoring-surfaces-and-editing-grammar) and subsections on inspector, command surface
