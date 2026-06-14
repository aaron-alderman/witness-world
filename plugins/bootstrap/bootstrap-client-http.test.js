import test from "node:test";
import assert from "node:assert/strict";
import {
  createBootstrapClientHttp,
  renderBootstrapClientHttpFactory
} from "./bootstrap-client-http.js";

test("bootstrap client http helper reads JSON and raises API errors", async () => {
  const calls = [];
  const http = createBootstrapClientHttp({
    fetchFn: async (url, options = {}) => {
      calls.push([url, options.method || "GET", options.body || ""]);
      if (url === "/ok") {
        return {
          ok: true,
          async json() {
            return { ok: true };
          }
        };
      }
      return {
        ok: false,
        async json() {
          return { error: "broken" };
        }
      };
    }
  });

  assert.deepEqual(await http.request("/ok"), { ok: true });
  await assert.rejects(() => http.request("/fail"), /broken/);
  assert.deepEqual(calls[0], ["/ok", "GET", ""]);
});

test("bootstrap client http helper posts JSON with explicit method and content type", async () => {
  const http = createBootstrapClientHttp({
    fetchFn: async (_url, options = {}) => ({
      ok: true,
      async json() {
        return {
          method: options.method,
          body: options.body,
          contentType: options.headers?.["content-type"] || ""
        };
      }
    })
  });

  assert.deepEqual(
    await http.postJson("/api/demo", { id: "demo" }, "DELETE"),
    {
      method: "DELETE",
      body: "{\"id\":\"demo\"}",
      contentType: "application/json"
    }
  );
});

test("bootstrap client http factory exposes the shared browser helper", () => {
  const factory = renderBootstrapClientHttpFactory();
  assert.equal(factory.includes("const createBootstrapClientHttp ="), true);
});
