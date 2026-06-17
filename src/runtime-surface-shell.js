import { surfaceDomId } from "./runtime-surface-dom-identity.js";

const surfaceMapCache = new WeakMap();
const initialStateCache = new WeakMap();

function currentWitnessCount(world) {
  if (typeof world?.witnessCount === "function") return Number(world.witnessCount() || 0);
  return typeof world?.allWitnesses === "function" ? Number(world.allWitnesses().length || 0) : 0;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

export function normalizePathname(pathname) {
  const raw = String(pathname || "/").trim() || "/";
  if (raw === "/") return "/";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, "") : withSlash;
}

export function readSurfaceMapFromWorld(world) {
  const witnessCount = currentWitnessCount(world);
  const cached = world ? surfaceMapCache.get(world) : null;
  if (cached && cached.witnessCount === witnessCount) return cached.value;
  const surfaces = new Map();
  for (const witness of world.allWitnesses()) {
    if (witness.process !== "desire.defineSurface" || !witness.body?.id) continue;
    surfaces.set(witness.body.id, witness.body);
  }
  if (world) surfaceMapCache.set(world, { witnessCount, value: surfaces });
  return surfaces;
}

export function readInitialStateFromWorld(world) {
  const witnessCount = currentWitnessCount(world);
  const cached = world ? initialStateCache.get(world) : null;
  if (cached && cached.witnessCount === witnessCount) return cached.value;
  const state = new Map();
  for (const witness of world?.allWitnesses?.() ?? []) {
    const body = witness?.body;
    if (witness?.process !== "desire.defineType" || body?.role !== "state" || !body?.id) continue;
    state.set(body.id, body.initial);
  }
  if (world) initialStateCache.set(world, { witnessCount, value: state });
  return state;
}

function readProps(surface) {
  return surface?.props && typeof surface.props === "object" ? surface.props : {};
}

function isTemplateSurface(surface) {
  return readProps(surface).template === true;
}

const GENERIC_ATTRIBUTE_PROPS = [
  ["htmlRole", "role"],
  ["ariaLabel", "aria-label"],
  ["ariaLabelledBy", "aria-labelledby"],
  ["ariaDescribedBy", "aria-describedby"],
  ["ariaControls", "aria-controls"],
  ["ariaCurrent", "aria-current"],
  ["ariaExpanded", "aria-expanded"],
  ["ariaSelected", "aria-selected"],
  ["ariaChecked", "aria-checked"],
  ["ariaDisabled", "aria-disabled"],
  ["ariaPressed", "aria-pressed"],
  ["ariaHidden", "aria-hidden"],
  ["tabIndex", "tabindex"]
];

const INITIAL_PROJECTED_BINDINGS = new Set([
  "checked",
  "disabled",
  "style",
  "text",
  "title",
  "value",
  ...GENERIC_ATTRIBUTE_PROPS.map(([prop]) => prop)
]);

function childSurfaceIds(surface) {
  return Array.isArray(surface?.children)
    ? surface.children
        .map(child => typeof child === "string" ? child.trim() : "")
        .filter(Boolean)
    : [];
}

function forceVisibleSurfaceIdsSet(options = {}) {
  if (options.forceVisibleSurfaceIds instanceof Set) return options.forceVisibleSurfaceIds;
  const values = Array.isArray(options.forceVisibleSurfaceIds) ? options.forceVisibleSurfaceIds : [];
  return new Set(values.map(value => String(value ?? "").trim()).filter(Boolean));
}

function collectSurfaceTree(surfaces, rootSurfaceId) {
  const visited = new Set();
  const ordered = [];
  const queue = [rootSurfaceId];
  while (queue.length) {
    const surfaceId = queue.shift();
    if (!surfaceId || visited.has(surfaceId)) continue;
    visited.add(surfaceId);
    const surface = surfaces.get(surfaceId);
    if (!surface) continue;
    ordered.push(surface);
    for (const childId of childSurfaceIds(surface)) queue.push(childId);
  }
  return ordered;
}

function matchSurfaceByDefaultScreen({
  surfaces,
  rootSurfaceId,
  defaultScreen = null
}) {
  if (!defaultScreen) return null;
  const target = String(defaultScreen || "").trim();
  if (!target) return null;
  for (const surface of collectSurfaceTree(surfaces, rootSurfaceId)) {
    const props = readProps(surface);
    if (props.routeKey === target) return surface;
    if (surface.id === target) return surface;
  }
  return null;
}

function staticTextValue(props, key) {
  const value = props?.[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function matchSurfaceByRoutePath({
  surfaces,
  rootSurfaceId,
  requestPathname = "/"
}) {
  const targetPath = normalizePathname(requestPathname);
  if (!targetPath) return null;
  let best = null;
  let bestDepth = -1;
  const queue = [{ surfaceId: rootSurfaceId, depth: 0 }];
  const visited = new Set();
  while (queue.length) {
    const current = queue.shift();
    const surfaceId = current?.surfaceId;
    if (!surfaceId || visited.has(surfaceId)) continue;
    visited.add(surfaceId);
    const surface = surfaces.get(surfaceId);
    if (!surface) continue;
    const routePath = staticTextValue(readProps(surface), "routePath");
    if (routePath && normalizePathname(routePath) === targetPath && current.depth > bestDepth) {
      best = surface;
      bestDepth = current.depth;
    }
    for (const childId of childSurfaceIds(surface)) {
      queue.push({ surfaceId: childId, depth: current.depth + 1 });
    }
  }
  return best;
}

function routeDefaultScreen(route) {
  const paramsDefault = route?.params?.defaultScreen;
  if (typeof paramsDefault === "string" && paramsDefault.trim()) return paramsDefault.trim();
  const routeDefault = route?.defaultScreen;
  if (typeof routeDefault === "string" && routeDefault.trim()) return routeDefault.trim();
  return null;
}

function selectActiveSurface({
  surfaces,
  rootSurfaceId,
  requestPathname = "/",
  route = null
}) {
  const rootSurface = surfaces.get(rootSurfaceId) ?? null;
  if (!rootSurface) return null;
  return matchSurfaceByRoutePath({
    surfaces,
    rootSurfaceId,
    requestPathname
  }) ?? matchSurfaceByDefaultScreen({
    surfaces,
    rootSurfaceId,
    defaultScreen: routeDefaultScreen(route)
  }) ?? rootSurface;
}

function readStaticPayload(surface) {
  const props = readProps(surface);
  return {
    documentTitle: staticTextValue(props, "documentTitle"),
    title: staticTextValue(props, "title"),
    subtitle: staticTextValue(props, "subtitle"),
    body: staticTextValue(props, "body"),
    text: staticTextValue(props, "text")
  };
}

function staticPayloadScore(surface) {
  const payload = readStaticPayload(surface);
  let score = 0;
  if (payload.documentTitle) score += 8;
  if (payload.title) score += 4;
  if (payload.subtitle) score += 3;
  if (payload.body) score += 2;
  if (payload.text) score += 1;
  return score;
}

function describeSurface(surface) {
  if (!surface) return null;
  const props = readProps(surface);
  return {
    id: surface.id ?? null,
    surfaceKind: surface.surfaceKind ?? null,
    routeKey: props.routeKey ?? null,
    routePath: props.routePath ?? null
  };
}

function hasRenderableContent(surface) {
  if (!surface) return false;
  const props = readProps(surface);
  if (childSurfaceIds(surface).length) return true;
  return Object.entries(props).some(([key, value]) => {
    if (value == null) return false;
    if (["routeKey", "routePath", "messageRef", "actionKey", "modeKey", "tabKey", "assetRef", "mountMode"].includes(key)) {
      return false;
    }
    if (typeof value === "string") return value.trim().length > 0;
    return typeof value !== "object";
  });
}

function readClassNames(surface) {
  const tokens = [];
  const push = value => {
    if (typeof value !== "string") return;
    for (const token of value.split(/\s+/)) {
      const trimmed = token.trim();
      if (trimmed) tokens.push(trimmed);
    }
  };
  push(surface?.className);
  const props = readProps(surface);
  push(props.class);
  push(props.className);
  return [...new Set(tokens)];
}

function readProjectedProps(surface, options = {}) {
  const props = { ...readProps(surface) };
  for (const binding of surface?.bindings ?? []) {
    const prop = binding?.prop;
    if (!INITIAL_PROJECTED_BINDINGS.has(prop)) continue;
    const value = evaluateStateBinding(binding, options.initialState);
    if (value !== undefined) props[prop] = value;
  }
  return props;
}

function readProjectedClassNames(surface, options = {}) {
  const classNames = readClassNames(surface);
  const classBinding = Array.isArray(surface?.bindings)
    ? surface.bindings.find(binding => binding?.prop === "className")
    : null;
  if (!classBinding) return classNames;
  const resolved = evaluateStateBinding(classBinding, options.initialState);
  if (typeof resolved !== "string" || !resolved.trim()) return classNames;
  const tokens = [
    ...classNames,
    ...resolved.split(/\s+/).map(token => token.trim()).filter(Boolean)
  ];
  return [...new Set(tokens)];
}

function coerceBooleanAttr(value) {
  if (value === true || value === 1) return true;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }
  return false;
}

function appendGenericAttributes(attrs, props) {
  for (const [propName, attrName] of GENERIC_ATTRIBUTE_PROPS) {
    const value = props[propName];
    if (value == null || value === "") continue;
    attrs.push(`${attrName}="${escapeAttr(value)}"`);
  }
}

function isVoidTag(tagName) {
  return ["img", "input", "br", "hr", "meta", "link"].includes(tagName);
}

function normalizeTagName(value, fallback = "div") {
  const tag = String(value || "").trim().toLowerCase();
  if (!tag) return fallback;
  if (!/^[a-z][a-z0-9-]*$/.test(tag)) return fallback;
  return tag;
}

function elementTagForSurface(surface) {
  const props = readProps(surface);
  if (typeof props.tag === "string" && props.tag.trim()) {
    return normalizeTagName(props.tag, "div");
  }
  if (typeof props.href === "string" && props.href.trim()) return "a";
  if (typeof props.inputType === "string" || typeof props.inputId === "string") return "div";
  return "div";
}

function renderAttributes(surface, tagName, options = {}) {
  const props = readProjectedProps(surface, options);
  const attrs = [];
  const domId = surfaceDomId(surface, { requireRuntimeAttachment: true });
  if (domId) attrs.push(`id="${escapeAttr(domId)}"`);
  const classNames = readProjectedClassNames(surface, options);
  if (classNames.length) attrs.push(`class="${escapeAttr(classNames.join(" "))}"`);
  const inlineStyle = staticTextValue(props, "style");
  if (inlineStyle) attrs.push(`style="${escapeAttr(inlineStyle)}"`);
  if (props.hidden === true) attrs.push("hidden");
  const title = staticTextValue(props, "title");
  if (title) attrs.push(`title="${escapeAttr(title)}"`);
  appendGenericAttributes(attrs, props);
  if (tagName === "a") {
    const href = staticTextValue(props, "href") ?? "#";
    attrs.push(`href="${escapeAttr(href)}"`);
  }
  if (tagName === "label") {
    const htmlFor = staticTextValue(props, "for") ?? staticTextValue(props, "htmlFor");
    if (htmlFor) attrs.push(`for="${escapeAttr(htmlFor)}"`);
  }
  if (tagName === "button") {
    const buttonType = staticTextValue(props, "buttonType");
    if (buttonType) attrs.push(`type="${escapeAttr(buttonType)}"`);
    if (coerceBooleanAttr(props.disabled)) attrs.push("disabled");
  }
  if (tagName === "option") {
    const value = props.value;
    if (value != null) attrs.push(`value="${escapeAttr(value)}"`);
    const optionLabel = staticTextValue(props, "label");
    if (optionLabel) attrs.push(`label="${escapeAttr(optionLabel)}"`);
    const parentSelectValue = options.parentSelectValue;
    const selectedByParent = Array.isArray(parentSelectValue)
      ? value != null && parentSelectValue.map(entry => String(entry)).includes(String(value))
      : parentSelectValue != null
        && value != null
        && String(parentSelectValue) === String(value);
    if (coerceBooleanAttr(props.selected) || selectedByParent) attrs.push("selected");
    if (coerceBooleanAttr(props.disabled)) attrs.push("disabled");
  }
  if (tagName === "select") {
    const name = staticTextValue(props, "name");
    if (name) attrs.push(`name="${escapeAttr(name)}"`);
    if (surface?.surfaceKind === "multi-select" || coerceBooleanAttr(props.multiple)) attrs.push("multiple");
    if (coerceBooleanAttr(props.disabled)) attrs.push("disabled");
  }
  if (tagName === "textarea") {
    for (const [propName, attrName] of [
      ["placeholder", "placeholder"],
      ["name", "name"]
    ]) {
      const value = props[propName];
      if (value != null && value !== "") attrs.push(`${attrName}="${escapeAttr(value)}"`);
    }
    if (coerceBooleanAttr(props.disabled)) attrs.push("disabled");
  }
  if (tagName === "input") {
    const inputType = staticTextValue(props, "inputType") ?? staticTextValue(props, "type") ?? "text";
    attrs.push(`type="${escapeAttr(inputType)}"`);
    for (const [propName, attrName] of [
      ["placeholder", "placeholder"],
      ["autocomplete", "autocomplete"],
      ["name", "name"],
      ["min", "min"],
      ["max", "max"],
      ["step", "step"],
      ["value", "value"]
    ]) {
      const value = props[propName];
      if (value != null && value !== "") attrs.push(`${attrName}="${escapeAttr(value)}"`);
    }
    if (coerceBooleanAttr(props.checked)) attrs.push("checked");
    if (coerceBooleanAttr(props.disabled)) attrs.push("disabled");
  }
  if (tagName === "img") {
    const src = staticTextValue(props, "src")
      ?? staticTextValue(props, "assetSrc")
      ?? staticTextValue(props, "brandLogoSrc")
      ?? staticTextValue(props, "productLogoSrc");
    if (src) attrs.push(`src="${escapeAttr(src)}"`);
    const alt = staticTextValue(props, "alt")
      ?? staticTextValue(props, "title")
      ?? staticTextValue(props, "label")
      ?? "";
    attrs.push(`alt="${escapeAttr(alt)}"`);
  }
  return attrs.length ? ` ${attrs.join(" ")}` : "";
}

function wrapText(tagName, className, text) {
  const content = staticTextValue({ value: text }, "value");
  if (!content) return "";
  const classAttr = className ? ` class="${escapeAttr(className)}"` : "";
  return `<${tagName}${classAttr}>${escapeHtml(content)}</${tagName}>`;
}

function renderImage(src, className, alt = "") {
  const asset = staticTextValue({ asset: src }, "asset");
  if (!asset) return "";
  const classAttr = className ? ` class="${escapeAttr(className)}"` : "";
  return `<img${classAttr} src="${escapeAttr(asset)}" alt="${escapeAttr(alt)}">`;
}

function renderFieldControl(surface, surfaces, options = {}) {
  const props = readProjectedProps(surface, options);
  const inputType = staticTextValue(props, "inputType") ?? "text";
  const inputId = staticTextValue(props, "inputId");
  const label = staticTextValue(props, "label");
  const inputClass = staticTextValue(props, "inputClass");
  const inputStyle = staticTextValue(props, "inputStyle");
  const inputWrapClass = staticTextValue(props, "inputWrapClass");
  const autocomplete = staticTextValue(props, "autocomplete");
  const name = staticTextValue(props, "name");
  const placeholder = staticTextValue(props, "placeholder");
  const value = props.value;
  const min = props.min;
  const max = props.max;
  const step = props.step;
  const checked = coerceBooleanAttr(props.checked);
  const disabled = coerceBooleanAttr(props.disabled);
  const controlAttrs = [
    `type="${escapeAttr(inputType)}"`,
    inputId ? `id="${escapeAttr(inputId)}"` : "",
    inputClass ? `class="${escapeAttr(inputClass)}"` : "",
    placeholder ? `placeholder="${escapeAttr(placeholder)}"` : "",
    autocomplete ? `autocomplete="${escapeAttr(autocomplete)}"` : "",
    name ? `name="${escapeAttr(name)}"` : "",
    value != null && inputType !== "checkbox" ? `value="${escapeAttr(value)}"` : "",
    min != null ? `min="${escapeAttr(min)}"` : "",
    max != null ? `max="${escapeAttr(max)}"` : "",
    step != null ? `step="${escapeAttr(step)}"` : "",
    inputStyle ? `style="${escapeAttr(inputStyle)}"` : "",
    checked && inputType === "checkbox" ? "checked" : "",
    disabled ? "disabled" : ""
  ].filter(Boolean).join(" ");
  const inputMarkup = `<input ${controlAttrs}>`;
  const adornmentMarkup = childSurfaceIds(surface)
    .map(childId => renderSurfaceNode(surfaces, childId, options))
    .filter(Boolean)
    .join("");
  const wrappedInput = inputWrapClass
    ? `<div class="${escapeAttr(inputWrapClass)}">${inputMarkup}${adornmentMarkup}</div>`
    : inputMarkup;
  if (inputType === "checkbox") {
    return [
      "<label>",
      inputMarkup,
      label ? `<span>${escapeHtml(label)}</span>` : "",
      "</label>"
    ].join("");
  }
  return [
    label ? `<label${inputId ? ` for="${escapeAttr(inputId)}"` : ""}>${escapeHtml(label)}</label>` : "",
    wrappedInput,
    inputWrapClass ? "" : adornmentMarkup
  ].join("");
}

function renderSurfaceBody(surface, surfaces, tagName = "div", options = {}) {
  const props = readProjectedProps(surface, options);
  const rawHtml = staticTextValue(props, "rawHtml");
  const childOptions = tagName === "select"
    ? { ...options, parentSelectValue: props.value }
    : options;
  const childHtml = childSurfaceIds(surface)
    .map(childId => renderSurfaceNode(surfaces, childId, childOptions))
    .filter(Boolean)
    .join("");
  if (rawHtml && !childHtml) return rawHtml;
  if (tagName === "textarea" && !childHtml) {
    const value = props.value ?? staticTextValue(props, "text") ?? "";
    return escapeHtml(value);
  }
  if (typeof props.inputType === "string" || typeof props.inputId === "string") {
    return renderFieldControl(surface, surfaces, options);
  }

  const fragments = [];
  const label = staticTextValue(props, "label");
  const title = staticTextValue(props, "title");
  const subtitle = staticTextValue(props, "subtitle");
  const body = staticTextValue(props, "body");
  const text = staticTextValue(props, "text");
  const description = staticTextValue(props, "description");
  const category = staticTextValue(props, "category");
  const time = staticTextValue(props, "time");
  const status = staticTextValue(props, "status");
  const statusLabel = staticTextValue(props, "statusLabel");
  const name = staticTextValue(props, "name");
  const role = staticTextValue(props, "role");
  const initials = staticTextValue(props, "initials");
  const accent = staticTextValue(props, "accent");
  const href = staticTextValue(props, "href");
  const backHref = staticTextValue(props, "backHref");
  const brandName = staticTextValue(props, "brandName");
  const productName = staticTextValue(props, "productName");
  const brandLogoSrc = staticTextValue(props, "brandLogoSrc");
  const productLogoSrc = staticTextValue(props, "productLogoSrc");
  const assetSrc = staticTextValue(props, "assetSrc");
  const iconActionContent =
    childHtml
    && (text || label)
    && !subtitle
    && !body
    && !description
    && !category
    && !time
    && !status
    && !statusLabel
    && !name
    && !role
    && !initials
    && !accent
    && !backHref
    && !brandName
    && !productName
    && !brandLogoSrc
    && !productLogoSrc
    && !assetSrc
    && (tagName === "button" || tagName === "a");
  if (iconActionContent) return `${childHtml}${escapeHtml(text ?? label)}`;
  const childTitleOnlyAction =
    childHtml
    && title
    && !label
    && !text
    && !subtitle
    && !body
    && !description
    && !category
    && !time
    && !status
    && !statusLabel
    && !name
    && !role
    && !initials
    && !accent
    && !href
    && !backHref
    && !brandName
    && !productName
    && !brandLogoSrc
    && !productLogoSrc
    && !assetSrc
    && (tagName === "button" || tagName === "a");
  if (childTitleOnlyAction) return childHtml;
  const childTextSurface =
    childHtml
    && (text || label)
    && !title
    && !subtitle
    && !body
    && !description
    && !category
    && !time
    && !status
    && !statusLabel
    && !name
    && !role
    && !initials
    && !accent
    && !href
    && !backHref
    && !brandName
    && !productName
    && !brandLogoSrc
    && !productLogoSrc
    && !assetSrc;
  if (childTextSurface) return `${childHtml}${escapeHtml(text ?? label)}`;
  const directActionLabel =
    !childHtml
    && label
    && !subtitle
    && !body
    && !text
    && !description
    && !category
    && !time
    && !status
    && !statusLabel
    && !name
    && !role
    && !initials
    && !accent
    && !backHref
    && !brandName
    && !productName
    && !brandLogoSrc
    && !productLogoSrc
    && !assetSrc
    && (tagName === "button" || tagName === "a");
  if (directActionLabel) return escapeHtml(label);
  const optionLabelSurface =
    !childHtml
    && label
    && !text
    && !title
    && tagName === "option";
  if (optionLabelSurface) return escapeHtml(label);
  const textOnlySurface =
    !childHtml
    && text
    && !label
    && !title
    && !subtitle
    && !body
    && !description
    && !category
    && !time
    && !status
    && !statusLabel
    && !name
    && !role
    && !initials
    && !accent
    && !href
    && !backHref
    && !brandName
    && !productName
    && !brandLogoSrc
    && !productLogoSrc
    && !assetSrc;
  if (textOnlySurface) return escapeHtml(text);

  if (backHref) {
    fragments.push(`<a class="surface-back-link" href="${escapeAttr(backHref)}">Back</a>`);
  }
  if (brandLogoSrc || productLogoSrc || brandName || productName) {
    fragments.push([
      '<div class="surface-brand-row">',
      brandLogoSrc ? renderImage(brandLogoSrc, "brand-img", brandName || "brand") : "",
      brandName ? `<span class="surface-brand-name">${escapeHtml(brandName)}</span>` : "",
      brandLogoSrc && productLogoSrc ? '<span class="surface-brand-divider"></span>' : "",
      productLogoSrc ? renderImage(productLogoSrc, "product-img", productName || "product") : "",
      productName ? `<span class="surface-product-name">${escapeHtml(productName)}</span>` : "",
      "</div>"
    ].join(""));
  }
  if (assetSrc) {
    fragments.push([
      '<div class="surface-asset-wrap">',
      renderImage(assetSrc, "surface-asset", title || label || "asset"),
      "</div>"
    ].join(""));
  }
  if (initials || name || role) {
    fragments.push([
      '<div class="surface-identity-summary">',
      initials ? `<div class="surface-identity-initials">${escapeHtml(initials)}</div>` : "",
      '<div class="surface-identity-copy">',
      name ? `<div class="surface-identity-name">${escapeHtml(name)}</div>` : "",
      role ? `<div class="surface-identity-role">${escapeHtml(role)}</div>` : "",
      "</div>",
      "</div>"
    ].join(""));
  }
  if (label && !title) fragments.push(wrapText("div", "", label));
  if (title) {
    const resolvedTitle = accent ? title.replace(accent, "") : title;
    if (accent && title.includes(accent)) {
      fragments.push(`<h1>${escapeHtml(resolvedTitle.trim())} <em>${escapeHtml(accent)}</em></h1>`);
    } else {
      fragments.push(wrapText("h1", "", title));
    }
  }
  if (subtitle) fragments.push(wrapText("p", "", subtitle));
  if (body) fragments.push(wrapText("p", "", body));
  if (description) fragments.push(wrapText("p", "", description));
  if (text) fragments.push(wrapText("div", "", text));
  if (category || time) {
    fragments.push([
      '<div class="surface-meta-row">',
      category ? `<span class="surface-meta-category">${escapeHtml(category)}</span>` : "",
      time ? `<span class="surface-meta-time">${escapeHtml(time)}</span>` : "",
      "</div>"
    ].join(""));
  }
  if (status || statusLabel) {
    fragments.push(`<div class="surface-status-label">${escapeHtml(statusLabel ?? status)}</div>`);
  }
  if (href && elementTagForSurface(surface) !== "a" && label) {
    fragments.push(`<a class="surface-inline-link" href="${escapeAttr(href)}">${escapeHtml(label)}</a>`);
  }
  fragments.push(childHtml);
  return fragments.join("");
}

function stateValue(initialState, stateId) {
  if (!stateId) return undefined;
  if (initialState instanceof Map) return initialState.get(stateId);
  if (initialState && typeof initialState === "object") return initialState[stateId];
  return undefined;
}

function evaluateStateBinding(binding, initialState) {
  const source = binding?.source;
  const stateId = source?.state;
  if (!stateId) return undefined;
  const value = stateValue(initialState, stateId);
  const map = source?.map && typeof source.map === "object" ? source.map : null;
  if (map && Object.prototype.hasOwnProperty.call(map, String(value))) return map[String(value)];
  if (map && Object.prototype.hasOwnProperty.call(map, "default")) return map.default;
  if (Object.prototype.hasOwnProperty.call(source ?? {}, "default")) return source.default;
  return value;
}

function coerceVisibleFlag(value) {
  if (value === false || value === 0 || value == null) return false;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized || normalized === "false" || normalized === "0" || normalized === "no") return false;
  }
  return true;
}

function surfaceVisibleInInitialProjection(surface, options = {}) {
  const visibleBinding = Array.isArray(surface?.bindings)
    ? surface.bindings.find(binding => binding?.prop === "visible")
    : null;
  if (!visibleBinding) return true;
  return coerceVisibleFlag(evaluateStateBinding(visibleBinding, options.initialState));
}

function renderSurfaceNode(surfaces, surfaceId, options = {}) {
  const surface = surfaces.get(surfaceId);
  if (!surface) return "";
  if (isTemplateSurface(surface) && options.templateContent !== true) return "";
  if (!surfaceVisibleInInitialProjection(surface, options) && !forceVisibleSurfaceIdsSet(options).has(surfaceId)) return "";
  for (const renderer of options.surfaceRenderers ?? []) {
    if (!renderer || typeof renderer.renderSurface !== "function") continue;
    const rendered = renderer.renderSurface(surface, {
      surfaces,
      renderSurface: childId => renderSurfaceNode(surfaces, childId, options)
    });
    if (typeof rendered === "string") return rendered;
  }
  const tagName = elementTagForSurface(surface);
  const attrs = renderAttributes(surface, tagName, options);
  if (isVoidTag(tagName)) return `<${tagName}${attrs}>`;
  const body = renderSurfaceBody(surface, surfaces, tagName, options);
  const props = readProps(surface);
  const rawHtml = staticTextValue(props, "rawHtml");
  if (
    tagName === "div"
    && !attrs
    && rawHtml
    && !childSurfaceIds(surface).length
    && body === rawHtml
  ) {
    return rawHtml;
  }
  return `<${tagName}${attrs}>${body}</${tagName}>`;
}

export function renderSurfaceStaticFragment(surfaces, surfaceId, options = {}) {
  if (!(surfaces instanceof Map) || !surfaceId) return "";
  return renderSurfaceNode(surfaces, surfaceId, options);
}

function renderSurfaceTemplate(surface, surfaces, options = {}) {
  if (!surface?.id || !isTemplateSurface(surface)) return "";
  const content = renderSurfaceNode(surfaces, surface.id, { ...options, templateContent: true });
  if (!content) return "";
  const tag = normalizeTagName(readProps(surface).tag, "div");
  if (tag === "option") {
    return `<template data-surface-template="${escapeAttr(surface.id)}"><select data-template-wrapper="option">${content}</select></template>`;
  }
  return `<template data-surface-template="${escapeAttr(surface.id)}">${content}</template>`;
}

function renderSurfaceTemplates(surfaces, rootSurfaceId, options = {}) {
  if (!(surfaces instanceof Map) || !rootSurfaceId) return "";
  const referencedTemplateIds = new Set();
  const queue = [rootSurfaceId];
  const seen = new Set();
  while (queue.length) {
    const surfaceId = queue.shift();
    if (!surfaceId || seen.has(surfaceId)) continue;
    seen.add(surfaceId);
    const surface = surfaces.get(surfaceId);
    if (!surface) continue;
    const repeat = surface?.repeat && typeof surface.repeat === "object" ? surface.repeat : null;
    if (typeof repeat?.template === "string" && repeat.template.trim()) referencedTemplateIds.add(repeat.template.trim());
    for (const childId of childSurfaceIds(surface)) queue.push(childId);
  }
  return [...referencedTemplateIds]
    .map(templateId => renderSurfaceTemplate(surfaces.get(templateId), surfaces, options))
    .filter(Boolean)
    .join("\n");
}

function inferredDocumentTitle(activeSurface, surfaces) {
  const activePayload = readStaticPayload(activeSurface);
  if (activePayload.documentTitle) return activePayload.documentTitle;
  let best = null;
  let bestScore = -1;
  for (const surface of collectSurfaceTree(surfaces, activeSurface.id)) {
    const score = staticPayloadScore(surface);
    if (score > bestScore) {
      best = surface;
      bestScore = score;
    }
  }
  const resolved = readStaticPayload(best ?? activeSurface);
  return resolved.documentTitle ?? resolved.title ?? activeSurface.id ?? "page.surface";
}

function renderSurfaceDocument({
  requestPathname,
  rootSurface,
  activeSurface,
  surfaces,
  surfaceRenderers = [],
  initialState = new Map()
}) {
  const rootProps = readProps(rootSurface);
  const stylesheetHref = staticTextValue(rootProps, "stylesheetHref");
  const rootInfo = describeSurface(rootSurface);
  const activeInfo = describeSurface(activeSurface);
  const bodyClass = readClassNames(rootSurface).join(" ");
  const bodyClassAttr = bodyClass ? ` class="${escapeAttr(bodyClass)}"` : "";
  const html = renderSurfaceNode(surfaces, activeSurface.id, { surfaceRenderers, initialState });
  const templates = renderSurfaceTemplates(surfaces, activeSurface.id, { surfaceRenderers, initialState });
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(inferredDocumentTitle(activeSurface, surfaces))}</title>
    ${stylesheetHref ? `<link rel="stylesheet" href="${escapeAttr(stylesheetHref)}">` : ""}
  </head>
  <body${bodyClassAttr}>
    <!-- witness-surface status=composed_static_surface requestPathname=${escapeAttr(requestPathname)} rootSurface=${escapeAttr(rootInfo?.id ?? "")} activeSurface=${escapeAttr(activeInfo?.id ?? "")} -->
    ${html}
    ${templates}
  </body>
</html>`;
}

function renderBlockedHostHtml({
  requestPathname,
  rootSurface,
  activeSurface
}) {
  const rootInfo = describeSurface(rootSurface);
  const activeInfo = describeSurface(activeSurface);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>page.surface reset host</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        background: #f5f1e8;
        color: #1d1a16;
        font-family: Georgia, "Times New Roman", serif;
      }
      main {
        width: min(760px, calc(100vw - 32px));
        margin: 48px auto;
        padding: 28px;
        background: #fffaf2;
        border: 1px solid #d8c7ad;
        border-radius: 18px;
      }
      dt { font-weight: 700; }
      dd { margin: 0 0 12px; }
      code { font-family: "Cascadia Code", Consolas, monospace; }
    </style>
  </head>
  <body>
    <main>
      <h1>page.surface reset host</h1>
      <p>The previous <code>page.surface</code> renderer was removed because it embedded app authority into a generic host.</p>
      <p>The authored surface tree for this route is not yet renderable from the current generic projection floor.</p>
      <dl>
        <dt>status</dt>
        <dd>blocked_reset_host</dd>
        <dt>requestPathname</dt>
        <dd>${escapeHtml(requestPathname)}</dd>
        <dt>rootSurface.id</dt>
        <dd>${escapeHtml(rootInfo?.id ?? "n/a")}</dd>
        <dt>activeSurface.id</dt>
        <dd>${escapeHtml(activeInfo?.id ?? "n/a")}</dd>
      </dl>
    </main>
  </body>
</html>`;
}

export function renderSurfaceShellFromMap({
  surfaces,
  rootSurfaceId,
  requestPathname = "/",
  route = null,
  surfaceRenderers = [],
  initialState = new Map()
} = {}) {
  const state = resolveSurfaceShellFromMap({
    surfaces,
    rootSurfaceId,
    requestPathname,
    route,
    surfaceRenderers,
    initialState
  });
  return state?.html ?? null;
}

export function resolveSurfaceShellFromMap({
  surfaces,
  rootSurfaceId,
  requestPathname = "/",
  route = null,
  surfaceRenderers = [],
  initialState = new Map()
} = {}) {
  if (!(surfaces instanceof Map) || !rootSurfaceId) return null;
  const rootSurface = surfaces.get(rootSurfaceId);
  if (!rootSurface) return null;
  const activeSurface = selectActiveSurface({
    surfaces,
    rootSurfaceId,
    requestPathname,
    route
  });
  const normalizedPathname = normalizePathname(requestPathname);
  if (activeSurface && hasRenderableContent(activeSurface)) {
    const html = renderSurfaceDocument({
      requestPathname: normalizedPathname,
      rootSurface,
      activeSurface,
      surfaces,
      surfaceRenderers,
      initialState
    });
    return {
      html,
      surfaces,
      rootSurface,
      activeSurface,
      rootSurfaceId,
      requestPathname: normalizedPathname
    };
  }
  const html = renderBlockedHostHtml({
    requestPathname: normalizedPathname,
    rootSurface,
    activeSurface: activeSurface ?? rootSurface
  });
  return {
    html,
    surfaces,
    rootSurface,
    activeSurface: activeSurface ?? rootSurface,
    rootSurfaceId,
    requestPathname: normalizedPathname
  };
}

export function renderSurfaceShellPage(world, {
  rootSurfaceId,
  requestPathname = "/",
  route = null,
  surfaceRenderers = [],
  initialState = readInitialStateFromWorld(world)
} = {}) {
  return renderSurfaceShellFromMap({
    surfaces: readSurfaceMapFromWorld(world),
    rootSurfaceId,
    requestPathname,
    route,
    surfaceRenderers,
    initialState
  });
}

export function resolveSurfaceShellPage(world, {
  rootSurfaceId,
  requestPathname = "/",
  route = null,
  surfaceRenderers = [],
  initialState = readInitialStateFromWorld(world)
} = {}) {
  return resolveSurfaceShellFromMap({
    surfaces: readSurfaceMapFromWorld(world),
    rootSurfaceId,
    requestPathname,
    route,
    surfaceRenderers,
    initialState
  });
}
