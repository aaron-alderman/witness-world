export function renderSurfaceCommandViewFactory() {
  return String.raw`
    const renderSurfaceWhoamiResultView = ${renderSurfaceWhoamiResultView.toString()};
    const renderSurfaceCommandPaletteView = ${renderSurfaceCommandPaletteView.toString()};
  `;
}

export function renderSurfaceWhoamiResultView({
  whoami = null,
  escapeHtml = value => String(value ?? "")
} = {}) {
  if (!whoami) return "";
  const contextOptions = [""].concat(
    [...new Set([
      whoami.homeContextValue || "",
      ...((whoami.contextOptions || []).map(value => String(value || "")).filter(Boolean))
    ])]
  );
  const editStatus = whoami.statusMessage
    ? '<div class="surface-status-box" data-level="' + escapeHtml(whoami.statusLevel || "ok") + '">' + escapeHtml(whoami.statusMessage) + "</div>"
    : "";
  const inlineEditor = whoami.authenticated
    ? (whoami.editorReady
        ? '<form class="surface-form" data-surface-command-identity-form data-identity-id="' + escapeHtml(whoami.identity || "") + '">'
            + '<label class="surface-field"><span>Label</span><input name="label" value="' + escapeHtml(String(whoami.title || "")) + '" /></label>'
            + '<label class="surface-field"><span>Username</span><input name="username" value="' + escapeHtml(String(whoami.username || "")) + '" /></label>'
            + '<label class="surface-field"><span>New Password</span><input name="password" type="password" placeholder="leave unchanged" /></label>'
            + '<label class="surface-field"><span>Home Context</span><select name="homeContext">' + contextOptions.map(value =>
                '<option value="' + escapeHtml(value) + '"' + (value === String(whoami.homeContextValue || "") ? " selected" : "") + ">" + escapeHtml(value || "(none)") + "</option>"
              ).join("") + "</select></label>"
            + '<label class="surface-field"><span>Home Perspective</span><input name="homePerspective" value="' + escapeHtml(String(whoami.homePerspectiveValue || "")) + '" /></label>'
            + '<div class="surface-actions-compact"><button type="submit" data-surface-command-identity-save>Save Identity Here</button></div>'
          + "</form>"
        : '<div class="world-command-meta">' + escapeHtml(whoami.editorError || (whoami.editorLoading ? "Loading inline identity editor..." : "Inline identity editor is unavailable right now.")) + "</div>")
    : "";
  return '<section class="world-command-result" data-surface-command-result="whoami">'
    + "<strong>" + escapeHtml(whoami.title) + "</strong>"
    + '<div class="world-command-meta">' + escapeHtml(whoami.subtitle || "") + "</div>"
    + '<div class="world-command-result-grid">' + (whoami.rows || []).map(([key, value]) =>
        '<div class="world-command-result-row"><div class="world-command-result-key">' + escapeHtml(key) + '</div><div class="world-command-result-value">' + escapeHtml(value) + "</div></div>"
      ).join("") + "</div>"
    + '<div class="world-command-meta">' + escapeHtml(whoami.note || "") + "</div>"
    + editStatus
    + inlineEditor
    + '<div class="world-command-result-actions">'
      + (whoami.identity ? '<button type="button" data-surface-command-result-world>Open User</button>' : "")
      + (whoami.source?.file ? '<button type="button" data-surface-command-result-source>Open Source</button>' : "")
      + (whoami.bootstrapHref ? '<button type="button" data-surface-command-result-bootstrap>Edit In Bootstrap</button>' : "")
    + "</div>"
  + "</section>";
}

export function renderSurfaceCommandPaletteView({
  liveSurfaceInspectable = false,
  surfaceCommandOpen = false,
  query = "",
  items = [],
  graphError = "",
  graphLoaded = false,
  currentSelectionId = "",
  whoami = null,
  escapeHtml = value => String(value ?? "")
} = {}) {
  if (!liveSurfaceInspectable || !surfaceCommandOpen) return "";
  const graphNotice = graphError
    ? '<div class="surface-status-box" data-level="error">' + escapeHtml(graphError) + "</div>"
    : (!graphLoaded
        ? '<div class="world-command-meta">Loading world graph metadata for capabilities, routes, and source handoffs...</div>'
        : "");
  const currentSelection = currentSelectionId
    ? '<div class="world-command-meta">Selected widget / ' + escapeHtml(currentSelectionId) + "</div>"
    : '<div class="world-command-meta">No widget selected yet. Search current-page widgets to inspect them in place.</div>';
  const results = items.length
    ? items.map((item, index) => '<button class="world-command-item" data-surface-command-run="' + index + '"><strong>' + escapeHtml(item.title) + "</strong><span class=\"world-command-meta\">" + escapeHtml(item.type) + (item.subtitle ? " / " + escapeHtml(item.subtitle) : "") + "</span></button>").join("")
    : '<div class="world-command-empty">No matching pages, widgets, capabilities, or commands.</div>';
  return '<section class="surface-command-palette world-command-palette" data-surface-command-palette>'
    + '<div class="world-command-head">'
      + '<input class="world-command-input" data-surface-command-input placeholder="Search pages, widgets, capabilities, execution, commands..." value="' + escapeHtml(query) + '" />'
      + '<button class="world-command-toggle" data-surface-command-close>Close</button>'
    + "</div>"
    + currentSelection
    + graphNotice
    + renderSurfaceWhoamiResultView({ whoami, escapeHtml })
    + '<div class="world-command-list">' + results + "</div>"
  + "</section>";
}
