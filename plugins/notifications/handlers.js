import { relation } from "../../src/kernel.js";

export function createNotificationHandlers({
  world,
  backendHost,
  sendJson,
  sendGateFailure,
  requireBackendCapabilities,
  canMutateTarget,
  enqueueNotification,
  notificationsForRunner,
  notificationReadShape,
  currentNotificationForRunner
}) {
  return {
    "notify.email.enqueue": async ({ req, res, requestActor, appContext }) => {
      await enqueueNotification({ channel: "email", req, res, requestActor, appContext });
    },

    "notify.sms.enqueue": async ({ req, res, requestActor, appContext }) => {
      await enqueueNotification({ channel: "sms", req, res, requestActor, appContext });
    },

    "notifications.list": async ({ res, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["notify.email", "notify.sms"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "notifications.list.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "notifications.list.failed", actor: backendHost, claims: [], body: { reason: "no actor" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "notifications.list.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId } });
        sendGateFailure(res, gate);
        return;
      }
      const notifications = notificationsForRunner(serverRunnerId, appContext).map(notificationReadShape);
      world.observe({
        process: "notifications.list",
        actor: requestActor,
        claims: [relation(requestActor, "read", `${serverRunnerId}:notifications`)],
        body: { serverRunner: serverRunnerId, count: notifications.length }
      });
      sendJson(res, 200, { serverRunner: serverRunnerId, notifications });
    },

    "notifications.read": async ({ res, params, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["notify.email", "notify.sms"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "notifications.read.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing, id: params.id || "" } });
        sendJson(res, capabilityGate.status || 503, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      if (!requestActor) {
        world.observe({ process: "notifications.read.failed", actor: backendHost, claims: [], body: { reason: "no actor", id: params.id || "" } });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const serverRunnerId = appContext?.serverRunnerId || "";
      const gate = canMutateTarget(world, requestActor, serverRunnerId);
      if (!gate.ok) {
        world.observe({ process: "notifications.read.failed", actor: requestActor, claims: [], body: { reason: gate.reason, serverRunner: serverRunnerId, id: params.id || "" } });
        sendGateFailure(res, gate);
        return;
      }
      const notification = currentNotificationForRunner(serverRunnerId, params.id || "", appContext);
      if (!notification) {
        world.observe({ process: "notifications.read.failed", actor: requestActor, claims: [], body: { reason: "notification not found", serverRunner: serverRunnerId, id: params.id || "" } });
        sendJson(res, 404, { error: "notification not found", id: params.id || "" });
        return;
      }
      world.observe({
        process: "notifications.read",
        actor: requestActor,
        claims: [relation(requestActor, "read", notification.id)],
        body: { serverRunner: serverRunnerId, id: notification.id, status: notification.status }
      });
      sendJson(res, 200, { notification: notificationReadShape(notification) });
    }
  };
}
