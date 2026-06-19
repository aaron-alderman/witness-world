export function buildOperatorDeepLink({
  extensionId,
  workspaceRoot,
  appManifestPath,
  reference
}) {
  const url = new URL(`vscode://${extensionId}/open`);
  url.searchParams.set("workspaceRoot", workspaceRoot);
  url.searchParams.set("appManifestPath", appManifestPath);
  url.searchParams.set("reference", reference);
  return url.toString();
}

export function parseOperatorDeepLink(value) {
  const url = value instanceof URL ? value : new URL(String(value));
  return {
    workspaceRoot: url.searchParams.get("workspaceRoot") || null,
    appManifestPath: url.searchParams.get("appManifestPath") || null,
    reference: url.searchParams.get("reference") || null
  };
}
