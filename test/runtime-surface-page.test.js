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
