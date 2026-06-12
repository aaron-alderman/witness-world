export const KNOWN_RUNTIME_SHELL_IDS = Object.freeze(["browser", "mcp", "desktop"]);

const SHELL_DEFINITIONS = Object.freeze({
  browser: Object.freeze({
    id: "browser",
    status: "present",
    role: "Reachability proof over the shared world and runtime model.",
    adapters: ["http routes", "session-backed pages", "operator surfaces"],
    shellOnlyPowers: ["page navigation", "session cookies", "live page rendering"],
    prohibitedAmbientPowers: [
      "desktop-native file dialogs in core",
      "packaging/update lifecycle in core",
      "implicit automation identity"
    ]
  }),
  mcp: Object.freeze({
    id: "mcp",
    status: "present",
    role: "Automation shell over explicit MCP server and tool-install objects.",
    adapters: ["stdio transport", "http transport", "tool invocation"],
    shellOnlyPowers: ["transport bridging", "tool-call execution", "delegated versus service acting modes"],
    prohibitedAmbientPowers: [
      "transport details in the world model",
      "hidden global automation identity",
      "implicit tool exposure outside mcpServer or mcpToolInstall"
    ]
  }),
  desktop: Object.freeze({
    id: "desktop",
    status: "present",
    role: "Ownership shell for local-native world selection over the same world and runtime model.",
    adapters: ["native windowing", "native world-home picker", "explicit desktop capabilities"],
    shellOnlyPowers: ["world-home open", "world-home create", "reveal world home in file manager"],
    prohibitedAmbientPowers: [
      "filesystem authority as an ambient core power",
      "desktop-only packaging state in the core model",
      "web app in a box treated as a separate product"
    ]
  })
});

export function availableRuntimeShellIds() {
  return [...KNOWN_RUNTIME_SHELL_IDS];
}

export function buildRuntimeShellDiagnostics({
  activeBundleIds = [],
  startupMode = "serve"
} = {}) {
  const activeBundles = new Set((activeBundleIds ?? []).map(String));
  const browserActive = startupMode === "serve" || startupMode === "bootstrap";
  const mcpAvailable = activeBundles.has("bundle-mcp");
  const mcpActive = startupMode === "mcp" && mcpAvailable;
  const desktopActive = startupMode === "desktop";

  const shells = availableRuntimeShellIds().map(id => {
    const base = SHELL_DEFINITIONS[id];
    const available = id === "browser"
      ? browserActive
      : (id === "mcp" ? mcpAvailable : desktopActive);
    const active = id === "browser"
      ? browserActive
      : (id === "mcp" ? mcpActive : desktopActive);
    return {
      ...base,
      available,
      active,
      adapters: [...base.adapters],
      shellOnlyPowers: [...base.shellOnlyPowers],
      prohibitedAmbientPowers: [...base.prohibitedAmbientPowers]
    };
  });

  return {
    contractVersion: "2026-06-12",
    startupMode,
    activeShellIds: shells.filter(shell => shell.active).map(shell => shell.id),
    invariants: [
      "core truth stays in the witness-oriented world model",
      "runtime owns generic execution and capability plumbing",
      "shells adapt transport and local experience without becoming alternate products",
      "desktop-only powers must stay explicit instead of leaking into browser or MCP paths",
      "MCP transport semantics must remain shell-facing rather than world-model assumptions"
    ],
    shells
  };
}
