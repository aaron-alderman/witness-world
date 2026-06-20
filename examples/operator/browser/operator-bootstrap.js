function normalizeSearch(search = "") {
  const text = String(search || "");
  if (!text) return "";
  return text.startsWith("?") ? text.slice(1) : text;
}

export function shouldForceFixtureBootstrap(search = "") {
  const params = new URLSearchParams(normalizeSearch(search));
  const mode = String(params.get("mode") || "").trim().toLowerCase();
  const fixture = String(params.get("fixture") || "").trim().toLowerCase();
  return mode === "fixture" || fixture === "1" || fixture === "true";
}

export async function resolveOperatorBrowserBootstrap({
  liveApi = null,
  search = "",
  loadFixtureSnapshot
} = {}) {
  const forceFixture = shouldForceFixtureBootstrap(search);
  if (forceFixture) {
    return {
      hostMode: "fixture-readonly",
      liveApi: null,
      snapshot: await loadFixtureSnapshot()
    };
  }
  if (!liveApi || typeof liveApi.getSnapshot !== "function") {
    throw new Error("operator bridge unavailable; start the local server or reopen with ?fixture=1");
  }
  try {
    return {
      hostMode: "live",
      liveApi,
      snapshot: await liveApi.getSnapshot()
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error || "unknown error");
    throw new Error(`operator bridge unavailable; start the local server or reopen with ?fixture=1 (${detail})`);
  }
}
