export function sseFrame(count, witness) {
  return `data: ${JSON.stringify({ count, id: witness?.id ?? null, process: witness?.process ?? null })}\n\n`;
}

export function headerValue(value) {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : "";
  return typeof value === "string" ? value : "";
}

export function parseCookies(req) {
  const header = req.headers.cookie;
  if (typeof header !== "string" || !header.trim()) return {};
  const cookies = {};
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (!name) continue;
    cookies[name] = decodeURIComponent(rest.join("=") || "");
  }
  return cookies;
}

export function resolveRequestContext(req, sessionStore, { allowActorHeader = false } = {}) {
  const cookies = parseCookies(req);
  const sessionId = cookies.witness_session || "";
  const session = sessionId ? sessionStore?.get(sessionId) ?? null : null;
  if (session) {
    return {
      actor: session.actor,
      identity: session.identity,
      session
    };
  }
  if (!allowActorHeader) {
    return {
      actor: null,
      identity: null,
      session: null
    };
  }
  const raw = req.headers["x-witness-actor"];
  const headerActor = typeof raw === "string" && raw.trim() ? raw.trim() : null;
  return {
    actor: headerActor,
    identity: null,
    session: null
  };
}

export function sessionCookieHeader(sessionId) {
  return `witness_session=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax`;
}

export function clearSessionCookieHeader() {
  return "witness_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
}

export function send(res, status, type, body, headers = {}) {
  res.writeHead(status, { "content-type": type, ...headers });
  res.end(body);
}

export function sendJson(res, status, body, headers = {}) {
  send(res, status, "application/json", JSON.stringify(body), headers);
}

export function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", chunk => { chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export function readJson(req) {
  return readBody(req).then(data => {
    try {
      return data.length ? JSON.parse(data.toString("utf8")) : {};
    } catch (err) {
      throw err;
    }
  });
}
