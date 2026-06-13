import { relation } from "../../src/kernel.js";

export function createSearchIndexHandlers({
  world,
  backendHost,
  sendJson,
  readJson,
  sendGateFailure,
  requireBackendCapabilities,
  canMutateTarget,
  emitSearchIndexEvent,
  currentSearchIndexForRunner,
  searchIndexReadShape
}) {
  const fallbackIndex = serverRunnerId => ({
    id: `searchIndex:${serverRunnerId}:main`,
    title: `${serverRunnerId} Search Index`,
    serverRunner: serverRunnerId,
    provider: "local-text",
    name: "main"
  });

  return {
    "search.index.inspect": async ({ res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["search.index"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "search.index.inspect.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "search.index.inspect.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "search.index.inspect.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const inspection = await appContext?.searchIndex?.inspect?.();
      if (!inspection?.ok) {
        emitSearchIndexEvent({
          actor: requestActor,
          process: "search.index.inspect.failed",
          index: inspection?.index || fallbackIndex(serverRunnerId),
          body: { reason: inspection?.reason || "search index unavailable" }
        });
        sendJson(res, inspection?.status || 503, { error: inspection?.reason || "search index unavailable" });
        return;
      }
      const index = inspection.index
        ? searchIndexReadShape(currentSearchIndexForRunner(serverRunnerId, inspection.index.id, appContext) ?? inspection.index)
        : null;
      world.observe({
        process: "search.index.inspect",
        actor: requestActor,
        claims: [relation(requestActor, "read", "search.index")],
        body: { serverRunner: serverRunnerId, built: Boolean(index), documentCount: index?.documentCount ?? 0 }
      });
      sendJson(res, 200, { index });
    },

    "search.index.build": async ({ req, res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["search.index"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "search.index.build.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "search.index.build.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.emit({ process: "search.index.build.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const built = await appContext?.searchIndex?.build?.({ documents: body?.documents, assetIds: body?.assetIds });
      const index = built?.index || fallbackIndex(serverRunnerId);
      if (!built?.ok) {
        emitSearchIndexEvent({ actor: requestActor, process: "search.index.build.failed", index, body: { reason: built?.reason || "search index build failed" } });
        sendJson(res, built?.status || 500, { error: built?.reason || "search index build failed" });
        return;
      }
      emitSearchIndexEvent({
        actor: requestActor,
        process: "search.index.build",
        index: built.index,
        body: {
          sourceCount: built.index.sourceCount,
          documentCount: built.index.documentCount,
          assetCount: built.index.assetCount,
          queryCount: built.index.queryCount,
          lastBuiltAt: built.index.lastBuiltAt,
          path: built.index.path
        }
      });
      sendJson(res, 200, { index: searchIndexReadShape(currentSearchIndexForRunner(serverRunnerId, built.index.id, appContext) ?? built.index) });
    },

    "search.index.reindex": async ({ res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["search.index"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "search.index.reindex.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "search.index.reindex.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.emit({ process: "search.index.reindex.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const rebuilt = await appContext?.searchIndex?.reindex?.();
      const index = rebuilt?.index || fallbackIndex(serverRunnerId);
      if (!rebuilt?.ok) {
        emitSearchIndexEvent({ actor: requestActor, process: "search.index.reindex.failed", index, body: { reason: rebuilt?.reason || "search index reindex failed" } });
        sendJson(res, rebuilt?.status || 500, { error: rebuilt?.reason || "search index reindex failed" });
        return;
      }
      emitSearchIndexEvent({
        actor: requestActor,
        process: "search.index.reindex",
        index: rebuilt.index,
        body: {
          sourceCount: rebuilt.index.sourceCount,
          documentCount: rebuilt.index.documentCount,
          assetCount: rebuilt.index.assetCount,
          queryCount: rebuilt.index.queryCount,
          lastBuiltAt: rebuilt.index.lastBuiltAt,
          path: rebuilt.index.path
        }
      });
      sendJson(res, 200, { index: searchIndexReadShape(currentSearchIndexForRunner(serverRunnerId, rebuilt.index.id, appContext) ?? rebuilt.index) });
    },

    "search.index.query": async ({ req, res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["search.index"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "search.index.query.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "search.index.query.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "search.index.query.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const result = await appContext?.searchIndex?.query?.({ q: body?.q, limit: body?.limit });
      const index = result?.index || fallbackIndex(serverRunnerId);
      if (!result?.ok) {
        emitSearchIndexEvent({ actor: requestActor, process: "search.index.query.failed", index, body: { reason: result?.reason || "search query failed" } });
        sendJson(res, result?.status || 500, { error: result?.reason || "search query failed" });
        return;
      }
      const hits = result.hits.map(hit => ({
        ...hit,
        ...(hit.assetId ? {
          contentUrl: `/api/assets/${encodeURIComponent(hit.assetId)}/content`,
          textUrl: `/api/assets/${encodeURIComponent(hit.assetId)}/text`
        } : {})
      }));
      emitSearchIndexEvent({
        actor: requestActor,
        process: "search.index.query",
        index: result.index,
        body: {
          q: result.q,
          limit: result.limit,
          hitCount: hits.length,
          queryCount: result.index.queryCount,
          lastQueryAt: result.index.lastQueryAt
        }
      });
      sendJson(res, 200, {
        index: searchIndexReadShape(currentSearchIndexForRunner(serverRunnerId, result.index.id, appContext) ?? result.index),
        hits
      });
    }
  };
}
