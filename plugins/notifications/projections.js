import { projectors } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";

function titleMap(witnesses) {
  return new Map(
    projectors.currentRelations(witnesses)
      .filter(row => row.rel === "hasTitle")
      .map(row => [row.from, row.to])
  );
}

function defaultNotificationRow(id, { titles, owners, contexts }) {
  return {
    id,
    title: titles.get(id) ?? id,
    owner: owners.get(id) ?? null,
    context: contexts.get(id) ?? null,
    channel: null,
    recipient: null,
    subject: null,
    sender: null,
    template: null,
    vars: null,
    text: null,
    preview: null,
    transport: "stub",
    jobId: null,
    status: "queued",
    providerMessageId: null,
    lastError: null
  };
}

export function notifications(witnesses) {
  const rows = new Map();
  const owners = projectors.owners(witnesses);
  const contexts = moduleProjectors.objectContexts(witnesses);
  const modules = moduleProjectors.modules(witnesses);
  const jobIndex = moduleProjectors.jobIndex(witnesses).byId;
  const titles = titleMap(witnesses);

  for (const [id, kind] of modules) {
    if (kind !== "notification") continue;
    rows.set(id, defaultNotificationRow(id, { titles, owners, contexts }));
  }

  for (const witness of witnesses) {
    if (!/^notify\.(email|sms)\./.test(witness.process) || !witness.body?.id) continue;
    const id = String(witness.body.id);
    const row = rows.get(id) ?? defaultNotificationRow(id, { titles, owners, contexts });
    row.context = contexts.get(id) ?? (typeof witness.body.context === "string" ? witness.body.context : row.context);
    row.channel = witness.process.startsWith("notify.email.") ? "email" : "sms";
    row.recipient = typeof witness.body.to === "string" ? witness.body.to : row.recipient;
    row.subject = typeof witness.body.subject === "string" ? witness.body.subject : row.subject;
    row.sender = typeof witness.body.sender === "string" ? witness.body.sender : row.sender;
    row.template = typeof witness.body.template === "string" ? witness.body.template : row.template;
    if (Object.prototype.hasOwnProperty.call(witness.body, "vars")) row.vars = witness.body.vars;
    row.text = typeof witness.body.text === "string" ? witness.body.text : row.text;
    row.preview = typeof witness.body.preview === "string" ? witness.body.preview : row.preview;
    row.transport = typeof witness.body.transport === "string" ? witness.body.transport : row.transport;
    row.jobId = typeof witness.body.jobId === "string" ? witness.body.jobId : row.jobId;
    row.providerMessageId = typeof witness.body.providerMessageId === "string" ? witness.body.providerMessageId : row.providerMessageId;
    row.lastError = typeof witness.body.reason === "string" ? witness.body.reason : row.lastError;
    row.title = titles.get(id) ?? row.subject ?? row.recipient ?? row.title;
    rows.set(id, row);
  }

  return [...rows.values()]
    .map(row => {
      const job = row.jobId ? jobIndex[row.jobId] ?? null : null;
      let status = row.status;
      if (job?.status === "running") status = "running";
      else if (job?.status === "queued") status = "queued";
      else if (job?.status === "dead-letter") status = "failed";
      else if (row.providerMessageId) status = "sent";
      else if (job?.status === "succeeded") status = "sent";
      return {
        ...row,
        status,
        attempt: job?.attempt ?? 0,
        maxAttempts: job?.maxAttempts ?? null,
        retryDelayMs: job?.retryDelayMs ?? null,
        lastError: row.lastError ?? job?.lastError ?? null
      };
    })
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

export function notificationIndex(witnesses) {
  const rows = notifications(witnesses);
  const byId = Object.create(null);
  for (const row of rows) byId[row.id] = row;
  return { rows, byId };
}

export const notificationModuleProjectors = Object.freeze({
  notifications,
  notificationIndex
});
