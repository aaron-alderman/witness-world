import assert from "node:assert/strict";
import test from "node:test";
import { renderSurfacePage } from "../src/runtime-surface-page.js";

function fakeWorld(witnesses) {
  return {
    allWitnesses() {
      return witnesses;
    }
  };
}

test("runtime-surface-page composes static surface HTML with the generic interaction runtime", () => {
  const html = renderSurfacePage(fakeWorld([
    {
      process: "desire.defineType",
      body: { id: "StatusText", role: "state", valueType: "text", initial: "idle" }
    },
    {
      process: "desire.defineMessage",
      body: { id: "SignInRequested", role: "event", writes: { StatusText: "signedIn" } }
    },
    {
      process: "desire.defineProcess",
      body: {
        id: "ShellNavigation",
        state: ["StatusText"],
        handles: ["SignInRequested"],
        emits: [],
        rules: []
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "SurfaceRoot",
        surfaceKind: "app-root",
        processRef: "ShellNavigation",
        children: ["PrimaryAction"]
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "PrimaryAction",
        surfaceKind: "action",
        props: {
          tag: "button",
          domId: "primary-action",
          label: "Sign in"
        },
        interactions: [
          {
            target: "self",
            event: "click",
            action: { kind: "deliver", message: "SignInRequested" }
          }
        ]
      }
    }
  ]), {
    rootSurfaceId: "SurfaceRoot",
    requestPathname: "/login"
  });

  assert.match(html, /<button id="primary-action">Sign in<\/button>/);
  assert.match(html, /surfaceRuntimeManifest/);
  assert.match(html, /SignInRequested/);
  assert.match(html, /createSurfaceInteractionRuntime/);
  assert.match(html, /function normalizeCapabilityAssets/);
  assert.doesNotMatch(html, /export function createProcessRuntime/);
  assert.doesNotMatch(html, /routeSurfaceFragments/);
  assert.doesNotMatch(html, /\sdata-[a-z0-9-]+=/i);
});

test("runtime-surface-page emits generic fallback ids for interactive surfaces without authored domId", () => {
  const html = renderSurfacePage(fakeWorld([
    {
      process: "desire.defineMessage",
      body: { id: "OpenMillCharge", role: "event", writes: {} }
    },
    {
      process: "desire.defineProcess",
      body: {
        id: "ShellNavigation",
        state: [],
        handles: ["OpenMillCharge"],
        emits: [],
        rules: []
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "SurfaceRoot",
        surfaceKind: "app-root",
        processRef: "ShellNavigation",
        children: ["ModuleCardMillCharge"]
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "ModuleCardMillCharge",
        surfaceKind: "module-card",
        props: {
          tag: "div",
          routeKey: "mill-charge",
          title: "Mill Charge Motion"
        },
        interactions: [
          {
            target: "self",
            event: "click",
            action: { kind: "deliver", message: "OpenMillCharge" }
          }
        ]
      }
    }
  ]), {
    rootSurfaceId: "SurfaceRoot",
    requestPathname: "/home"
  });

  assert.match(html, /<div id="surface-modulecardmillcharge"/);
  assert.match(html, /"rootId":"surface-modulecardmillcharge"/);
  assert.match(html, /"interactionTargets":\{"self":\[\{"id":"surface-modulecardmillcharge"\}\]\}/);
  assert.doesNotMatch(html, /\sdata-[a-z0-9-]+=/i);
});

test("runtime-surface-page projects authored input tags with normal form attributes", () => {
  const html = renderSurfacePage(fakeWorld([
    {
      process: "desire.defineType",
      body: { id: "MillChargeSpeedFrac", role: "state", valueType: "number", initial: 0.75 }
    },
    {
      process: "desire.defineProcess",
      body: {
        id: "MillChargeControls",
        state: ["MillChargeSpeedFrac"],
        handles: [],
        emits: [],
        rules: []
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "SurfaceRoot",
        surfaceKind: "app-root",
        processRef: "MillChargeControls",
        children: ["SpeedInput"]
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "SpeedInput",
        surfaceKind: "input",
        className: "mill-slider",
        props: {
          tag: "input",
          domId: "speed-input",
          inputType: "range",
          min: 0.4,
          max: 0.99,
          step: 0.01,
          value: 0.75
        },
        bindings: [
          { prop: "value", source: { kind: "state", state: "MillChargeSpeedFrac" } }
        ],
        interactions: [
          {
            target: "self",
            event: "input",
            action: { kind: "setState", state: "MillChargeSpeedFrac", value: { kind: "eventValue" } }
          }
        ]
      }
    }
  ]), {
    rootSurfaceId: "SurfaceRoot",
    requestPathname: "/mill-charge"
  });

  assert.match(html, /<input id="speed-input" class="[^"]*mill-slider[^"]*" type="range" min="0.4" max="0.99" step="0.01" value="0.75">/);
  assert.match(html, /"event":"input"/);
  assert.match(html, /"kind":"eventValue"/);
  assert.doesNotMatch(html, /\sdata-[a-z0-9-]+=/i);
});

test("runtime-surface-page projects authored select options with value and selected attributes", () => {
  const html = renderSurfacePage(fakeWorld([
    {
      process: "desire.defineType",
      body: { id: "DistributionKind", role: "state", valueType: "text", initial: "normal" }
    },
    {
      process: "desire.defineProcess",
      body: {
        id: "DistributionEditor",
        state: ["DistributionKind"],
        handles: [],
        emits: [],
        rules: []
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "SurfaceRoot",
        surfaceKind: "app-root",
        processRef: "DistributionEditor",
        children: ["DistributionSelect"]
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "DistributionSelect",
        surfaceKind: "select",
        props: { tag: "select", domId: "dist-select" },
        children: ["DistFixed", "DistNormal"],
        bindings: [
          { prop: "value", source: { kind: "state", state: "DistributionKind" } }
        ],
        interactions: [
          {
            target: "self",
            event: "change",
            action: { kind: "setState", state: "DistributionKind", value: { kind: "eventValue" } }
          }
        ]
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "DistFixed",
        surfaceKind: "option",
        props: { tag: "option", value: "fixed", text: "fixed" }
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "DistNormal",
        surfaceKind: "option",
        props: { tag: "option", value: "normal", text: "normal" }
      }
    }
  ]), {
    rootSurfaceId: "SurfaceRoot",
    requestPathname: "/editor"
  });

  assert.match(html, /<select id="dist-select">/);
  assert.match(html, /<option value="fixed">fixed<\/option>/);
  assert.match(html, /<option value="normal" selected>normal<\/option>/);
  assert.match(html, /"value":\[\{"id":"dist-select","mode":"value"\}\]/);
  assert.doesNotMatch(html, /\sdata-[a-z0-9-]+=/i);
});

test("runtime-surface-page respects visible binding map defaults during initial projection", () => {
  const html = renderSurfacePage(fakeWorld([
    {
      process: "desire.defineType",
      body: { id: "ActiveRoute", role: "state", valueType: "text", initial: "mill-force" }
    },
    {
      process: "desire.defineProcess",
      body: {
        id: "ShellNavigation",
        state: ["ActiveRoute"],
        handles: [],
        emits: [],
        rules: []
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "SurfaceRoot",
        surfaceKind: "app-root",
        processRef: "ShellNavigation",
        children: ["GoodmanToolbar", "MillForceBody"]
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "GoodmanToolbar",
        surfaceKind: "toolbar-region",
        props: { domId: "tb-goodman-tools", text: "Goodman Toolbar" },
        bindings: [
          { prop: "visible", source: { kind: "state", state: "ActiveRoute", map: { goodman: true, default: false } } }
        ]
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "MillForceBody",
        surfaceKind: "body",
        props: { domId: "mill-force-body", text: "Mill Force" }
      }
    }
  ]), {
    rootSurfaceId: "SurfaceRoot",
    requestPathname: "/engentus/mill-force"
  });

  assert.doesNotMatch(html, /<div id="tb-goodman-tools"/);
  assert.match(html, /mill-force-body/);
});

test("runtime-surface-page projects the standard authored form-control baseline", () => {
  const html = renderSurfacePage(fakeWorld([
    {
      process: "desire.defineType",
      body: { id: "NotesValue", role: "state", valueType: "text", initial: "initial notes" }
    },
    {
      process: "desire.defineType",
      body: { id: "AgreedValue", role: "state", valueType: "bool", initial: true }
    },
    {
      process: "desire.defineType",
      body: { id: "SubmitDisabled", role: "state", valueType: "bool", initial: true }
    },
    {
      process: "desire.defineType",
      body: { id: "StatusCopy", role: "state", valueType: "text", initial: "Ready" }
    },
    {
      process: "desire.defineType",
      body: { id: "StatusTone", role: "state", valueType: "text", initial: "ok" }
    },
    {
      process: "desire.defineType",
      body: { id: "SelectedMode", role: "state", valueType: "text", initial: "manual" }
    },
    {
      process: "desire.defineType",
      body: { id: "DetailOpen", role: "state", valueType: "bool", initial: true }
    },
    {
      process: "desire.defineProcess",
      body: {
        id: "FormProcess",
        state: ["NotesValue", "AgreedValue", "SubmitDisabled", "StatusCopy", "StatusTone", "SelectedMode", "DetailOpen"],
        handles: [],
        emits: [],
        rules: []
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "SurfaceRoot",
        surfaceKind: "app-root",
        processRef: "FormProcess",
        children: ["NotesLabel", "NotesTextarea", "AgreeInput", "ModeManualRadio", "ModeAutoRadio", "SubmitButton", "DetailToggle", "StatusText"]
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "NotesLabel",
        surfaceKind: "label",
        props: { tag: "label", for: "notes-input", text: "Notes" }
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "NotesTextarea",
        surfaceKind: "textarea",
        props: {
          tag: "textarea",
          domId: "notes-input",
          name: "notes",
          placeholder: "Write notes",
          value: "stale notes",
          title: "Notes field"
        },
        bindings: [
          { prop: "value", source: { kind: "state", state: "NotesValue" } }
        ],
        interactions: [
          {
            target: "self",
            event: "input",
            action: { kind: "setState", state: "NotesValue", value: { kind: "eventValue" } }
          }
        ]
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "AgreeInput",
        surfaceKind: "input",
        props: {
          tag: "input",
          domId: "agree-input",
          inputType: "checkbox",
          name: "agreed",
          checked: false
        },
        bindings: [
          { prop: "checked", source: { kind: "state", state: "AgreedValue" } }
        ],
        interactions: [
          {
            target: "self",
            event: "change",
            action: { kind: "setState", state: "AgreedValue", value: { kind: "eventChecked" } }
          }
        ]
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "ModeManualRadio",
        surfaceKind: "input",
        props: {
          tag: "input",
          domId: "mode-manual",
          inputType: "radio",
          name: "mode",
          value: "manual",
          checked: false
        },
        bindings: [
          { prop: "checked", source: { kind: "state", state: "SelectedMode", map: { manual: true }, default: false } }
        ]
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "ModeAutoRadio",
        surfaceKind: "input",
        props: {
          tag: "input",
          domId: "mode-auto",
          inputType: "radio",
          name: "mode",
          value: "auto"
        },
        bindings: [
          { prop: "checked", source: { kind: "state", state: "SelectedMode", map: { auto: true }, default: false } }
        ]
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "SubmitButton",
        surfaceKind: "action",
        props: {
          tag: "button",
          buttonType: "submit",
          disabled: true,
          title: "Cannot submit yet",
          label: "Submit"
        },
        bindings: [
          { prop: "disabled", source: { kind: "state", state: "SubmitDisabled" } }
        ]
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "DetailToggle",
        surfaceKind: "action",
        props: {
          tag: "button",
          domId: "detail-toggle",
          buttonType: "button",
          label: "Details",
          htmlRole: "button",
          ariaControls: "detail-panel",
          ariaExpanded: false
        },
        bindings: [
          { prop: "ariaExpanded", source: { kind: "state", state: "DetailOpen" } }
        ]
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "StatusText",
        surfaceKind: "text",
        className: "status",
        props: { tag: "p", text: "Stale" },
        bindings: [
          { prop: "text", source: { kind: "state", state: "StatusCopy" } },
          { prop: "className", source: { kind: "state", state: "StatusTone" } }
        ]
      }
    }
  ]), {
    rootSurfaceId: "SurfaceRoot",
    requestPathname: "/form"
  });

  assert.match(html, /<label for="notes-input">Notes<\/label>/);
  assert.match(html, /<textarea id="notes-input" title="Notes field" placeholder="Write notes" name="notes">initial notes<\/textarea>/);
  assert.match(html, /<input id="agree-input" type="checkbox" name="agreed" checked>/);
  assert.match(html, /<input id="mode-manual" type="radio" name="mode" value="manual" checked>/);
  assert.match(html, /<input id="mode-auto" type="radio" name="mode" value="auto">/);
  assert.match(html, /<button(?: id="surface-submitbutton")? title="Cannot submit yet" type="submit" disabled>Submit<\/button>/);
  assert.match(html, /<button id="detail-toggle" role="button" aria-controls="detail-panel" aria-expanded="true" type="button">Details<\/button>/);
  assert.match(html, /<p(?: id="surface-statustext")? class="status ok">Ready<\/p>/);
  assert.match(html, /"value":\[\{"id":"notes-input","mode":"value"\}\]/);
  assert.match(html, /"checked":\[\{"id":"agree-input","mode":"checked"\}\]/);
  assert.match(html, /"ariaExpanded":\[\{"id":"detail-toggle","mode":"attribute","attr":"aria-expanded","falseAsValue":true\}\]/);
  assert.match(html, /"kind":"eventChecked"/);
  assert.doesNotMatch(html, /\sdata-[a-z0-9-]+=/i);
});

test("runtime-surface-page keeps title-only action props out of visible button body", () => {
  const html = renderSurfacePage(fakeWorld([
    {
      process: "desire.defineSurface",
      body: {
        id: "SurfaceRoot",
        surfaceKind: "app-root",
        children: ["ActionWithTooltip"]
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "ActionWithTooltip",
        surfaceKind: "action",
        props: { tag: "button", title: "Sample from distribution", buttonType: "button" },
        children: ["ToggleTrack", "ToggleText"]
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "ToggleTrack",
        surfaceKind: "generic",
        props: { tag: "span", text: "track" }
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "ToggleText",
        surfaceKind: "generic",
        props: { tag: "span", text: "free" }
      }
    }
  ]), {
    rootSurfaceId: "SurfaceRoot",
    requestPathname: "/tooltip"
  });

  assert.match(html, /<button(?: id="surface-actionwithtooltip")? title="Sample from distribution" type="button"><span>track<\/span><span>free<\/span><\/button>/);
  assert.doesNotMatch(html, /<h1>Sample from distribution<\/h1>/);
});

test("runtime-surface-page omits surfaces whose initial visible binding resolves false", () => {
  const rendered = [];
  const html = renderSurfacePage(fakeWorld([
    {
      process: "desire.defineType",
      body: { id: "ActiveMode", role: "state", valueType: "text", initial: "static" }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "SurfaceRoot",
        surfaceKind: "app-root",
        children: ["StaticChart", "MonteCarloChart"]
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "StaticChart",
        surfaceKind: "chart",
        capabilityRefs: ["chart.render"],
        bindings: [
          { prop: "visible", source: { kind: "state", state: "ActiveMode", map: { mc: false }, default: true } }
        ]
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "MonteCarloChart",
        surfaceKind: "chart",
        capabilityRefs: ["chart.render"],
        bindings: [
          { prop: "visible", source: { kind: "state", state: "ActiveMode", map: { mc: true }, default: false } }
        ]
      }
    }
  ]), {
    rootSurfaceId: "SurfaceRoot",
    requestPathname: "/charts",
    surfaceCapabilityRenderers: [{
      id: "test.chart",
      capability: "chart.render",
      factory() {
        return {
          capability: "chart.render",
          renderSurface(surface) {
            if (surface?.surfaceKind !== "chart") return null;
            rendered.push(surface.id);
            return `<figure>${surface.id}</figure>`;
          }
        };
      }
    }]
  });

  assert.deepEqual(rendered, ["StaticChart"]);
  assert.match(html, /<figure>StaticChart<\/figure>/);
  assert.doesNotMatch(html, /<figure>MonteCarloChart<\/figure>/);
});

test("runtime-surface-page does not pre-render inactive route fragments into the initial payload", () => {
  const rendered = [];
  const html = renderSurfacePage(fakeWorld([
    {
      process: "desire.defineType",
      body: { id: "ActiveChartTab", role: "state", valueType: "text", initial: "cross" }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "SurfaceRoot",
        surfaceKind: "app-root",
        children: ["HomeRoute", "ForceRoute"]
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "HomeRoute",
        surfaceKind: "app-shell",
        props: { routeKey: "home", routePath: "/home", text: "Home" }
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "ForceRoute",
        surfaceKind: "app-shell",
        props: { routeKey: "force", routePath: "/force" },
        children: ["ForceCrossChart", "ForceAngleChart"]
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "ForceCrossChart",
        surfaceKind: "chart",
        bindings: [
          { prop: "visible", source: { kind: "state", state: "ActiveChartTab", map: { cross: true }, default: false } }
        ]
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "ForceAngleChart",
        surfaceKind: "chart",
        bindings: [
          { prop: "visible", source: { kind: "state", state: "ActiveChartTab", map: { force: true }, default: false } }
        ]
      }
    }
  ]), {
    rootSurfaceId: "SurfaceRoot",
    requestPathname: "/home",
    surfaceCapabilityRenderers: [{
      id: "test.chart",
      capability: "chart.render",
      factory() {
        return {
          capability: "chart.render",
          renderSurface(surface) {
            if (surface?.surfaceKind !== "chart") return null;
            rendered.push(surface.id);
            return `<figure>${surface.id}</figure>`;
          }
        };
      }
    }]
  });

  assert.deepEqual(rendered, []);
  assert.doesNotMatch(html, /routeSurfaceFragments/);
  assert.doesNotMatch(html, /<figure>ForceCrossChart<\/figure>/);
  assert.doesNotMatch(html, /<figure>ForceAngleChart<\/figure>/);
});

test("runtime-surface-page skips capability renderer factories when the active route does not require them", () => {
  let rendererFactoryCalls = 0;
  const html = renderSurfacePage(fakeWorld([
    {
      process: "desire.defineMessage",
      body: { id: "SignInRequested", role: "event", writes: {} }
    },
    {
      process: "desire.defineProcess",
      body: {
        id: "ShellNavigation",
        state: [],
        handles: ["SignInRequested"],
        emits: [],
        rules: []
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "SurfaceRoot",
        surfaceKind: "app-root",
        processRef: "ShellNavigation",
        children: ["LoginRoute", "GoodmanRoute"]
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "LoginRoute",
        surfaceKind: "auth-screen",
        props: { routeKey: "login", routePath: "/login" },
        children: ["PrimaryAction"]
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "PrimaryAction",
        surfaceKind: "action",
        props: {
          tag: "button",
          domId: "primary-action",
          label: "Sign in"
        },
        interactions: [
          {
            target: "self",
            event: "click",
            action: { kind: "deliver", message: "SignInRequested" }
          }
        ]
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "GoodmanRoute",
        surfaceKind: "app-shell",
        props: { routeKey: "goodman", routePath: "/goodman" },
        capabilityRefs: ["chart.render"]
      }
    }
  ]), {
    rootSurfaceId: "SurfaceRoot",
    requestPathname: "/login",
    surfaceCapabilityRenderers: [{
      id: "test.chart",
      capability: "chart.render",
      factory() {
        rendererFactoryCalls += 1;
        return {
          capability: "chart.render",
          renderSurface() {
            return null;
          }
        };
      }
    }]
  });

  assert.match(html, /<button id="primary-action">Sign in<\/button>/);
  assert.equal(rendererFactoryCalls, 0);
});

test("runtime-surface-page serializes active capability assets into the runtime manifest", () => {
  const html = renderSurfacePage(fakeWorld([
    {
      process: "desire.defineProcess",
      body: {
        id: "ShellNavigation",
        state: [],
        handles: [],
        emits: [],
        rules: []
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "SurfaceRoot",
        surfaceKind: "app-root",
        processRef: "ShellNavigation",
        children: ["ChartRoute"]
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "ChartRoute",
        surfaceKind: "chart",
        capabilityRefs: ["chart.render"]
      }
    }
  ]), {
    rootSurfaceId: "SurfaceRoot",
    requestPathname: "/chart",
    surfaceCapabilityRenderers: [{
      id: "test.chart",
      capability: "chart.render",
      factory() {
        return {
          capability: "chart.render",
          stylesheetHrefs: ["/chart.css"],
          scriptSrcs: ["/chart.js"],
          inlineCss: ".chart{display:block}",
          scriptBody: "window.__chartBoot = true;",
          renderSurface() {
            return "<figure>chart</figure>";
          }
        };
      }
    }]
  });

  assert.match(html, /"capabilityAssets":\{/);
  assert.match(html, /"stylesheetHrefs":\["\/chart\.css"\]/);
  assert.match(html, /"scriptSrcs":\["\/chart\.js"\]/);
  assert.match(html, /"inlineCss":\["\.chart\{display:block\}"\]/);
  assert.match(html, /"scriptBodies":\["window\.__chartBoot = true;"\]/);
});

test("runtime-surface-page reuses cached world-derived surface data across repeated renders", () => {
  let witnessReads = 0;
  const witnesses = [
    {
      process: "desire.defineType",
      body: { id: "StatusText", role: "state", valueType: "text", initial: "idle" }
    },
    {
      process: "desire.defineMessage",
      body: { id: "SignInRequested", role: "event", writes: { StatusText: "signedIn" } }
    },
    {
      process: "desire.defineProcess",
      body: {
        id: "ShellNavigation",
        state: ["StatusText"],
        handles: ["SignInRequested"],
        emits: [],
        rules: []
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "SurfaceRoot",
        surfaceKind: "app-root",
        processRef: "ShellNavigation",
        children: ["PrimaryAction"]
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "PrimaryAction",
        surfaceKind: "action",
        props: {
          tag: "button",
          domId: "primary-action",
          label: "Sign in"
        },
        interactions: [
          {
            target: "self",
            event: "click",
            action: { kind: "deliver", message: "SignInRequested" }
          }
        ]
      }
    }
  ];
  const world = {
    allWitnesses() {
      witnessReads += 1;
      return witnesses;
    }
  };

  const firstHtml = renderSurfacePage(world, {
    rootSurfaceId: "SurfaceRoot",
    requestPathname: "/login"
  });
  const readsAfterFirstRender = witnessReads;
  const secondHtml = renderSurfacePage(world, {
    rootSurfaceId: "SurfaceRoot",
    requestPathname: "/login"
  });

  assert.match(firstHtml, /<button id="primary-action">Sign in<\/button>/);
  assert.equal(secondHtml, firstHtml);
  assert.equal(readsAfterFirstRender > 0, true);
  assert.equal(witnessReads <= readsAfterFirstRender + 3, true);
});
