export function renderDesktopRecentWorldsFactory() {
  return String.raw`
    const createDesktopRecentWorldRow = ${createDesktopRecentWorldRow.toString()};
    const renderDesktopRecentWorlds = ${renderDesktopRecentWorlds.toString()};
    const findDesktopRecentWorldRow = ${findDesktopRecentWorldRow.toString()};
    const bindDesktopRecentWorlds = ${bindDesktopRecentWorlds.toString()};
  `;
}

export function createDesktopRecentWorldRow({
  worldHome = "",
  document = null
} = {}) {
  const button = document?.createElement?.("button");
  if (!button) return null;
  button.type = "button";
  button.className = "surface-link-item recent-row";
  button.dataset.worldHome = String(worldHome);

  const title = document.createElement("strong");
  title.className = "surface-mono";
  title.textContent = String(worldHome);
  const subtitle = document.createElement("span");
  subtitle.className = "surface-note";
  subtitle.textContent = "Open this world directly";
  button.append(title, subtitle);
  return button;
}

export function renderDesktopRecentWorlds({
  root = null,
  rows = [],
  document = null
} = {}) {
  if (!root?.replaceChildren) return;
  if (!Array.isArray(rows) || !rows.length) {
    const empty = document?.createElement?.("p");
    if (!empty) {
      root.replaceChildren();
      return;
    }
    empty.className = "surface-note";
    empty.textContent = "No recent worlds yet.";
    root.replaceChildren(empty);
    return;
  }

  const items = rows
    .map(worldHome => createDesktopRecentWorldRow({ worldHome, document }))
    .filter(Boolean);
  root.replaceChildren(...items);
}

export function findDesktopRecentWorldRow(target = null, root = null) {
  let current = target || null;
  while (current && current !== root) {
    const worldHome = current?.dataset?.worldHome;
    if (typeof worldHome === "string" && worldHome) return current;
    current = current.parentElement || null;
  }
  return null;
}

export function bindDesktopRecentWorlds({
  root = null,
  desktop = null,
  setStatus = () => {},
  refresh = async () => {}
} = {}) {
  if (!root?.addEventListener) return null;
  const handler = async event => {
    const button = findDesktopRecentWorldRow(event?.target || null, root);
    if (!button) return false;
    setStatus("Opening selected world...");
    const result = await desktop.openWorldHome({ worldHome: button.dataset.worldHome || "" });
    if (result?.ok === false) {
      setStatus(result.reason || "Unable to open world.");
      await refresh();
    }
    return true;
  };
  root.addEventListener("click", event => {
    void handler(event);
  });
  return handler;
}
