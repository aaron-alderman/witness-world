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

test("runtime-surface-shell preserves authored inline style attributes generically", () => {
  const surfaces = new Map([
    ["SurfaceRoot", {
      id: "SurfaceRoot",
      surfaceKind: "app-root",
      children: ["LogoImage"]
    }],
    ["LogoImage", {
      id: "LogoImage",
      surfaceKind: "image",
      props: {
        tag: "img",
        src: "/img/logo.png",
        alt: "Logo",
        style: "height:42px;width:auto;margin-bottom:28px"
      }
    }]
  ]);

  const html = renderSurfaceShellFromMap({
    surfaces,
    rootSurfaceId: "SurfaceRoot",
    requestPathname: "/"
  });

  assert.match(html, /style="height:42px;width:auto;margin-bottom:28px"/);
});

test("runtime-surface-shell preserves generic input attributes on authored form controls", () => {
  const surfaces = new Map([
    ["SurfaceRoot", {
      id: "SurfaceRoot",
      surfaceKind: "app-root",
      children: ["EmailField"]
    }],
    ["EmailField", {
      id: "EmailField",
      surfaceKind: "form-field",
      className: "auth-field",
      props: {
        label: "Email address",
        inputType: "email",
        inputId: "login-email",
        inputClass: "auth-input",
        placeholder: "you@company.com",
        autocomplete: "email"
      }
    }]
  ]);

  const html = renderSurfaceShellFromMap({
    surfaces,
    rootSurfaceId: "SurfaceRoot",
    requestPathname: "/"
  });

  assert.match(html, /<label for="login-email">Email address<\/label>/);
  assert.match(html, /<input type="email" id="login-email" class="auth-input" placeholder="you@company\.com" autocomplete="email">/);
});

test("runtime-surface-shell stamps authored surface identity metadata onto rendered surface roots", () => {
  const surfaces = new Map([
    ["SurfaceRoot", {
      id: "SurfaceRoot",
      surfaceKind: "app-root",
      children: ["LoginScreen"]
    }],
    ["LoginScreen", {
      id: "LoginScreen",
      surfaceKind: "auth-screen",
      props: {
        routeKey: "login",
        routePath: "/login",
        presentationAnchor: "login-screen"
      },
      children: ["LoginHeader"]
    }],
    ["LoginHeader", {
      id: "LoginHeader",
      surfaceKind: "screen-header",
      parentId: "LoginScreen",
      props: {
        title: "Welcome back"
      }
    }]
  ]);

  const html = renderSurfaceShellFromMap({
    surfaces,
    rootSurfaceId: "SurfaceRoot",
    requestPathname: "/login"
  });

  assert.match(
    html,
    /data-surface-id="LoginScreen"[^>]*data-surface-kind="auth-screen"[^>]*data-surface-route-key="login"[^>]*id="login-screen"[^>]*data-surface-dom-id="login-screen"[^>]*data-surface-anchor="login-screen"/
  );
  assert.match(
    html,
    /data-surface-id="LoginHeader"[^>]*data-surface-kind="screen-header"[^>]*data-surface-parent-id="LoginScreen"/
  );
});
