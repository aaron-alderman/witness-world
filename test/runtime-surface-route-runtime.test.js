import assert from "node:assert/strict";
import test from "node:test";
import {
  createBrowserRouteInvoker,
  loadRouteSurfacePage
} from "../src/runtime-surface-route-runtime.js";

test("createBrowserRouteInvoker interpolates route templates and normalizes the response payload", async () => {
  const calls = [];
  const invoke = createBrowserRouteInvoker({
    async fetch(url, init) {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        headers: {
          get(name) {
            return String(name).toLowerCase() === "content-type" ? "application/json" : null;
          }
        },
        async text() {
          return JSON.stringify({ ok: true, value: 42 });
        }
      };
    }
  });

  const result = await invoke({
    route: "/api/widgets/${id}",
    method: "post",
    request: { id: "alpha", payload: "beta" }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/widgets/alpha");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(result.status, "success");
  assert.equal(result.payload.statusCode, 200);
  assert.match(result.payload.summary, /"value": 42/);
});

test("loadRouteSurfacePage caches the parsed fragment by route key", async () => {
  const responses = [];
  const window = {
    async fetch(path) {
      responses.push(path);
      return {
        ok: true,
        async text() {
          return `
            <html>
              <body>
                <div id="route-root">Hello route</div>
                <script type="application/json" id="surface-runtime-manifest">{"surfaces":[{"id":"Surface.Route"}]}</script>
              </body>
            </html>
          `;
        }
      };
    },
    DOMParser: class {
      parseFromString(html) {
        return {
          getElementById(id) {
            if (id === "surface-runtime-manifest") {
              return { textContent: '{"surfaces":[{"id":"Surface.Route"}]}' };
            }
            if (id === "route-root") {
              return { outerHTML: '<div id="route-root">Hello route</div>' };
            }
            return null;
          },
          body: {
            firstElementChild: { outerHTML: '<div id="route-root">Hello route</div>' }
          }
        };
      }
    }
  };
  const manifest = {};
  const surfaceById = new Map([
    ["Surface.Route", { id: "Surface.Route", view: { rootId: "route-root" } }]
  ]);
  const target = { key: "route", path: "/engentus/route", surfaceId: "Surface.Route" };

  const first = await loadRouteSurfacePage({
    document: {},
    window,
    manifest,
    surfaceById,
    target
  });
  const second = await loadRouteSurfacePage({
    document: {},
    window,
    manifest,
    surfaceById,
    target
  });

  assert.equal(first.fragment, '<div id="route-root">Hello route</div>');
  assert.deepEqual(first.manifest, { surfaces: [{ id: "Surface.Route" }] });
  assert.equal(second.fragment, first.fragment);
  assert.equal(responses.length, 1);
  assert.ok(manifest.__routeSurfacePageCache.route);
});

test("loadRouteSurfacePage refetches the full document when a fragment response lacks a manifest and manifest is required", async () => {
  const responses = [];
  const window = {
    async fetch(path, options = {}) {
      responses.push({
        path,
        header: options?.headers?.["x-surface-fragment-request"] ?? null
      });
      const fragmentRequest = options?.headers?.["x-surface-fragment-request"] === "1";
      return {
        ok: true,
        async text() {
          if (fragmentRequest) {
            return `<div id="route-root">Fragment only</div>`;
          }
          return `
            <html>
              <body>
                <div id="route-root">Full document</div>
                <script type="application/json" id="surface-runtime-manifest">{"surfaces":[{"id":"Surface.Route"}]}</script>
              </body>
            </html>
          `;
        }
      };
    },
    DOMParser: class {
      parseFromString(html) {
        const includesManifest = html.includes("surface-runtime-manifest");
        return {
          getElementById(id) {
            if (id === "surface-runtime-manifest" && includesManifest) {
              return { textContent: '{"surfaces":[{"id":"Surface.Route"}]}' };
            }
            if (id === "route-root") {
              return {
                outerHTML: includesManifest
                  ? '<div id="route-root">Full document</div>'
                  : '<div id="route-root">Fragment only</div>'
              };
            }
            return null;
          },
          body: {
            firstElementChild: {
              outerHTML: includesManifest
                ? '<div id="route-root">Full document</div>'
                : '<div id="route-root">Fragment only</div>'
            }
          }
        };
      }
    }
  };
  const manifest = {};
  const surfaceById = new Map([
    ["Surface.Route", { id: "Surface.Route", view: { rootId: "route-root" } }]
  ]);
  const target = { key: "route", path: "/engentus/route", surfaceId: "Surface.Route" };

  const page = await loadRouteSurfacePage({
    document: {},
    window,
    manifest,
    surfaceById,
    target,
    requireManifest: true
  });

  assert.equal(page.fragment, '<div id="route-root">Full document</div>');
  assert.deepEqual(page.manifest, { surfaces: [{ id: "Surface.Route" }] });
  assert.deepEqual(responses, [
    { path: "/engentus/route", header: "1" },
    { path: "/engentus/route", header: null }
  ]);
});
