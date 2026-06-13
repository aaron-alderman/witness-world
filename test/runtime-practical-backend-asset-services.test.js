import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";
import { createWorld } from "../src/kernel.js";
import { defineContext, moduleProjectors } from "../src/modules.js";
import {
  assetContentUrlForId,
  assetDerivedTextPathForAppContext,
  assetDerivedThumbnailPathForAppContext,
  assetTextUrlForId,
  assetThumbnailUrlForId,
  createPracticalBackendAssetServices
} from "../plugins/assets/asset-services.js";

test("practical backend asset services expose asset URL/path helpers and read access gates", () => {
  const world = createWorld();
  const services = createPracticalBackendAssetServices({
    world,
    backendHost: "backendHost",
    runtimeConfigLookup: (runtimeConfig, key) => runtimeConfig?.[key],
    headerValue: value => Array.isArray(value) ? String(value[0] ?? "") : String(value ?? ""),
    assetsRootFor: appContext => appContext?.storage?.assetsRoot || "C:/runtime/assets",
    canCreateInContext: () => ({ ok: true, status: 200, reason: null }),
    canMutateTarget: actor => actor === "adam" ? { ok: true, status: 200, reason: null } : { ok: false, status: 403, reason: "forbidden" },
    currentPerspectiveById: () => null,
    defineContext: value => defineContext(world, value)
  });

  assert.equal(assetContentUrlForId("asset/1"), "/api/assets/asset%2F1/content");
  assert.equal(assetTextUrlForId("asset/1"), "/api/assets/asset%2F1/text");
  assert.equal(assetThumbnailUrlForId("asset/1"), "/api/assets/asset%2F1/thumbnail");
  assert.match(assetDerivedTextPathForAppContext({ runtimeRoot: "C:/runtime" }, "asset/1"), /assets[\\/]asset%2F1[\\/]derived[\\/]text\.txt$/);
  assert.match(assetDerivedThumbnailPathForAppContext({ runtimeRoot: "C:/runtime" }, "asset/1"), /assets[\\/]asset%2F1[\\/]derived[\\/]thumbnail\.svg$/);
  assert.equal(services.assetDownloadUrl("/api/assets/a/content"), "/api/assets/a/content?download=1");
  assert.equal(services.assetContentUrl("asset/1"), "/api/assets/asset%2F1/content");
  assert.equal(services.assetTextUrl("asset/1"), "/api/assets/asset%2F1/text");
  assert.equal(services.assetThumbnailUrl("asset/1"), "/api/assets/asset%2F1/thumbnail");
  assert.equal(services.assetStorageKey("asset_1"), "asset_1/blob");
  assert.match(services.assetPathFor({ runtimeRoot: "C:/runtime" }, "asset/1"), /assets[\\/]asset%2F1[\\/]blob$/);
  assert.deepEqual(services.ensureReadableAssetAccess({ id: "asset-1", visibility: "public" }, null), { ok: true, status: 200, isPublic: true });
  assert.equal(services.ensureReadableAssetAccess({ id: "asset-1", visibility: "private" }, "adam").ok, true);
  assert.equal(services.ensureReadableAssetAccess({ id: "asset-1", visibility: "private" }, null).status, 401);
});

test("practical backend asset services normalize raw uploads and asset visibility", () => {
  const world = createWorld();
  const services = createPracticalBackendAssetServices({
    world,
    backendHost: "backendHost",
    runtimeConfigLookup: (runtimeConfig, key) => runtimeConfig?.[key],
    headerValue: value => Array.isArray(value) ? String(value[0] ?? "") : String(value ?? ""),
    assetsRootFor: () => "C:/runtime/assets",
    canCreateInContext: () => ({ ok: true, status: 200, reason: null }),
    canMutateTarget: () => ({ ok: true, status: 200, reason: null }),
    currentPerspectiveById: () => null,
    defineContext: value => defineContext(world, value)
  });

  const upload = services.parseRawAssetUpload(
    {
      headers: {
        "x-witness-file-size": "12",
        "x-witness-file-name": "report.txt",
        "content-type": "text/plain; charset=utf-8",
        "x-witness-drop-context": "ctx.demo",
        "x-witness-visibility": "public"
      }
    },
    new URL("http://127.0.0.1/api/assets?perspective=perspective.demo")
  );
  assert.deepEqual(upload, {
    ok: true,
    uploadKind: "raw",
    source: {
      headers: {
        "x-witness-file-size": "12",
        "x-witness-file-name": "report.txt",
        "content-type": "text/plain; charset=utf-8",
        "x-witness-drop-context": "ctx.demo",
        "x-witness-visibility": "public"
      }
    },
    originalName: "report.txt",
    mimeType: "text/plain",
    declaredSizeBytes: 12,
    perspectiveId: "perspective.demo",
    explicitContextId: "ctx.demo",
    visibilityRaw: "public"
  });
  assert.deepEqual(services.normalizeAssetVisibility("", {}), { ok: true, value: "private" });
  assert.deepEqual(services.normalizeAssetVisibility("public", { "upload.asset.publicEnabled": true }), { ok: true, value: "public" });
  assert.equal(services.normalizeAssetVisibility("public", {}).ok, false);
});

test("practical backend asset services resolve drop contexts and parse invalid multipart uploads", async () => {
  const world = createWorld();
  defineContext(world, { actor: "adam", id: "ctx.home", label: "Home", owner: "adam" });
  defineContext(world, { actor: "adam", id: "ctx.perspective", label: "Perspective", owner: "adam" });
  const services = createPracticalBackendAssetServices({
    world,
    backendHost: "backendHost",
    runtimeConfigLookup: (runtimeConfig, key) => runtimeConfig?.[key],
    headerValue: value => Array.isArray(value) ? String(value[0] ?? "") : String(value ?? ""),
    assetsRootFor: appContext => appContext?.storage?.assetsRoot || "C:/runtime/assets",
    canCreateInContext: (_actor, contextId) => ["ctx.home", "ctx.perspective", "context:ctx.home:files"].includes(contextId)
      ? { ok: true, status: 200, reason: null }
      : { ok: false, status: 403, reason: "forbidden" },
    canMutateTarget: () => ({ ok: true, status: 200, reason: null }),
    currentPerspectiveById: id => id === "perspective.with-context"
      ? { id, context: "ctx.perspective" }
      : (id === "perspective.no-context" ? { id, context: null } : null),
    defineContext: value => defineContext(world, value)
  });

  const resolvedPerspective = services.resolveAssetDropContext({
    actor: "adam",
    perspectiveId: "perspective.with-context",
    requestSession: { homeContext: "ctx.home" },
    explicitContextId: null
  });
  assert.deepEqual(resolvedPerspective, {
    ok: true,
    status: 200,
    perspective: { id: "perspective.with-context", context: "ctx.perspective" },
    contextId: "ctx.perspective",
    source: "perspective"
  });

  const resolvedFiles = services.resolveAssetDropContext({
    actor: "adam",
    perspectiveId: "perspective.no-context",
    requestSession: { homeContext: "ctx.home" },
    explicitContextId: null
  });
  assert.equal(resolvedFiles.ok, true);
  assert.equal(resolvedFiles.source, "files");
  assert.equal(world.project(moduleProjectors.contexts).some(row => row.id === "context:ctx.home:files"), true);

  const req = Readable.from(["not-a-valid-body"]);
  req.headers = { "content-type": "multipart/form-data; boundary=bad" };
  const parsed = await services.parseMultipartAssetUpload(req);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.status, 400);
});
