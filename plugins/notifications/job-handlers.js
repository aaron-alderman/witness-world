import { relation } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";
import {
  createEmailTransport,
  createStubEmailTransport,
  renderNotificationBody
} from "./email-transports.js";

export function createBuiltinNotificationJobHandlers({
  world,
  project = projector => world.project(projector),
  backendHost,
  runtimeConfig,
  renderTemplatedText,
  fetchImpl,
  getAppContext = null
}) {
  const emailSender = typeof runtimeConfig?.["notify.email.stubSender"] === "string" && runtimeConfig["notify.email.stubSender"].trim()
    ? runtimeConfig["notify.email.stubSender"].trim()
    : "stub@local.test";
  const smsSender = typeof runtimeConfig?.["notify.sms.stubSender"] === "string" && runtimeConfig["notify.sms.stubSender"].trim()
    ? runtimeConfig["notify.sms.stubSender"].trim()
    : "stub-sms";

  // Email picks its transport (stub or a real provider) from runtime config; SMS stays stub-only.
  const transportFor = channel => channel === "email"
    ? createEmailTransport({
        runtimeConfig,
        fetchImpl,
        stubSender: emailSender,
        witnessCoreBridge: getAppContext?.()?.witnessCoreBridge ?? null
      })
    : createStubEmailTransport({ sender: smsSender });

  const deliver = channel => async ({ actor, job, payload, attempt }) => {
    const notificationId = typeof payload?.notificationId === "string" ? payload.notificationId : "";
    const notification = project(moduleProjectors.notificationIndex).byId[notificationId] ?? null;
    if (!notification) {
      throw new Error("notification not found");
    }
    const prefix = `notify.${channel}`;
    world.emit({
      process: `${prefix}.render`,
      actor: actor || backendHost,
      claims: [relation(notification.id, "renderedBy", `${prefix}.stub`)],
      body: {
        id: notification.id,
        jobId: job.id,
        to: notification.recipient,
        subject: notification.subject,
        template: notification.template,
        vars: notification.vars
      }
    });
    let preview;
    try {
      preview = renderNotificationBody(notification, renderTemplatedText);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      world.emit({
        process: `${prefix}.render.failed`,
        actor: actor || backendHost,
        claims: [],
        body: {
          id: notification.id,
          jobId: job.id,
          to: notification.recipient,
          subject: notification.subject,
          template: notification.template,
          vars: notification.vars,
          reason
        }
      });
      throw error;
    }
    const transport = transportFor(channel);
    let result;
    try {
      result = await transport.send({
        channel,
        notificationId: notification.id,
        attempt,
        actor: actor || backendHost,
        to: notification.recipient,
        subject: notification.subject,
        body: preview
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      world.emit({
        process: `${prefix}.send.failed`,
        actor: actor || backendHost,
        claims: [],
        body: {
          id: notification.id,
          jobId: job.id,
          to: notification.recipient,
          subject: notification.subject,
          transport: transport.id,
          attempt,
          reason
        }
      });
      throw error;
    }
    world.emit({
      process: `${prefix}.send`,
      actor: actor || backendHost,
      claims: [relation(notification.id, "sentVia", `${prefix}.${result.transport}`)],
      body: {
        id: notification.id,
        jobId: job.id,
        to: notification.recipient,
        subject: notification.subject,
        sender: result.sender ?? (channel === "email" ? emailSender : smsSender),
        preview,
        transport: result.transport,
        attempt,
        providerMessageId: result.providerMessageId
      }
    });
    return { sent: true };
  };

  return {
    "notify.email.deliver": deliver("email"),
    "notify.sms.deliver": deliver("sms")
  };
}
