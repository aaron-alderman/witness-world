// OAuth provider adapters for the auth.oauth seam. One product seam, many providers: the stub stays
// the default first-class path (deterministic, no network) and the generic OIDC adapter proves a real
// authorization-code provider. Provider-specific behavior lives here; the shared link/login/identity/
// session logic stays in handlers.js.

function scalar(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function valueAtPath(target, dotPath) {
  if (!dotPath) return undefined;
  return String(dotPath)
    .split(".")
    .reduce((acc, key) => (acc && typeof acc === "object" ? acc[key] : undefined), target);
}

// An error whose status/reason flow straight back to the HTTP response.
function providerError(reason, status = 401) {
  const error = new Error(reason);
  error.reason = reason;
  error.status = status;
  return error;
}

function createWitnessCoreBackedFetch({ fetchImpl, witnessCoreBridge, correlation }) {
  return async (url, options = {}) => {
    const targetUrl = String(url || "").trim();
    if (witnessCoreBridge?.coreUrl) {
      const response = await witnessCoreBridge.executeHttpOutbound({
        url: targetUrl,
        method: options?.method || "GET",
        headers: options?.headers && typeof options.headers === "object" ? options.headers : {},
        bodyText: options?.body == null ? null : String(options.body),
        correlation
      });
      return {
        status: Number(response?.status || 0),
        headers: response?.headers ?? {},
        async json() {
          return JSON.parse(String(response?.bodyText ?? "null"));
        },
        async text() {
          return String(response?.bodyText ?? "");
        }
      };
    }
    if (typeof fetchImpl !== "function") throw providerError("oauth provider requires fetch", 500);
    return await fetchImpl(url, options);
  };
}

// Deterministic local provider — today's behavior, extracted verbatim. Stays the default.
function createStubProvider() {
  return {
    id: "stub",
    buildAuthorizeUrl({ callbackUrl, state }) {
      return `${callbackUrl}?state=${encodeURIComponent(state)}&code=stub-success`;
    },
    // Raw profile comes from the flow; the handler normalizes it. stub-fail mirrors the old 401 path.
    async resolveProfile({ flow, code }) {
      if (code === "stub-fail") throw providerError("stub oauth code rejected", 401);
      return flow.profile ?? null;
    }
  };
}

// Generic OIDC/OAuth2 confidential-client authorization-code provider. Configurable endpoints +
// userinfo field mapping. Any non-2xx / network / missing-id throws so the callback witnesses
// auth.oauth.callback.failed (synchronous flow — the user simply re-initiates).
function createOidcProvider(oidc) {
  const redirectUriFor = callbackUrl => oidc.redirectUri || callbackUrl;
  return {
    id: "oidc",
    buildAuthorizeUrl({ callbackUrl, state }) {
      const url = new URL(oidc.authorizeUrl);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", oidc.clientId);
      url.searchParams.set("redirect_uri", redirectUriFor(callbackUrl));
      url.searchParams.set("state", state);
      url.searchParams.set("scope", oidc.scope);
      return url.toString();
    },
    async resolveProfile({ code, callbackUrl, fetchImpl, witnessCoreBridge = null, correlation = null }) {
      if (!scalar(code)) throw providerError("oauth provider returned no authorization code", 400);
      const redirectUri = redirectUriFor(callbackUrl);
      const sendRequest = createWitnessCoreBackedFetch({ fetchImpl, witnessCoreBridge, correlation });

      const tokenResponse = await sendRequest(oidc.tokenUrl, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: oidc.clientId,
          client_secret: oidc.clientSecret
        }).toString()
      });
      if (!tokenResponse || typeof tokenResponse.status !== "number") {
        throw providerError("oauth token exchange received no response", 502);
      }
      if (tokenResponse.status < 200 || tokenResponse.status >= 300) {
        throw providerError(`oauth token exchange responded ${tokenResponse.status}`, 502);
      }
      let tokenPayload = null;
      try {
        tokenPayload = typeof tokenResponse.json === "function" ? await tokenResponse.json() : null;
      } catch {
        tokenPayload = null;
      }
      const accessToken = scalar(tokenPayload?.access_token);
      if (!accessToken) throw providerError("oauth token exchange returned no access token", 502);

      const userinfoResponse = await sendRequest(oidc.userinfoUrl, {
        method: "GET",
        // Extra headers let vendor presets satisfy provider requirements (e.g. GitHub's mandatory
        // User-Agent) without a vendor-specific code path.
        headers: { authorization: `Bearer ${accessToken}`, accept: "application/json", ...(oidc.userinfoHeaders ?? {}) }
      });
      if (!userinfoResponse || typeof userinfoResponse.status !== "number") {
        throw providerError("oauth userinfo received no response", 502);
      }
      if (userinfoResponse.status < 200 || userinfoResponse.status >= 300) {
        throw providerError(`oauth userinfo responded ${userinfoResponse.status}`, 502);
      }
      let userinfo = null;
      try {
        userinfo = typeof userinfoResponse.json === "function" ? await userinfoResponse.json() : null;
      } catch {
        userinfo = null;
      }
      if (!userinfo || typeof userinfo !== "object") throw providerError("oauth userinfo response was not an object", 502);

      // Some providers (e.g. GitHub) return a numeric account id; coerce to a stable string.
      const rawExternalId = valueAtPath(userinfo, oidc.externalIdField);
      const externalId = typeof rawExternalId === "number" && Number.isFinite(rawExternalId)
        ? String(rawExternalId)
        : scalar(rawExternalId);
      if (!externalId) throw providerError(`oauth userinfo missing id at "${oidc.externalIdField}"`, 502);
      const username = scalar(oidc.usernameField ? valueAtPath(userinfo, oidc.usernameField) : null)
        || scalar(userinfo.preferred_username)
        || scalar(userinfo.email)
        || externalId;
      const label = scalar(oidc.labelField ? valueAtPath(userinfo, oidc.labelField) : null)
        || scalar(userinfo.name)
        || username;
      return { externalId, username, label };
    }
  };
}

// Select the adapter for a resolved auth.oauth config (provider already validated upstream). Any
// OIDC-family provider (generic oidc + named presets like google/github) resolves an `oidc` config.
export function createOAuthProvider(resolvedConfig) {
  if (resolvedConfig?.oidc) return createOidcProvider(resolvedConfig.oidc);
  return createStubProvider();
}
