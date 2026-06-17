import { relation, thing } from "../../src/kernel.js";
import { isoAt } from "../../src/runtime-config-utils.js";

function normalizeSecretId(value) {
  const id = typeof value === "string" ? value.trim() : "";
  return /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(id) ? id : null;
}

function normalizeSecretTitle(value, fallback = null) {
  const title = typeof value === "string" ? value.trim() : "";
  return title || fallback;
}

async function createGeneratedSecretId(secretStore) {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const id = `secret_${Math.random().toString(36).slice(2, 10)}`;
    const existing = await secretStore?.metadata?.(id);
    if (!existing) return id;
  }
  return `secret_${Date.now().toString(36)}`;
}

function secretClaims({ id, actor, title }) {
  return [
    thing(id),
    relation(id, "hasModuleKind", "secret"),
    relation(actor, "owns", id),
    relation(id, "hasTitle", title || id)
  ];
}

export function createSecretStoreHandlers({
  world,
  backendHost,
  sendJson,
  readJson,
  sendGateFailure,
  requireBackendCapabilities,
  canMutateTarget
}) {
  return {
    "secret.store.list": async ({ res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["secret.store"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "secret.store.list.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "secret.store.list.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "secret.store.list.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const secrets = await (appContext?.secretStore?.listMetadata?.() ?? []);
      world.observe({
        process: "secret.store.list",
        actor: requestActor,
        claims: [relation(requestActor, "read", `${serverRunnerId}:secret.store`)],
        body: { serverRunner: serverRunnerId, secretCount: secrets.length }
      });
      sendJson(res, 200, {
        serverRunner: serverRunnerId,
        secrets
      });
    },

    "secret.store.read": async ({ res, params, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["secret.store"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "secret.store.read.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "secret.store.read.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "secret.store.read.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const secretId = normalizeSecretId(params?.id);
      if (!secretId) {
        sendJson(res, 400, { error: "valid secret id required" });
        return;
      }
      const secret = await appContext?.secretStore?.metadata?.(secretId);
      if (!secret) {
        sendJson(res, 404, { error: "secret not found" });
        return;
      }
      world.observe({
        process: "secret.store.read",
        actor: requestActor,
        claims: [relation(requestActor, "read", secretId)],
        body: { id: secretId, serverRunner: serverRunnerId }
      });
      sendJson(res, 200, { secret });
    },

    "secret.store.create": async ({ req, res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["secret.store"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "secret.store.create.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "secret.store.create.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.emit({ process: "secret.store.create.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const body = await readJson(req);
      const explicitId = normalizeSecretId(body?.id);
      const id = explicitId || await createGeneratedSecretId(appContext?.secretStore);
      if (await appContext?.secretStore?.metadata?.(id)) {
        sendJson(res, 409, { error: "secret already exists" });
        return;
      }
      if (typeof body?.value !== "string") {
        sendJson(res, 400, { error: "secret value required" });
        return;
      }
      const title = normalizeSecretTitle(body?.title ?? body?.label ?? body?.name, id);
      await appContext.secretStore.writeSecretValue(id, body.value);
      const now = isoAt(Date.now());
      world.emit({
        process: "secret.store.create",
        actor: requestActor,
        claims: secretClaims({ id, actor: requestActor, title }),
        body: {
          id,
          title,
          serverRunner: serverRunnerId,
          provider: "local-json",
          status: "ready",
          createdAt: now,
          updatedAt: now,
          hasValue: true
        }
      });
      const secret = await appContext.secretStore.metadata(id);
      sendJson(res, 201, { secret });
    },

    "secret.store.write": async ({ req, res, params, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["secret.store"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "secret.store.write.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "secret.store.write.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.emit({ process: "secret.store.write.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const secretId = normalizeSecretId(params?.id);
      if (!secretId) {
        sendJson(res, 400, { error: "valid secret id required" });
        return;
      }
      const existing = await appContext?.secretStore?.metadata?.(secretId);
      if (!existing) {
        sendJson(res, 404, { error: "secret not found" });
        return;
      }
      const body = await readJson(req);
      if (typeof body?.value !== "string") {
        sendJson(res, 400, { error: "secret value required" });
        return;
      }
      const title = normalizeSecretTitle(body?.title ?? body?.label ?? body?.name, existing.title || secretId);
      await appContext.secretStore.writeSecretValue(secretId, body.value);
      const now = isoAt(Date.now());
      world.emit({
        process: "secret.store.write",
        actor: requestActor,
        claims: secretClaims({ id: secretId, actor: requestActor, title }),
        body: {
          id: secretId,
          title,
          serverRunner: serverRunnerId,
          provider: existing.provider || "local-json",
          status: "ready",
          createdAt: existing.createdAt || now,
          updatedAt: now,
          hasValue: true
        }
      });
      const secret = await appContext.secretStore.metadata(secretId);
      sendJson(res, 200, { secret });
    },

    "secret.store.delete": async ({ res, params, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["secret.store"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "secret.store.delete.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.emit({ process: "secret.store.delete.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.emit({ process: "secret.store.delete.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const secretId = normalizeSecretId(params?.id);
      if (!secretId) {
        sendJson(res, 400, { error: "valid secret id required" });
        return;
      }
      const existing = await appContext?.secretStore?.metadata?.(secretId);
      if (!existing) {
        sendJson(res, 404, { error: "secret not found" });
        return;
      }
      await appContext.secretStore.deleteSecretValue(secretId);
      world.emit({
        process: "secret.store.delete",
        actor: requestActor,
        claims: secretClaims({ id: secretId, actor: requestActor, title: existing.title || secretId }),
        body: {
          id: secretId,
          serverRunner: serverRunnerId,
          provider: existing.provider || "local-json",
          status: "deleted",
          updatedAt: isoAt(Date.now()),
          hasValue: false
        }
      });
      sendJson(res, 200, { ok: true, id: secretId });
    }
  };
}
