import assert from "node:assert/strict";
import test from "node:test";
import { renderSurfaceShellFromMap } from "../src/runtime-surface-shell.js";

test("runtime-surface-shell selects the authored alternate surface from route params defaultScreen", () => {
  const surfaces = new Map([
    ["SurfaceRoot", {
      id: "SurfaceRoot",
      surfaceKind: "app-root",
      children: ["SurfaceStatic", "SurfaceAlternate"]
    }],
    ["SurfaceStatic", {
      id: "SurfaceStatic",
      surfaceKind: "content-panel",
      props: {
        title: "Static surface",
        body: "Primary authored output."
      }
    }],
    ["SurfaceAlternate", {
      id: "SurfaceAlternate",
      surfaceKind: "content-panel",
      props: {
        title: "Alternate surface",
        body: "Alternate authored output."
      }
    }]
  ]);

  const html = renderSurfaceShellFromMap({
    surfaces,
    rootSurfaceId: "SurfaceRoot",
    requestPathname: "/alternate",
    route: {
      path: "/alternate",
      params: {
        defaultScreen: "SurfaceAlternate"
      }
    }
  });

  assert.match(html, /Alternate surface/);
  assert.match(html, /Alternate authored output\./);
  assert.match(html, /activeSurface\.id<\/dt><dd>SurfaceAlternate<\/dd>/);
  assert.doesNotMatch(html, /Primary authored output\./);
});
