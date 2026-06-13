import { relation } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";

export function createBuiltinNotificationJobHandlers({
  world,
  project = projector => world.project(projector),
  backendHost,
  runtimeConfig,
  renderTemplatedText
}) {
  const emailSender = typeof runtimeConfig?.["notify.email.stubSender"] === "string" && runtimeConfig["notify.email.stubSender"].trim()
    ? runtimeConfig["notify.email.stubSender"].trim()
    : "stub@local.test";
  const smsSender = typeof runtimeConfig?.["notify.sms.stubSender"] === "string" && runtimeConfig["notify.sms.stubSender"].trim()
    ? runtimeConfig["notify.sms.stubSender"].trim()
    : "stub-sms";

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
      preview = notification.template
        ? renderTemplatedText(notification.template, notification.vars)
        : String(notification.text || "");
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
    world.emit({
      process: `${prefix}.send`,
      actor: actor || backendHost,
      claims: [relation(notification.id, "sentVia", `${prefix}.stub`)],
      body: {
        id: notification.id,
        jobId: job.id,
        to: notification.recipient,
        subject: notification.subject,
        sender: channel === "email" ? emailSender : smsSender,
        preview,
        transport: "stub",
        attempt,
        providerMessageId: `stub-${channel}-${notification.id}-${attempt}`
      }
    });
    return { sent: true };
  };

  return {
    "notify.email.deliver": deliver("email"),
    "notify.sms.deliver": deliver("sms")
  };
}
