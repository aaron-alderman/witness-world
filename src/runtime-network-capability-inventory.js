export const RUNTIME_NETWORK_CAPABILITY_INVENTORY = {
  loopbackMcpBridge: {
    capabilityId: "capability.network.loopback.mcp_stdio_bridge",
    scope: "utility-loopback",
    ownerFiles: [
      "src/cli.js"
    ],
    note: "Temporary utility-only exception: stdio MCP traffic is bridged into a private local runtime HTTP endpoint. This remains outside the canonical server-runtime boundary claim and is expected to disappear behind the worker transport/frontdoor tranches."
  },
  witnessCoreControlPlane: {
    capabilityId: "capability.network.control_plane.witness_core",
    scope: "server-runtime",
    ownerFiles: [
      "src/witness-core-http-transport.js"
    ],
    note: "Concrete HTTP/fetch fallback adapter for witness-core status, generations, serving, preview, verification persistence, and capability calls. Higher-level bridge semantics remain in src/witness-core-bridge.js, and supervised runtimes can now prefer the Rust-injected IPC carrier in src/witness-core-ipc-transport.js instead."
  },
  injectedServerFetch: {
    capabilityId: "capability.network.server.fetch_injection",
    scope: "server-runtime",
    ownerFiles: [
      "src/runtime-app-context.js",
      "src/runtime-route-handlers.js"
    ],
    note: "Dependency-injection points that hand a fetch implementation into server-side runtime factories and handlers."
  },
  oauthIdentityExchange: {
    capabilityId: "capability.network.oauth.identity_exchange",
    scope: "server-plugin",
    ownerFiles: [
      "plugins/oauth/oauth-providers.js"
    ],
    note: "OIDC/OAuth2 token and userinfo exchange for auth.oauth providers. In authoritative core mode, configured HTTP and HTTPS endpoints execute through witness-core instead of direct Node fetch."
  },
  notificationEmailDelivery: {
    capabilityIds: [
      "capability.notify.email.http_delivery",
      "capability.notify.email.sendgrid_delivery"
    ],
    scope: "server-plugin",
    ownerFiles: [
      "plugins/notifications/email-transports.js"
    ],
    note: "Real outbound email delivery transports. In authoritative core mode, configured HTTP and HTTPS endpoints execute through witness-core instead of direct Node fetch. Stub delivery remains local and non-networked."
  },
  httpOutboundDelivery: {
    capabilityId: "capability.network.http.outbound_delivery",
    scope: "server-plugin",
    ownerFiles: [
      "plugins/http-outbound/glue.js"
    ],
    note: "General authenticated outbound HTTP delivery for the http.outbound seam. In authoritative core mode, configured HTTP and HTTPS execution is routed through witness-core instead of direct Node fetch."
  },
  browserClientFetch: {
    capabilityId: "capability.browser.runtime_fetch",
    scope: "browser-client",
    ownerFiles: [
      "src/runtime-widget-page.js"
    ],
    note: "Browser/client fetch path kept separate from the server/runtime boundary inventory."
  }
};

export function runtimeNetworkCapabilityOwnerFiles() {
  return Object.values(RUNTIME_NETWORK_CAPABILITY_INVENTORY)
    .flatMap(entry => entry.ownerFiles ?? [])
    .sort((left, right) => left.localeCompare(right));
}
