import { renderTemplatedText as defaultRenderTemplatedText } from "../../src/runtime-template-utils.js";

function scalar(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// Render the deliverable body once, shared by every transport so the preview an operator
// inspects is byte-for-byte what a provider receives.
export function renderNotificationBody(notification, renderTemplatedText = defaultRenderTemplatedText) {
  return notification.template
    ? renderTemplatedText(notification.template, notification.vars)
    : String(notification.text || "");
}

export function resolveEmailProvider(runtimeConfig) {
  return scalar(runtimeConfig?.["notify.email.provider"]) || "stub";
}

function valueAtPath(target, dotPath) {
  if (!dotPath) return undefined;
  return String(dotPath)
    .split(".")
    .reduce((acc, key) => (acc && typeof acc === "object" ? acc[key] : undefined), target);
}

// Deterministic local transport. Stays the default and first-class even after a real provider
// is configured, so local tests never need an external service.
export function createStubEmailTransport({ sender } = {}) {
  return {
    id: "stub",
    sender: sender ?? null,
    async send({ channel, notificationId, attempt }) {
      return {
        transport: "stub",
        sender: sender ?? null,
        providerMessageId: `stub-${channel}-${notificationId}-${attempt}`
      };
    }
  };
}

// Vendor-neutral real provider: POST the message to a configured endpoint with bearer auth and
// read the provider's message id out of the JSON response. Any non-2xx or network failure throws
// so the jobs.queue retry/dead-letter path stays in control (repair is first-class, not hidden).
export function createHttpEmailTransport({ runtimeConfig, fetchImpl } = {}) {
  const url = scalar(runtimeConfig?.["notify.email.http.url"]);
  const apiKey = scalar(runtimeConfig?.["notify.email.http.apiKey"]);
  const fromAddress = scalar(runtimeConfig?.["notify.email.http.fromAddress"]);
  const responseIdPath = scalar(runtimeConfig?.["notify.email.http.responseIdPath"]) || "id";
  const fetchFn = typeof fetchImpl === "function" ? fetchImpl : null;
  return {
    id: "http",
    sender: fromAddress,
    async send({ to, subject, body }) {
      if (!url) throw new Error("notify.email.http.url is not configured");
      if (!fetchFn) throw new Error("http email transport requires fetch");
      const headers = { "content-type": "application/json" };
      if (apiKey) headers.authorization = `Bearer ${apiKey}`;
      const response = await fetchFn(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ to, subject, from: fromAddress, body })
      });
      if (!response || typeof response.status !== "number") {
        throw new Error("http email transport received no response");
      }
      if (response.status < 200 || response.status >= 300) {
        let detail = "";
        try {
          detail = typeof response.text === "function" ? await response.text() : "";
        } catch {
          detail = "";
        }
        const error = new Error(`http email provider responded ${response.status}`);
        error.responseStatus = response.status;
        error.detail = detail;
        throw error;
      }
      let payload = null;
      try {
        payload = typeof response.json === "function" ? await response.json() : null;
      } catch {
        payload = null;
      }
      const providerMessageId = scalar(valueAtPath(payload, responseIdPath));
      if (!providerMessageId) {
        throw new Error(`http email provider response missing message id at "${responseIdPath}"`);
      }
      return { transport: "http", sender: fromAddress, providerMessageId };
    }
  };
}

const SENDGRID_DEFAULT_URL = "https://api.sendgrid.com/v3/mail/send";

// Concrete SendGrid (v3 mail send) transport. SendGrid replies 202 with an empty body and returns the
// message id in the X-Message-Id response header, so it cannot reuse the generic body-id transport.
export function createSendgridEmailTransport({ runtimeConfig, fetchImpl } = {}) {
  const apiKey = scalar(runtimeConfig?.["notify.email.sendgrid.apiKey"]);
  const fromAddress = scalar(runtimeConfig?.["notify.email.sendgrid.fromAddress"]);
  const url = scalar(runtimeConfig?.["notify.email.sendgrid.url"]) || SENDGRID_DEFAULT_URL;
  const fetchFn = typeof fetchImpl === "function" ? fetchImpl : null;
  return {
    id: "sendgrid",
    sender: fromAddress,
    async send({ to, subject, body }) {
      if (!apiKey) throw new Error("notify.email.sendgrid.apiKey is not configured");
      if (!fromAddress) throw new Error("notify.email.sendgrid.fromAddress is not configured");
      if (!fetchFn) throw new Error("sendgrid email transport requires fetch");
      const response = await fetchFn(url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: fromAddress },
          subject,
          content: [{ type: "text/plain", value: body }]
        })
      });
      if (!response || typeof response.status !== "number") {
        throw new Error("sendgrid email transport received no response");
      }
      if (response.status < 200 || response.status >= 300) {
        const error = new Error(`sendgrid email provider responded ${response.status}`);
        error.responseStatus = response.status;
        throw error;
      }
      const providerMessageId = scalar(response.headers?.get?.("x-message-id"));
      if (!providerMessageId) {
        throw new Error("sendgrid email response missing X-Message-Id header");
      }
      return { transport: "sendgrid", sender: fromAddress, providerMessageId };
    }
  };
}

// Resolve the email transport selected by runtime config; unknown providers fall back to stub
// rather than silently dropping mail.
export function createEmailTransport({ runtimeConfig, fetchImpl, stubSender } = {}) {
  const provider = resolveEmailProvider(runtimeConfig);
  if (provider === "http") return createHttpEmailTransport({ runtimeConfig, fetchImpl });
  if (provider === "sendgrid") return createSendgridEmailTransport({ runtimeConfig, fetchImpl });
  return createStubEmailTransport({ sender: stubSender });
}
