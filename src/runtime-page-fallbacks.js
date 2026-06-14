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
  copy = ""
} = {}) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
</head>
<body>
  <main>
    <h1>${escapeHtml(heading)}</h1>
    <p>${escapeHtml(copy)}</p>
  </main>
</body>
</html>`;
}

export function renderInactiveRuntimeWidgetPage({ rootWidget = null } = {}) {
  const widgetTitle = typeof rootWidget === "string" && rootWidget.trim()
    ? rootWidget.trim()
    : "Runtime";
  return renderRuntimeFallbackPage({
    title: widgetTitle,
    heading: widgetTitle,
    copy: "Widget rendering is not active in this runtime composition."
  });
}

export function renderInactiveBackendSeamsPage() {
  return renderRuntimeFallbackPage({
    title: "Backend Seams",
    heading: "Backend Seams",
    copy: "Backend seams plugin is inactive."
  });
}
