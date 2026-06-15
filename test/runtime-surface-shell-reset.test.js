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
  assert.match(html, /activeSurface=SurfaceAlternate/);
  assert.doesNotMatch(html, /Primary authored output\./);
});

test("runtime-surface-shell selects the authored route subtree by routePath before falling back", () => {
  const surfaces = new Map([
    ["SurfaceRoot", {
      id: "SurfaceRoot",
      surfaceKind: "app-root",
      children: ["LoginScreen", "HomeScreen"]
    }],
    ["LoginScreen", {
      id: "LoginScreen",
      surfaceKind: "auth-screen",
      props: {
        routePath: "/login"
      },
      children: ["LoginHeader"]
    }],
    ["LoginHeader", {
      id: "LoginHeader",
      surfaceKind: "screen-header",
      props: {
        title: "Welcome back",
        subtitle: "Sign in"
      }
    }],
    ["HomeScreen", {
      id: "HomeScreen",
      surfaceKind: "app-shell",
      props: {
        routePath: "/home"
      },
      children: ["HomeHeader"]
    }],
    ["HomeHeader", {
      id: "HomeHeader",
      surfaceKind: "screen-header",
      props: {
        title: "Analysis Modules",
        subtitle: "Select a module to begin analysis"
      }
    }]
  ]);

  const html = renderSurfaceShellFromMap({
    surfaces,
    rootSurfaceId: "SurfaceRoot",
    requestPathname: "/home",
    route: {
      path: "/:screen",
      params: {
        defaultScreen: "login"
      }
    }
  });

  assert.match(html, /Analysis Modules/);
  assert.match(html, /Select a module to begin analysis/);
  assert.match(html, /activeSurface=HomeScreen/);
  assert.doesNotMatch(html, /Welcome back/);
});
