function listen(target, type, handler, cleanup) {
  if (!target || typeof target.addEventListener !== "function") return;
  target.addEventListener(type, handler);
  cleanup.push(() => target.removeEventListener(type, handler));
}

function queryAll(root, selector) {
  return selector ? [...root.querySelectorAll(selector)] : [];
}

function initShellNavigation({ document, navigation }, cleanup) {
  for (const node of queryAll(document, "[data-shell-nav-href]")) {
    listen(node, "click", event => {
      if (event.defaultPrevented) return;
      const href = node.getAttribute("data-shell-nav-href");
      if (!href) return;
      event.preventDefault();
      navigation.assign(href);
    }, cleanup);
  }
}

function initPasswordToggles(document, cleanup) {
  for (const button of queryAll(document, "[data-auth-password-toggle]")) {
    listen(button, "click", () => {
      const inputId = button.getAttribute("data-auth-password-toggle");
      const input = inputId ? document.getElementById(inputId) : null;
      if (!input) return;
      input.type = input.type === "password" ? "text" : "password";
      button.textContent = input.type === "password" ? "Show" : "Hide";
    }, cleanup);
  }
}

function initProfileMenu(document, cleanup) {
  const profileToggle = document.querySelector("[data-shell-profile-toggle]");
  const profileMenu = document.getElementById("up-menu");
  if (!profileToggle || !profileMenu) return;

  listen(profileToggle, "click", event => {
    event.stopPropagation();
    profileMenu.classList.toggle("open");
  }, cleanup);

  listen(document, "click", event => {
    if (!profileToggle.contains(event.target)) profileMenu.classList.remove("open");
  }, cleanup);
}

function initTabGroups(document, cleanup) {
  const groups = new Set(
    queryAll(document, "[data-shell-tab-group]")
      .map(node => node.getAttribute("data-shell-tab-group"))
      .filter(Boolean)
  );

  for (const group of groups) {
    const safeGroup = CSS.escape(group);
    const tabs = queryAll(document, `[data-shell-tab="${safeGroup}"][data-view]`);
    const views = queryAll(document, `[data-shell-frame-wrap="${safeGroup}"] [data-chart-view]`);
    if (!tabs.length || !views.length) continue;
    const setActive = viewKey => {
      for (const tab of tabs) tab.classList.toggle("active", tab.dataset.view === viewKey);
      for (const view of views) view.style.display = view.dataset.chartView === viewKey ? "" : "none";
    };
    for (const tab of tabs) {
      listen(tab, "click", () => setActive(tab.dataset.view), cleanup);
    }
    setActive(tabs[0].dataset.view);
  }
}

async function maybeLoadSurfaceConfig({ configHref, fetchJson }) {
  if (!configHref) return null;
  try {
    return await fetchJson(configHref);
  } catch (error) {
    console.warn("[engentus-runtime] config load failed", error);
    return null;
  }
}

export async function mountEngentusSurface(host) {
  const cleanup = [];
  initShellNavigation(host, cleanup);
  initPasswordToggles(host.document, cleanup);
  initProfileMenu(host.document, cleanup);
  initTabGroups(host.document, cleanup);
  await maybeLoadSurfaceConfig(host);
  return () => {
    while (cleanup.length) {
      try {
        cleanup.pop()();
      } catch {}
    }
  };
}

export default mountEngentusSurface;
