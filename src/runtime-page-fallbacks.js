function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderRuntimeFallbackPage({
  title = "Runtime",
  heading = "Runtime",
  copy = "",
  allowHtml = false
} = {}) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: sans-serif; line-height: 1.5; padding: 2rem; max-width: 40rem; margin: 0 auto; color: #333; }
    h1 { border-bottom: 1px solid #eee; padding-bottom: 0.5rem; }
    p { margin: 1rem 0; }
    .composition-details { background: #f9f9f9; padding: 1rem; border-radius: 4px; border: 1px solid #eee; margin-top: 2rem; }
    .composition-details p { margin: 0.5rem 0; font-size: 0.9rem; }
    strong { color: #000; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(heading)}</h1>
    ${allowHtml ? copy : `<p>${escapeHtml(copy)}</p>`}
  </main>
</body>
</html>`;
}

export function renderCompositionGatedPage({
  title = "Feature Unavailable",
  heading = "Feature Unavailable",
  reason = "This feature is inactive in the current runtime composition.",
  requiredProfile = null,
  requiredPlugins = [],
  requiredBundles = [],
  activeProfile = null
} = {}) {
  const details = [];
  if (requiredProfile) {
    details.push(`<p><strong>Required Profile:</strong> ${escapeHtml(requiredProfile)}</p>`);
  }
  if (activeProfile) {
    details.push(`<p><strong>Active Profile:</strong> ${escapeHtml(activeProfile)}</p>`);
  }
  if (requiredPlugins.length) {
    details.push(`<p><strong>Required Plugins:</strong> ${requiredPlugins.map(escapeHtml).join(", ")}</p>`);
  }
  if (requiredBundles.length) {
    details.push(`<p><strong>Required Bundles:</strong> ${requiredBundles.map(escapeHtml).join(", ")}</p>`);
  }

  const copy = `
    <p>${escapeHtml(reason)}</p>
    ${details.length ? `<div class="composition-details">${details.join("")}</div>` : ""}
    <p><a href="/api/runtime/diagnostics">View Runtime Diagnostics</a></p>
  `;

  return renderRuntimeFallbackPage({
    title,
    heading,
    copy,
    allowHtml: true
  });
}

export function renderInactiveRuntimeWidgetPage({ rootWidget = null, appContext = null } = {}) {
  const widgetTitle = typeof rootWidget === "string" && rootWidget.trim()
    ? rootWidget.trim()
    : "Runtime";
  return renderCompositionGatedPage({
    title: widgetTitle,
    heading: widgetTitle,
    reason: "Widget rendering is not active in this runtime composition.",
    requiredBundles: ["bundle-canvas"], // Assumption based on typical widget usage
    activeProfile: appContext?.runtimeProfile ?? null
  });
}

export function renderInactiveBackendSeamsPage({ appContext = null } = {}) {
  return renderCompositionGatedPage({
    title: "Backend Seams",
    heading: "Backend Seams",
    reason: "Backend seams plugin is inactive.",
    requiredPlugins: ["plugin.backend-seams"],
    activeProfile: appContext?.runtimeProfile ?? null
  });
}
