import assert from "node:assert/strict";
import test from "node:test";
import { describeMountedRouteOwnership } from "../src/runtime-ownership.js";

test("mounted route ownership includes the route entry before generic-host ownership", () => {
  const ownership = describeMountedRouteOwnership({
    route: {
      id: "home_route",
      method: "GET",
      path: "/",
      serves: "page",
      handler: "page.home"
    },
    handlerMetadataById: {
      "page.home": {
        ownerClass: "generic-host",
        ownerBundleId: "bundle-core-runtime"
      }
    }
  });

  assert.equal(ownership.ownerClass, "generic-host");
  assert.deepEqual(ownership.ownerChain, [
    {
      class: "route",
      routeId: "home_route",
      method: "GET",
      path: "/",
      serves: "page",
      note: "Visible behavior enters through mounted route home_route."
    },
    {
      class: "generic-host",
      bundleId: "bundle-core-runtime",
      pluginId: null,
      handlerId: "page.home",
      note: "Runtime behavior is owned by shared host/runtime code."
    }
  ]);
});

test("mounted route ownership includes handler-set dependency links", () => {
  const ownership = describeMountedRouteOwnership({
    route: {
      id: "todo_list_route",
      method: "GET",
      path: "/api/todos",
      serves: "api",
      handler: "todos.list"
    },
    handlerMetadataById: {
      "todos.list": {
        ownerClass: "runtime-plugin",
        ownerBundleId: "bundle-demo",
        ownerPluginId: "plugin.demo"
      }
    },
    handlerSetDefinitions: {
      demo: {
        handlers: ["todos.list"]
      }
    },
    handlerSetProviders: {
      demo: {
        bundleId: "bundle-demo",
        bundleKind: "plugin",
        pluginId: "plugin.demo"
      }
    }
  });

  assert.equal(ownership.ownerClass, "handler-set");
  assert.equal(ownership.ownerPluginId, "plugin.demo");
  assert.deepEqual(ownership.ownerHandlerSetIds, ["demo"]);
  assert.deepEqual(ownership.ownerChain, [
    {
      class: "route",
      routeId: "todo_list_route",
      method: "GET",
      path: "/api/todos",
      serves: "api",
      note: "Visible behavior enters through mounted route todo_list_route."
    },
    {
      class: "handler-set",
      handlerSetId: "demo",
      bundleId: "bundle-demo",
      pluginId: "plugin.demo",
      note: "Behavior is dispatched through handler set demo."
    }
  ]);
});

test("mounted route ownership includes backend-program soul links", () => {
  const ownership = describeMountedRouteOwnership({
    route: {
      id: "backend_program_route",
      method: "GET",
      path: "/api/runtime-program",
      serves: "backendProgram",
      handler: "backendProgram.run",
      params: {
        backendProgramSoul: "backend.echo"
      }
    },
    handlerMetadataById: {
      "backendProgram.run": {
        routeKind: "backendProgram",
        ownerClass: "backend-program",
        ownerBundleId: "bundle-core-runtime"
      }
    }
  });

  assert.equal(ownership.ownerClass, "backend-program");
  assert.equal(ownership.ownerBackendProgramSoul, "backend.echo");
  assert.deepEqual(ownership.ownerChain, [
    {
      class: "route",
      routeId: "backend_program_route",
      method: "GET",
      path: "/api/runtime-program",
      serves: "backendProgram",
      note: "Visible behavior enters through mounted route backend_program_route."
    },
    {
      class: "backend-program",
      handlerId: "backendProgram.run",
      backendProgramSoul: "backend.echo",
      note: "Authored backend program backend.echo is selected by mounted route params."
    },
    {
      class: "generic-host",
      bundleId: "bundle-core-runtime",
      pluginId: null,
      handlerId: "backendProgram.run",
      note: "Runtime behavior is owned by shared host/runtime code."
    }
  ]);
});
