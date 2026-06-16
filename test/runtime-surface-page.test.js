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
