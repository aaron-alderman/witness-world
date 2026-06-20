function jsonHeaders() {
  return {
    "content-type": "application/json; charset=utf-8"
  };
}

async function parseJsonResponse(response, fallbackLabel) {
  if (!response?.ok) {
    const label = fallbackLabel || "operator browser bridge request failed";
    throw new Error(`${label}: ${response?.status ?? "unknown status"}`);
  }
  return response.json();
}

export function createOperatorBrowserLiveApi({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  baseUrl = "."
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch implementation is required");
  }
  const root = String(baseUrl || ".").replace(/\/+$/u, "");
  const href = path => `${root}${path.startsWith("/") ? path : `/${path}`}`;
  return Object.freeze({
    async getSnapshot() {
      const response = await fetchImpl(href("/api/snapshot"));
      return parseJsonResponse(response, "operator browser snapshot request failed");
    },
    async runCommand(command = "") {
      const response = await fetchImpl(href("/api/command"), {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ command })
      });
      return parseJsonResponse(response, "operator browser command request failed");
    },
    async dispatchIntent(intent = {}) {
      const response = await fetchImpl(href("/api/intent"), {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify(intent ?? {})
      });
      return parseJsonResponse(response, "operator browser intent request failed");
    },
    async updateDisplaySettings(patch = {}) {
      const response = await fetchImpl(href("/api/display-settings"), {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify(patch ?? {})
      });
      return parseJsonResponse(response, "operator browser display settings request failed");
    }
  });
}
