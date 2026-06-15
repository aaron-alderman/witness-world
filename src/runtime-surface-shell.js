function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function normalizePathname(pathname) {
  const raw = String(pathname || "/").trim() || "/";
  if (raw === "/") return "/";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, "") : withSlash;
}

export function readSurfaceMapFromWorld(world) {
  const surfaces = new Map();
  for (const witness of world.allWitnesses()) {
    if (witness.process !== "desire.defineSurface" || !witness.body?.id) continue;
    surfaces.set(witness.body.id, witness.body);
  }
  return surfaces;
}

function surfaceProps(surface) {
  return surface?.props && typeof surface.props === "object" ? surface.props : {};
}

function firstTruthy(...values) {
  for (const value of values) {
    if (value == null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    return value;
  }
  return null;
}

function rawHtml(value) {
  return String(value ?? "");
}

function joinClassNames(...values) {
  return values
    .filter(value => typeof value === "string" && value.trim())
    .map(value => value.trim())
    .join(" ");
}

function uniqueTruthy(values = []) {
  return [...new Set(values.filter(value => {
    if (value == null) return false;
    if (typeof value === "string" && !value.trim()) return false;
    return true;
  }))];
}

function parseList(value) {
  if (Array.isArray(value)) {
    return value
      .map(item => typeof item === "string" ? item.trim() : "")
      .filter(Boolean);
  }
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

function navTargetAttr(href) {
  const target = firstTruthy(href, "");
  return target ? ` data-shell-nav-href="${escapeHtml(target)}"` : "";
}

function childSurfaceRows(surface, surfaces, kind = null) {
  const childIds = Array.isArray(surface?.children) ? surface.children : [];
  return childIds
    .map(childId => surfaces.get(childId))
    .filter(Boolean)
    .filter(child => !kind || child.surfaceKind === kind);
}

function sidebarSurfaceByRole(surface, surfaces, role = null) {
  return childSurfaceRows(surface, surfaces, "sidebar")
    .find(child => firstTruthy(surfaceProps(child).role, "") === role) ?? null;
}

function primarySidebarSurface(surface, surfaces) {
  return childSurfaceRows(surface, surfaces, "sidebar")
    .find(child => {
      const role = firstTruthy(surfaceProps(child).role, "");
      return role !== "toolbar" && role !== "metrics";
    }) ?? null;
}

function secondarySidebarSurface(surface, surfaces) {
  return sidebarSurfaceByRole(surface, surfaces, "metrics");
}

function collectIndexedRows(props, { prefix = "item", count = 12, required = "title", fields = [] } = {}) {
  const rows = [];
  for (let index = 1; index <= count; index += 1) {
    const row = {};
    let hasRequired = false;
    for (const field of fields) {
      const key = `${prefix}${index}${field[0].toUpperCase()}${field.slice(1)}`;
      const value = props[key];
      if (value == null || value === "") continue;
      row[field] = value;
      if (field === required) hasRequired = true;
    }
    if (hasRequired) rows.push(row);
  }
  return rows;
}

function routeMatchesSurface(surface, pathname, screenKey = null) {
  const props = surfaceProps(surface);
  const routeKey = firstTruthy(props.routeKey, surface.id);
  const routePath = firstTruthy(props.routePath, null);
  if (screenKey && routeKey === screenKey) return true;
  if (routePath && normalizePathname(routePath) === normalizePathname(pathname)) return true;
  return false;
}

function selectShellSurface({ root, surfaces, pathname, route, defaultScreen = null }) {
  const childIds = Array.isArray(root?.children) ? root.children : [];
  const screenKey = typeof route?.params?.screen === "string" && route.params.screen.trim()
    ? route.params.screen.trim()
    : null;
  const children = childIds.map(childId => surfaces.get(childId)).filter(Boolean);
  const explicit = children.find(child => routeMatchesSurface(child, pathname, screenKey));
  if (explicit) return explicit;
  if (defaultScreen) {
    const fallback = children.find(child => firstTruthy(surfaceProps(child).routeKey, child.id) === defaultScreen);
    if (fallback) return fallback;
  }
  return children[0] ?? null;
}

function imageMarkup(src, alt, className = "", extra = "") {
  if (!src) return "";
  return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${className ? ` class="${escapeHtml(className)}"` : ""}${extra ? ` ${extra}` : ""}>`;
}

function formattedInlineMarkup(value, { accent = null } = {}) {
  const text = String(value ?? "").replace(/\\n/g, "\n");
  if (!text) return "";
  const renderedText = part => escapeHtml(part).replace(/\n/g, "<br>");
  const highlight = typeof accent === "string" && accent ? accent : "";
  const accentIndex = highlight ? text.indexOf(highlight) : -1;
  if (accentIndex < 0) return renderedText(text);
  const before = text.slice(0, accentIndex);
  const matched = text.slice(accentIndex, accentIndex + highlight.length);
  const after = text.slice(accentIndex + highlight.length);
  return `${renderedText(before)}<em>${renderedText(matched)}</em>${renderedText(after)}`;
}

function renderBrandLockup(rootProps, {
  brandClass = "",
  dividerClass = "",
  dividerId = "",
  productClass = "",
  brandImgClass = "",
  productImgClass = "",
  brandImgExtra = "",
  productImgExtra = "",
  hero = false
} = {}) {
  const brandLogoSrc = firstTruthy(rootProps.brandLogoSrc, null);
  const productLogoSrc = firstTruthy(hero ? rootProps.heroProductLogoSrc : rootProps.productLogoSrc, rootProps.productLogoSrc, null);
  const brandName = firstTruthy(rootProps.brandName, "DESIRE");
  const productName = firstTruthy(rootProps.productName, "App");
  const brandMarkup = brandLogoSrc
    ? imageMarkup(brandLogoSrc, brandName, brandImgClass, brandImgExtra)
    : `<span class="${escapeHtml(brandClass)}">${escapeHtml(brandName)}</span>`;
  const productMarkup = productLogoSrc
    ? imageMarkup(productLogoSrc, productName, productImgClass, productImgExtra)
    : `<span class="${escapeHtml(productClass)}">${escapeHtml(productName)}</span>`;
  return `${brandMarkup}<div${dividerId ? ` id="${escapeHtml(dividerId)}"` : ""}${dividerClass ? ` class="${escapeHtml(dividerClass)}"` : ""}></div>${productMarkup}`;
}

function moduleCardHref(surface) {
  return firstTruthy(surfaceProps(surface).href, "#");
}

function surfaceDomId(surface, fallback = "") {
  return firstTruthy(surfaceProps(surface).domId, fallback);
}

function stableDomToken(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function fallbackSurfaceDomId(surface, prefix = "surface") {
  const routeKey = firstTruthy(surfaceProps(surface).routeKey, null);
  const surfaceId = firstTruthy(surface?.id, null);
  const token = stableDomToken(firstTruthy(routeKey, surfaceId, surface?.surfaceKind, "node"));
  return token ? `${prefix}-${token}` : prefix;
}

function chartChildSurfaces(surface, surfaces) {
  return childSurfaceRows(surface, surfaces).filter(child => child.surfaceKind === "chart");
}

function chartViewDescriptors(surface, surfaces) {
  const charts = chartChildSurfaces(surface, surfaces);
  const props = surfaceProps(surface);
  const tabs = collectIndexedRows(props, {
    prefix: "chartTab",
    count: 6,
    required: "label",
    fields: ["label", "key"]
  });
  if (!tabs.length) {
    return charts.map((chart, index) => ({
      chart,
      viewKey: `view-${index + 1}`
    }));
  }
  return charts.map((chart, index) => ({
    chart,
    viewKey: firstTruthy(
      tabs[index]?.key,
      `view-${index + 1}`
    )
  }));
}

function pagePresentationAssets(root, activeSurface) {
  const rootProps = surfaceProps(root);
  const activeProps = surfaceProps(activeSurface);
  return {
    stylesheetHrefs: uniqueTruthy([
      ...parseList(rootProps.pageStylesheetHrefs),
      ...parseList(activeProps.pageStylesheetHrefs)
    ]),
    scriptSrcs: uniqueTruthy([
      ...parseList(rootProps.pageScriptSrcs),
      ...parseList(activeProps.pageScriptSrcs)
    ])
  };
}

function renderChartHostMarkup({
  chartSurface,
  mountedChartRuntime = null,
  mountMode = "mounted-panel",
  visible = true,
  viewKey = "",
  fallbackId = "",
  includeOverlayCanvas = true,
  includeTooltip = true
} = {}) {
  if (mountMode !== "iframe" && typeof mountedChartRuntime?.renderMountedChart === "function") {
    const mounted = mountedChartRuntime.renderMountedChart(chartSurface, {
      mountMode,
      visible,
      viewKey,
      includeOverlayCanvas,
      includeTooltip
    });
    if (typeof mounted === "string" && mounted.trim()) return mounted;
  }
  return iframeMarkup({
    id: fallbackId,
    title: firstTruthy(surfaceProps(chartSurface).title, chartSurface.id),
    chartSurface,
    visible,
    mountMode,
    viewKey
  });
}

function moduleCardMarkup(surface) {
  const props = surfaceProps(surface);
  const state = firstTruthy(props.state, "available");
  const assetSrc = firstTruthy(props.assetSrc, null);
  const assetMarkup = assetSrc
    ? imageMarkup(assetSrc, firstTruthy(props.assetAlt, props.title, surface.id), "mod-icon-img")
    : `<span class="mod-icon-glyph">${escapeHtml(firstTruthy(props.assetRef, "MODULE"))}</span>`;
  return `
    <div class="mod-card ${escapeHtml(firstTruthy(props.class, state === "available" ? "active" : state))}"${navTargetAttr(state === "available" ? moduleCardHref(surface) : null)} data-route-key="${escapeHtml(firstTruthy(props.routeKey, ""))}">
      ${state === "locked" ? '<span class="mod-lock">🔒</span>' : ""}
      <div class="mod-icon">${assetMarkup}</div>
      <div class="mod-name">${escapeHtml(firstTruthy(props.title, surface.id))}</div>
      <div class="mod-desc">${escapeHtml(firstTruthy(props.description, ""))}</div>
      <div class="mod-status ${state === "available" ? "ms-open" : "ms-soon"}">${escapeHtml(firstTruthy(props.statusLabel, state))}</div>
    </div>
  `;
}

function newsSidebarMarkup(sidebar) {
  const props = surfaceProps(sidebar);
  const items = collectIndexedRows(props, {
    prefix: "item",
    count: 10,
    required: "title",
    fields: ["category", "title", "time", "tone"]
  });
  const toneClass = tone => {
    switch (tone) {
      case "alert": return "ni-alert";
      case "product": return "ni-product";
      case "industry": return "ni-industry";
      default: return "ni-platform";
    }
  };
  return `
    <div id="${escapeHtml(firstTruthy(props.domId, "news-panel"))}">
      <div class="news-hdr">
        <span>${escapeHtml(firstTruthy(props.headerLabel, "Feed"))}</span>
        <div class="news-live"><div class="news-live-dot"></div>${escapeHtml(firstTruthy(props.liveLabel, "Live"))}</div>
      </div>
      <div class="news-list">
        ${items.map(item => `
          <div class="news-item ${toneClass(firstTruthy(item.tone, "platform"))}">
            <div class="ni-cat">${escapeHtml(firstTruthy(item.category, "Platform"))}</div>
            <div class="ni-title">${escapeHtml(item.title)}</div>
            <div class="ni-time">${escapeHtml(firstTruthy(item.time, ""))}</div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderSidebarSections(sidebar, { titleClass = "ssec-title", sectionClass = "ssec", listClass = "sidebar-list" } = {}) {
  const props = surfaceProps(sidebar);
  const sections = [];
  for (let index = 1; index <= 8; index += 1) {
    const title = props[`section${index}Title`];
    if (!title) continue;
    const items = [];
    for (let itemIndex = 1; itemIndex <= 8; itemIndex += 1) {
      const value = props[`section${index}Item${itemIndex}`];
      if (value) items.push(value);
    }
    sections.push({
      title,
      items,
      note: props[`section${index}Note`] ?? null,
      noteHtml: props[`section${index}NoteHtml`] ?? null,
      domId: props[`section${index}DomId`] ?? null,
      className: props[`section${index}Class`] ?? null,
      style: props[`section${index}Style`] ?? null,
      titleActionLabel: props[`section${index}TitleActionLabel`] ?? null,
      titleActionDomId: props[`section${index}TitleActionDomId`] ?? null,
      titleActionClass: props[`section${index}TitleActionClass`] ?? null,
      titleActionHref: props[`section${index}TitleActionHref`] ?? null,
      contentHtml: props[`section${index}ContentHtml`] ?? null
    });
  }
  return sections.map(section => `
    <div${section.domId ? ` id="${escapeHtml(section.domId)}"` : ""}${joinClassNames(sectionClass, section.className) ? ` class="${escapeHtml(joinClassNames(sectionClass, section.className))}"` : ""}${section.style ? ` style="${escapeHtml(section.style)}"` : ""}>
      <div class="${titleClass}">
        <span>${escapeHtml(section.title)}</span>
        ${section.titleActionLabel
          ? (section.titleActionHref
              ? `<a${section.titleActionDomId ? ` id="${escapeHtml(section.titleActionDomId)}"` : ""}${section.titleActionClass ? ` class="${escapeHtml(section.titleActionClass)}"` : ""} href="${escapeHtml(section.titleActionHref)}">${escapeHtml(section.titleActionLabel)}</a>`
              : `<button type="button"${section.titleActionDomId ? ` id="${escapeHtml(section.titleActionDomId)}"` : ""}${section.titleActionClass ? ` class="${escapeHtml(section.titleActionClass)}"` : ""}>${escapeHtml(section.titleActionLabel)}</button>`)
          : ""}
      </div>
      ${section.contentHtml
        ? rawHtml(section.contentHtml)
        : section.items.length
          ? `<ul class="${listClass}">${section.items.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
          : ""}
      ${section.noteHtml ? rawHtml(section.noteHtml) : section.note ? `<p class="sidebar-note">${escapeHtml(section.note)}</p>` : ""}
    </div>
  `).join("");
}

function collectToolbarButtons(props, prefix) {
  return collectIndexedRows(props, {
    prefix,
    count: 6,
    required: "label",
    fields: ["label", "key"]
  });
}

function toolbarMarkup(root, activeSurface) {
  const rootProps = surfaceProps(root);
  const props = surfaceProps(activeSurface);
  const modeButtons = collectToolbarButtons(props, "toolbarMode");
  const actionButtons = collectToolbarButtons(props, "toolbarAction");
  const showTools = modeButtons.length > 0 || actionButtons.length > 0;
  const toolsDomId = firstTruthy(props.toolsDomId, "tb-tools");
  const brandClickable = props.brandClickable === true || firstTruthy(props.brandClickable, "") === "true";
  return `
    <div id="tb">
      <div id="tb-brand"${brandClickable ? ' class="clickable"' : ""}${navTargetAttr(firstTruthy(rootProps.homeHref, null))}>
        ${renderBrandLockup(rootProps, {
          dividerId: "tb-divider",
          brandImgExtra: 'style="height:20px;width:auto;flex-shrink:0"',
          productImgExtra: 'style="height:22px;width:auto;flex-shrink:0"'
        })}
      </div>
      <div id="${escapeHtml(toolsDomId)}" style="display:${showTools ? "flex" : "none"}">
        ${modeButtons.length ? `
          <div class="mode-pill">
            ${modeButtons.map((button, index) => `<button class="mode-btn${index === 0 ? " on" : ""}" type="button"${button.key ? ` data-mode="${escapeHtml(button.key)}"` : ""}>${escapeHtml(button.label)}</button>`).join("")}
          </div>
        ` : ""}
        ${actionButtons.length ? `
          <div id="tb-wins">
            ${actionButtons.map(button => `<button class="tbw" type="button"${button.key ? ` data-win="${escapeHtml(button.key)}"` : ""}>${escapeHtml(button.label)}</button>`).join("")}
          </div>
        ` : ""}
      </div>
      <div id="user-prof" data-shell-profile-toggle>
        <div id="up-avatar">${escapeHtml(firstTruthy(rootProps.profileInitials, "AA"))}</div>
        <div id="up-info">
          <div id="up-name">${escapeHtml(firstTruthy(rootProps.profileName, "User"))}</div>
          <div id="up-role">${escapeHtml(firstTruthy(rootProps.profileRole, ""))}</div>
        </div>
        <span id="up-caret">▾</span>
        <div id="up-menu">
          <div class="up-mi"><span class="up-mi-icon">👤</span>Profile</div>
          <div class="up-mi"><span class="up-mi-icon">⚙</span>Settings</div>
          <div class="up-mi"><span class="up-mi-icon">📋</span>Report export</div>
          <div class="up-sep"></div>
          <div class="up-mi"><span class="up-mi-icon">🏭</span>${escapeHtml(firstTruthy(rootProps.siteLabel, "Site"))}</div>
          <div class="up-sep"></div>
          <div class="up-mi up-mi-signout"${navTargetAttr(firstTruthy(props.signoutHref, rootProps.signoutHref, "/signout"))} style="color:#f87171;cursor:pointer"><span class="up-mi-icon">↩</span>Sign out</div>
        </div>
      </div>
    </div>
  `;
}

function authScreenMarkup(root, surface) {
  const rootProps = surfaceProps(root);
  const props = surfaceProps(surface);
  const bullets = collectIndexedRows(props, {
    prefix: "feature",
    count: 6,
    required: "title",
    fields: ["title"]
  });
  const isSignout = firstTruthy(props.routeKey, "") === "signout";
  const domId = surfaceDomId(surface, fallbackSurfaceDomId(surface, "surface-auth"));
  const authScreenClass = joinClassNames("surface-auth-view", typeof surface?.class === "string" ? surface.class : "");
  return `
    <div id="${escapeHtml(domId)}"${authScreenClass ? ` class="${escapeHtml(authScreenClass)}"` : ""}>
      <div class="auth-book">
        <div class="auth-left">
          <div class="auth-brand">
            ${renderBrandLockup(rootProps, {
              dividerClass: "auth-brand-div",
              brandImgExtra: 'style="height:17px;width:auto;flex-shrink:0"',
              productImgExtra: 'style="height:19px;width:auto;flex-shrink:0"'
            })}
          </div>
          <div class="auth-hero">
            ${imageMarkup(firstTruthy(rootProps.heroProductLogoSrc, rootProps.productLogoSrc, null), firstTruthy(rootProps.productName, "App"), "", 'style="height:42px;width:auto;margin-bottom:28px"')}
            <div class="auth-tagline">${formattedInlineMarkup(firstTruthy(props.heroTitle, ""), { accent: firstTruthy(props.heroAccent, null) })}</div>
            <p class="auth-sub">${formattedInlineMarkup(firstTruthy(props.heroBody, ""))}</p>
            <ul class="auth-bullets">
              ${bullets.map(item => `<li class="auth-bullet"><span class="auth-bullet-dot"></span>${escapeHtml(item.title)}</li>`).join("")}
            </ul>
          </div>
          <div class="auth-footer">${escapeHtml(firstTruthy(props.footerText, rootProps.footerText, ""))}</div>
        </div>
        <div class="auth-right">
          <div class="auth-form-wrap"${isSignout ? ' style="text-align:center"' : ""}>
            <div class="auth-form-logo"${isSignout ? ' style="display:flex;justify-content:center"' : ""}>
              ${imageMarkup(firstTruthy(rootProps.productLogoSrc, null), firstTruthy(rootProps.productName, "App"), "", 'style="height:30px;width:auto"')}
            </div>
            ${isSignout ? '<div class="auth-signout-icon">✓</div>' : ""}
            <h2 class="${isSignout ? "auth-so-title" : "auth-form-title"}">${formattedInlineMarkup(firstTruthy(props.title, ""))}</h2>
            <p class="${isSignout ? "auth-so-sub" : "auth-form-sub"}">${formattedInlineMarkup(firstTruthy(props.subtitle, ""))}</p>
            ${!isSignout ? `
              <button class="ms-btn" id="ms-btn" type="button"${navTargetAttr(firstTruthy(props.secondaryActionHref, props.primaryActionHref, "/"))}>
                <svg width="18" height="18" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
                  <rect x="0" y="0" width="10" height="10" fill="#f25022"></rect>
                  <rect x="11" y="0" width="10" height="10" fill="#7fba00"></rect>
                  <rect x="0" y="11" width="10" height="10" fill="#00a4ef"></rect>
                  <rect x="11" y="11" width="10" height="10" fill="#ffb900"></rect>
                </svg>
                Sign in with Microsoft
              </button>
              <div class="auth-divider">
                <div class="auth-divider-line"></div>
                <span class="auth-divider-text">or continue with email</span>
                <div class="auth-divider-line"></div>
              </div>
              <div class="auth-field">
                <label for="login-email">Email address</label>
                <input type="email" id="login-email" class="auth-input" placeholder="you@company.com" autocomplete="email">
              </div>
              <div class="auth-field">
                <label for="login-pw">Password</label>
                <div class="auth-pw-wrap">
                  <input type="password" id="login-pw" class="auth-input" placeholder="••••••••" autocomplete="current-password" style="padding-right:36px">
                  <button class="auth-pw-toggle" type="button" data-auth-password-toggle="login-pw">◉</button>
                </div>
              </div>
              <div class="auth-forgot"><a href="${escapeHtml(firstTruthy(props.helpHref, "#"))}">${escapeHtml(firstTruthy(props.helpLabel, "Forgot password?"))}</a></div>
            ` : ""}
            <button class="auth-submit" type="button"${navTargetAttr(firstTruthy(props.primaryActionHref, "/"))}>${escapeHtml(firstTruthy(props.primaryActionLabel, isSignout ? "Continue" : "Sign in"))}</button>
            <div class="auth-form-footer"${isSignout ? ' style="margin-top:16px"' : ""}>${firstTruthy(props.footnoteHtml, null) ? rawHtml(props.footnoteHtml) : formattedInlineMarkup(firstTruthy(props.footnote, ""))}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function sidebarGridShellMarkup(root, surface, surfaces) {
  const props = surfaceProps(surface);
  const news = primarySidebarSurface(surface, surfaces);
  const grid = childSurfaceRows(surface, surfaces, "grid")[0] ?? null;
  const cards = childSurfaceRows(grid, surfaces, "module-card");
  const newsDomId = surfaceDomId(news, fallbackSurfaceDomId(news, "surface-sidebar"));
  const gridDomId = surfaceDomId(grid, fallbackSurfaceDomId(grid, "surface-grid"));
  const pillClass = firstTruthy(props.pillClass, "surface-shell-pill");
  return `
    ${toolbarMarkup(root, surface)}
    <div id="${escapeHtml(surfaceDomId(surface, fallbackSurfaceDomId(surface, "surface-shell")))}">
      ${news ? newsSidebarMarkup({ ...news, props: { ...surfaceProps(news), domId: newsDomId } }) : ""}
      <div id="${escapeHtml(firstTruthy(props.mainRegionDomId, "surface-main"))}">
        <div class="mod-area-hdr">
          <h2>${escapeHtml(firstTruthy(props.title, "Analysis Modules"))}</h2>
          <div class="mod-area-meta">
            <p>${escapeHtml(firstTruthy(props.subtitle, "Select a module to begin analysis"))}</p>
            ${props.pillText ? `<div class="${escapeHtml(pillClass)}">${escapeHtml(props.pillText)}</div>` : ""}
          </div>
        </div>
        <div id="${escapeHtml(gridDomId)}">
          ${cards.map(moduleCardMarkup).join("")}
        </div>
      </div>
    </div>
  `;
}

function iframeMarkup({
  id = "",
  title = "",
  chartSurface,
  visible = true,
  mountMode = "mounted-panel",
  viewKey = ""
} = {}) {
  const resolvedViewKey = firstTruthy(
    viewKey,
    surfaceProps(chartSurface).viewKey,
    surfaceProps(chartSurface).domId,
    chartSurface?.id,
    "chart-view"
  );
  return `<iframe${id ? ` id="${escapeHtml(id)}"` : ""} class="surface-chart-frame"${visible ? "" : ' style="display:none"'} data-chart-view="${escapeHtml(resolvedViewKey)}" data-mount-mode="${escapeHtml(mountMode)}" data-surface-id="${escapeHtml(chartSurface.id)}" src="/chart?chart=${encodeURIComponent(chartSurface.id)}" title="${escapeHtml(title)}"></iframe>`;
}

function sidebarMainShellMarkup(root, surface, surfaces, mountedChartRuntime = null) {
  const props = surfaceProps(surface);
  const sidebar = primarySidebarSurface(surface, surfaces);
  const chart = chartChildSurfaces(surface, surfaces)[0] ?? null;
  const sidebarDomId = surfaceDomId(sidebar, "shell-sidebar");
  const mainBeforeFrameHtml = firstTruthy(props.mainBeforeFrameHtml, null);
  const mainAfterFrameHtml = firstTruthy(props.mainAfterFrameHtml, null);
  return `
    ${toolbarMarkup(root, surface)}
    <div id="${escapeHtml(firstTruthy(props.domId, "surface-viewer-main"))}">
      <div id="${escapeHtml(firstTruthy(props.shellBodyDomId, "shell-body"))}">
        <div id="${escapeHtml(sidebarDomId)}">
          <div id="${escapeHtml(firstTruthy(surfaceProps(sidebar).scrollDomId, `${sidebarDomId}-scroll`))}">
            ${sidebar ? renderSidebarSections(sidebar) : ""}
          </div>
        </div>
        <div id="${escapeHtml(firstTruthy(props.mainRegionDomId, "shell-main"))}">
          ${mainBeforeFrameHtml ? rawHtml(mainBeforeFrameHtml) : ""}
          <div id="${escapeHtml(firstTruthy(props.frameWrapDomId, "shell-frame-wrap"))}">
            ${chart ? renderChartHostMarkup({
              chartSurface: chart,
              mountedChartRuntime,
              mountMode: firstTruthy(props.mountMode, "mounted-panel"),
              visible: true,
              fallbackId: firstTruthy(props.frameDomId, chart.id)
            }) : ""}
          </div>
          ${mainAfterFrameHtml ? rawHtml(mainAfterFrameHtml) : ""}
        </div>
      </div>
    </div>
  `;
}

function sidebarMainMetricsShellMarkup(root, surface, surfaces, mountedChartRuntime = null) {
  const props = surfaceProps(surface);
  const sidebar = primarySidebarSurface(surface, surfaces);
  const metrics = secondarySidebarSurface(surface, surfaces);
  const chart = chartChildSurfaces(surface, surfaces)[0] ?? null;
  const sidebarDomId = surfaceDomId(sidebar, "shell-sidebar");
  const metricsDomId = surfaceDomId(metrics, "shell-metrics");
  const metricsHeaderDomId = firstTruthy(surfaceProps(metrics).headerDomId, `${metricsDomId}-hdr`);
  const metricsPanelDomId = firstTruthy(surfaceProps(metrics).panelDomId, `${metricsDomId}-panel`);
  const mainBeforeFrameHtml = firstTruthy(props.mainBeforeFrameHtml, null);
  const mainAfterFrameHtml = firstTruthy(props.mainAfterFrameHtml, null);
  return `
    ${toolbarMarkup(root, surface)}
    <div id="${escapeHtml(firstTruthy(props.domId, "surface-viewer-metrics"))}">
      <div id="${escapeHtml(firstTruthy(props.shellBodyDomId, "shell-body"))}">
        <div id="${escapeHtml(sidebarDomId)}">
          <div id="${escapeHtml(firstTruthy(surfaceProps(sidebar).scrollDomId, `${sidebarDomId}-scroll`))}">
            ${sidebar ? renderSidebarSections(sidebar) : ""}
          </div>
        </div>
        <div id="${escapeHtml(firstTruthy(props.mainRegionDomId, "shell-main"))}">
          ${mainBeforeFrameHtml ? rawHtml(mainBeforeFrameHtml) : ""}
          <div id="${escapeHtml(firstTruthy(props.frameWrapDomId, "shell-frame-wrap"))}">
            ${chart ? renderChartHostMarkup({
              chartSurface: chart,
              mountedChartRuntime,
              mountMode: firstTruthy(props.mountMode, "mounted-panel"),
              visible: true,
              fallbackId: firstTruthy(props.frameDomId, chart.id)
            }) : ""}
          </div>
          ${mainAfterFrameHtml ? rawHtml(mainAfterFrameHtml) : ""}
        </div>
        <div id="${escapeHtml(metricsDomId)}">
          <div id="${escapeHtml(metricsHeaderDomId)}">${escapeHtml(firstTruthy(surfaceProps(metrics).headerLabel, "Metrics"))}</div>
          <div id="${escapeHtml(metricsPanelDomId)}">
            ${metrics ? renderSidebarSections(metrics, { titleClass: "metric-group-title", sectionClass: "metric-group", listClass: "metric-list" }) : ""}
          </div>
        </div>
      </div>
    </div>
  `;
}

function tabbedViewerShellMarkup(root, surface, surfaces, mountedChartRuntime = null) {
  const props = surfaceProps(surface);
  const sidebar = primarySidebarSurface(surface, surfaces);
  const charts = chartChildSurfaces(surface, surfaces);
  const tabs = collectIndexedRows(props, {
    prefix: "chartTab",
    count: 6,
    required: "label",
    fields: ["label", "key"]
  });
  const resolvedTabs = tabs.length
    ? tabs.map((tab, index) => ({
        label: tab.label,
        key: firstTruthy(tab.key, `view-${index + 1}`),
        chart: charts[index] ?? null
      })).filter(row => row.chart)
    : charts.map((chart, index) => ({
        label: firstTruthy(surfaceProps(chart).title, chart.id),
        key: `view-${index + 1}`,
        chart
      }));
  const sidebarDomId = surfaceDomId(sidebar, "shell-sidebar");
  const tabGroup = firstTruthy(props.tabsGroupId, props.tabsDomId, firstTruthy(props.domId, surface.id));
  const tabClass = firstTruthy(props.tabClass, "surface-shell-tab");
  const frameIdPrefix = firstTruthy(props.frameIdPrefix, "");
  const mountMode = firstTruthy(props.mountMode, "iframe");
  const mainBeforeFrameHtml = firstTruthy(props.mainBeforeFrameHtml, null);
  const mainAfterFrameHtml = firstTruthy(props.mainAfterFrameHtml, null);
  const chartDescriptors = typeof mountedChartRuntime?.describeChartSurface === "function"
    ? resolvedTabs.map(tab => ({ tab, descriptor: mountedChartRuntime.describeChartSurface(tab.chart) })).filter(row => row.descriptor)
    : [];
  const sharedOverlay = mountMode !== "iframe"
    && chartDescriptors.length === resolvedTabs.length
    && chartDescriptors.length > 1
    && (() => {
      const first = chartDescriptors[0]?.descriptor?.pageProps ?? {};
      const sharedCanvas = firstTruthy(first.overlayCanvasId, first.overlayCanvasClass, null);
      const sharedTooltip = firstTruthy(first.tooltipId, first.tooltipClass, null);
      if (!sharedCanvas && !sharedTooltip) return false;
      return chartDescriptors.every(row => {
        const pageProps = row.descriptor?.pageProps ?? {};
        return firstTruthy(pageProps.overlayCanvasId, pageProps.overlayCanvasClass, null) === sharedCanvas
          && firstTruthy(pageProps.tooltipId, pageProps.tooltipClass, null) === sharedTooltip;
      });
    })();
  return `
    ${toolbarMarkup(root, surface)}
    <div id="${escapeHtml(firstTruthy(props.domId, "surface-viewer-tabs"))}">
      <div id="${escapeHtml(firstTruthy(props.shellBodyDomId, "shell-body"))}">
        <div id="${escapeHtml(sidebarDomId)}">
          <div id="${escapeHtml(firstTruthy(surfaceProps(sidebar).scrollDomId, `${sidebarDomId}-scroll`))}">
            ${sidebar ? renderSidebarSections(sidebar) : ""}
          </div>
        </div>
        <div id="${escapeHtml(firstTruthy(props.mainRegionDomId, "shell-main"))}">
          <div id="${escapeHtml(firstTruthy(props.tabsDomId, "shell-tabs"))}" data-shell-tab-group="${escapeHtml(tabGroup)}">
            ${resolvedTabs.map((tab, index) => `<button class="${escapeHtml(tabClass)}${index === 0 ? " active" : ""}" type="button" data-shell-tab="${escapeHtml(tabGroup)}" data-view="${escapeHtml(tab.key)}">${escapeHtml(tab.label)}</button>`).join("")}
          </div>
          ${mainBeforeFrameHtml ? rawHtml(mainBeforeFrameHtml) : ""}
          <div id="${escapeHtml(firstTruthy(props.frameWrapDomId, "shell-frame-wrap"))}" data-shell-frame-wrap="${escapeHtml(tabGroup)}">
            ${resolvedTabs.map((tab, index) => renderChartHostMarkup({
              chartSurface: tab.chart,
              mountedChartRuntime,
              mountMode,
              visible: index === 0,
              viewKey: tab.key,
              fallbackId: firstTruthy(props[`chartTab${index + 1}FrameDomId`], frameIdPrefix ? `${frameIdPrefix}${tab.key}` : ""),
              includeOverlayCanvas: !sharedOverlay,
              includeTooltip: !sharedOverlay
            })).join("")}
            ${sharedOverlay && typeof mountedChartRuntime?.renderChartOverlays === "function"
              ? mountedChartRuntime.renderChartOverlays(resolvedTabs[0].chart)
              : ""}
          </div>
          ${mainAfterFrameHtml ? rawHtml(mainAfterFrameHtml) : ""}
        </div>
      </div>
    </div>
  `;
}

function genericViewerShellMarkup(root, surface, surfaces, mountedChartRuntime = null) {
  const props = surfaceProps(surface);
  const sidebar = primarySidebarSurface(surface, surfaces);
  const charts = chartChildSurfaces(surface, surfaces);
  return `
    ${toolbarMarkup(root, surface)}
    <main class="surface-viewer-generic">
      <aside class="surface-viewer-generic__sidebar">
        <h2>${escapeHtml(firstTruthy(props.title, surface.id))}</h2>
        <p>${escapeHtml(firstTruthy(props.subtitle, ""))}</p>
        ${sidebar ? renderSidebarSections(sidebar, { titleClass: "surface-viewer-generic__section-title", sectionClass: "surface-viewer-generic__section", listClass: "surface-viewer-generic__list" }) : ""}
      </aside>
      <section class="surface-viewer-generic__main">
        <div class="surface-viewer-generic__header">
          <h1>${escapeHtml(firstTruthy(props.title, surface.id))}</h1>
          <p>${escapeHtml(firstTruthy(props.subtitle, ""))}</p>
        </div>
        <div class="surface-viewer-generic__charts">
          ${charts.map(chart => renderChartHostMarkup({
            chartSurface: chart,
            mountedChartRuntime,
            mountMode: firstTruthy(props.mountMode, "mounted-panel"),
            visible: true
          })).join("")}
        </div>
      </section>
    </main>
  `;
}

function viewerShellMarkup(root, surface, surfaces, mountedChartRuntime = null) {
  const props = surfaceProps(surface);
  const shellTemplate = firstTruthy(props.shellTemplate, "generic");
  if (shellTemplate === "sidebar-grid") return sidebarGridShellMarkup(root, surface, surfaces);
  if (shellTemplate === "viewer-sidebar-main") return sidebarMainShellMarkup(root, surface, surfaces, mountedChartRuntime);
  if (shellTemplate === "viewer-sidebar-main-metrics") return sidebarMainMetricsShellMarkup(root, surface, surfaces, mountedChartRuntime);
  if (shellTemplate === "viewer-sidebar-tabs") return tabbedViewerShellMarkup(root, surface, surfaces, mountedChartRuntime);
  return genericViewerShellMarkup(root, surface, surfaces, mountedChartRuntime);
}

function renderSurfaceShellRuntime() {
  return String.raw`
    (() => {
      document.querySelectorAll('[data-shell-nav-href]').forEach(node => {
        node.addEventListener('click', event => {
          if (event.defaultPrevented) return;
          const href = node.getAttribute('data-shell-nav-href');
          if (!href) return;
          event.preventDefault();
          window.location.assign(href);
        });
      });

      document.querySelectorAll('[data-auth-password-toggle]').forEach(button => {
        button.addEventListener('click', () => {
          const inputId = button.getAttribute('data-auth-password-toggle');
          const input = inputId ? document.getElementById(inputId) : null;
          if (!input) return;
          input.type = input.type === 'password' ? 'text' : 'password';
          button.textContent = input.type === 'password' ? '◉' : '◎';
        });
      });

      const profileToggle = document.querySelector('[data-shell-profile-toggle]');
      const profileMenu = document.getElementById('up-menu');
      if (profileToggle && profileMenu) {
        profileToggle.addEventListener('click', event => {
          event.stopPropagation();
          profileMenu.classList.toggle('open');
        });
        document.addEventListener('click', event => {
          if (!profileToggle.contains(event.target)) profileMenu.classList.remove('open');
        });
      }

      const tabGroups = [...document.querySelectorAll('[data-shell-tab-group]')]
        .map(node => node.getAttribute('data-shell-tab-group'))
        .filter(Boolean);
      for (const group of new Set(tabGroups)) {
        const tabs = [...document.querySelectorAll('[data-shell-tab="' + CSS.escape(group) + '"][data-view]')];
        const charts = [...document.querySelectorAll('[data-shell-frame-wrap="' + CSS.escape(group) + '"] [data-chart-view]')];
        if (!tabs.length || !charts.length) continue;
        const setActive = view => {
          for (const tab of tabs) tab.classList.toggle('active', tab.dataset.view === view);
          for (const chart of charts) chart.style.display = chart.dataset.chartView === view ? '' : 'none';
        };
        for (const tab of tabs) {
          tab.addEventListener('click', () => setActive(tab.dataset.view));
        }
        setActive(tabs[0].dataset.view);
      }
    })();
  `;
}

function renderShellDocument({
  root,
  activeSurface,
  surfaces,
  mountedChartRuntime = null,
  rootSurfaceId = null,
  requestPathname = "/"
}) {
  const rootProps = surfaceProps(root);
  const activeProps = surfaceProps(activeSurface);
  const title = firstTruthy(activeProps.title, rootProps.productName, root.id, "DESIRE app");
  const presentationAssets = pagePresentationAssets(root, activeSurface);
  const stylesheetHrefs = uniqueTruthy([
    firstTruthy(activeProps.stylesheetHref, rootProps.stylesheetHref, null),
    ...presentationAssets.stylesheetHrefs,
    ...(mountedChartRuntime?.stylesheetHrefs ?? [])
  ]);
  const scriptSrcs = uniqueTruthy([
    ...presentationAssets.scriptSrcs,
    ...(mountedChartRuntime?.scriptSrcs ?? [])
  ]);
  const bodyMarkup = activeSurface.surfaceKind === "auth-screen"
    ? authScreenMarkup(root, activeSurface)
    : activeSurface.surfaceKind === "app-shell"
      ? viewerShellMarkup(root, activeSurface, surfaces, mountedChartRuntime)
      : `<main class="surface-fallback"><h1>${escapeHtml(title)}</h1></main>`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)} - ${escapeHtml(firstTruthy(rootProps.brandName, "DESIRE"))}</title>
    ${stylesheetHrefs.map(href => `<link rel="stylesheet" href="${escapeHtml(href)}">`).join("\n    ")}
    ${scriptSrcs.map(src => `<script src="${escapeHtml(src)}"></script>`).join("\n    ")}
    <style>
      *, *::before, *::after { box-sizing: border-box; }
      body { margin: 0; }
      a { color: inherit; text-decoration: none; }
      .surface-chart-frame { width: 100%; height: 100%; border: 0; background: white; }
      .surface-viewer-generic {
        min-height: 100vh;
        display: grid;
        grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
      }
      .surface-viewer-generic__sidebar { padding: 24px; }
      .surface-viewer-generic__main { padding: 24px; display: grid; gap: 16px; }
      .surface-viewer-generic__charts { display: grid; gap: 12px; min-height: 60vh; }
      .surface-viewer-generic__charts .surface-chart-frame { min-height: 420px; }
      ${mountedChartRuntime?.inlineCss ?? ""}
    </style>
  </head>
  <body>
    ${bodyMarkup}
    ${mountedChartRuntime?.scriptBody ? `<script type="module">${mountedChartRuntime.scriptBody}</script>` : ""}
    <script>${renderSurfaceShellRuntime()}</script>
  </body>
</html>`;
}

export function renderSurfaceShellFromMap({
  surfaces,
  rootSurfaceId,
  requestPathname,
  route,
  world = null,
  buildMountedChartRuntime = null
}) {
  const root = surfaces.get(rootSurfaceId);
  if (!root || root.surfaceKind !== "app-root") return null;
  const activeSurface = selectShellSurface({
    root,
    surfaces,
    pathname: requestPathname,
    route,
    defaultScreen: firstTruthy(route?.params?.defaultScreen, "login")
  });
  if (!activeSurface) return null;
  const mountedChartRuntime = typeof buildMountedChartRuntime === "function"
    ? buildMountedChartRuntime({ world, root, activeSurface, surfaces, route, requestPathname })
    : null;
  return renderShellDocument({
    root,
    activeSurface,
    surfaces,
    mountedChartRuntime,
    rootSurfaceId,
    requestPathname
  });
}

export function renderSurfaceShellPage(world, {
  rootSurfaceId,
  requestPathname,
  route,
  buildMountedChartRuntime = null
}) {
  return renderSurfaceShellFromMap({
    surfaces: readSurfaceMapFromWorld(world),
    rootSurfaceId,
    requestPathname,
    route,
    world,
    buildMountedChartRuntime
  });
}
