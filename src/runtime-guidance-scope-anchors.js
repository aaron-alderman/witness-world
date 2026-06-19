import { guidancePageScopeKey } from "./runtime-guidance-model.js";

function normalizeGuidanceScopeFields(scope = {}) {
  return Object.fromEntries(Object.entries(scope).filter(([, value]) => value != null && value !== ""));
}

function guidancePageLabel(page) {
  return page === "app" ? "App" : (page === "bootstrap" ? "Bootstrap" : (page === "world" ? "World" : String(page || "")));
}

export function guidancePageScopeRecord(page, label = null) {
  const scopePage = typeof page === "string" ? page.trim() : "";
  return scopePage
    ? normalizeGuidanceScopeFields({
        scopeKey: guidancePageScopeKey(scopePage),
        scopeKind: "page",
        scopePage,
        scopeLabel: label || guidancePageLabel(scopePage)
      })
    : {};
}

export function guidanceWorldScopeRecord(label = null) {
  return normalizeGuidanceScopeFields({
    scopeKey: "world",
    scopeKind: "world",
    scopePage: "world",
    scopeLabel: label || "World"
  });
}

export function guidanceSectionScopeRecord(page, sectionId, label = null) {
  const scopePage = typeof page === "string" ? page.trim() : "";
  const normalizedSectionId = typeof sectionId === "string" ? sectionId.trim() : "";
  return scopePage && normalizedSectionId
    ? normalizeGuidanceScopeFields({
        scopeKey: `section:${scopePage}:${normalizedSectionId}`,
        scopeKind: "section",
        scopePage,
        scopeSectionId: normalizedSectionId,
        scopeLabel: label || normalizedSectionId
      })
    : {};
}

export function guidanceWidgetScopeRecord(page, widgetId, label = null) {
  const scopePage = typeof page === "string" ? page.trim() : "";
  const normalizedWidgetId = typeof widgetId === "string" ? widgetId.trim() : "";
  return normalizedWidgetId
    ? normalizeGuidanceScopeFields({
        scopeKey: `widget:${normalizedWidgetId}`,
        scopeKind: "widget",
        scopePage: scopePage || null,
        scopeWidgetId: normalizedWidgetId,
        scopeLabel: label || normalizedWidgetId
      })
    : {};
}

export function guidanceScopeAnchor(scope = null, target = null) {
  const scoped = scope && typeof scope === "object" ? { ...scope } : {};
  const normalizedTarget = typeof target === "string" && target.trim() ? target.trim() : "";
  return normalizedTarget ? { ...scoped, target: normalizedTarget } : scoped;
}

function plainGuidanceLabel(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.includes("${")) return "";
  return normalized;
}

function humanizeIdentifier(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) return "";
  return normalized
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function guidanceScopeLabelFromWidget(widget, childrenByParent = new Map()) {
  if (!widget || typeof widget !== "object") return "";
  const directCandidates = [
    widget.title,
    widget.label,
    widget.text,
    widget.placeholder,
    widget.role && humanizeIdentifier(widget.role),
    widget.name && humanizeIdentifier(widget.name),
    widget.id && humanizeIdentifier(widget.id)
  ];
  for (const candidate of directCandidates) {
    const label = plainGuidanceLabel(candidate);
    if (label) return label;
  }
  for (const child of childrenByParent.get(widget.id) || []) {
    const label = guidanceScopeLabelFromWidget(child, childrenByParent);
    if (label) return label;
  }
  return widget.id ? humanizeIdentifier(widget.id) : "";
}

function widgetGuidanceTarget(widget) {
  if (typeof widget?.guidanceTarget === "string" && widget.guidanceTarget.trim()) return widget.guidanceTarget.trim();
  if (typeof widget?.tutorialTarget === "string" && widget.tutorialTarget.trim()) return widget.tutorialTarget.trim();
  return "";
}

function surfaceGuidanceTarget(surface) {
  if (typeof surface?.guidanceTarget === "string" && surface.guidanceTarget.trim()) return surface.guidanceTarget.trim();
  if (typeof surface?.tutorialTarget === "string" && surface.tutorialTarget.trim()) return surface.tutorialTarget.trim();
  if (typeof surface?.props?.dataGuidanceTarget === "string" && surface.props.dataGuidanceTarget.trim()) return surface.props.dataGuidanceTarget.trim();
  if (typeof surface?.props?.dataTutorialTarget === "string" && surface.props.dataTutorialTarget.trim()) return surface.props.dataTutorialTarget.trim();
  return "";
}

function guidanceScopeLabelFromSurface(surface) {
  if (!surface || typeof surface !== "object") return "";
  const props = surface.props && typeof surface.props === "object" ? surface.props : {};
  const candidates = [
    props.title,
    props.label,
    props.text,
    props.placeholder,
    surface.id && humanizeIdentifier(surface.id),
    surface.surfaceKind && humanizeIdentifier(surface.surfaceKind)
  ];
  for (const candidate of candidates) {
    const label = plainGuidanceLabel(candidate);
    if (label) return label;
  }
  return surface.id ? humanizeIdentifier(surface.id) : "";
}

export function guidanceScopeAnchorsFromWidgets(page, widgets = []) {
  const normalizedPage = typeof page === "string" ? page.trim() : "";
  if (!normalizedPage) return [];
  const rows = Array.isArray(widgets) ? widgets : [];
  const childrenByParent = new Map();
  for (const row of rows) {
    if (!row?.parent) continue;
    if (!childrenByParent.has(row.parent)) childrenByParent.set(row.parent, []);
    childrenByParent.get(row.parent).push(row);
  }
  for (const children of childrenByParent.values()) {
    children.sort((left, right) => Number(left?.order ?? 0) - Number(right?.order ?? 0));
  }
  const anchors = [];
  for (const row of rows) {
    const target = widgetGuidanceTarget(row);
    if (!row?.id || !target) continue;
    const label = guidanceScopeLabelFromWidget(row, childrenByParent) || row.id;
    const isSection = row.kind === "Box" || row.kind === "Section" || row.kind === "Form";
    anchors.push(guidanceScopeAnchor(
      isSection
        ? guidanceSectionScopeRecord(normalizedPage, row.id, label)
        : guidanceWidgetScopeRecord(normalizedPage, row.id, label),
      target
    ));
  }
  return anchors;
}

export function guidanceScopeAnchorsFromSurfaces(page, surfaces = []) {
  const normalizedPage = typeof page === "string" ? page.trim() : "";
  if (!normalizedPage) return [];
  const rows = Array.isArray(surfaces) ? surfaces : [];
  const anchors = [];
  for (const row of rows) {
    const target = surfaceGuidanceTarget(row);
    if (!row?.id || !target) continue;
    const label = guidanceScopeLabelFromSurface(row) || row.id;
    const isSection = row.surfaceKind === "generic" || row.surfaceKind === "app-root";
    anchors.push(guidanceScopeAnchor(
      isSection
        ? guidanceSectionScopeRecord(normalizedPage, row.id, label)
        : guidanceWidgetScopeRecord(normalizedPage, row.id, label),
      target
    ));
  }
  return anchors;
}

export function guidanceScopeAnchorsFromBootstrapSections(sections = []) {
  const anchors = [];
  for (const row of Array.isArray(sections) ? sections : []) {
    const sectionId = typeof row?.sectionId === "string" ? row.sectionId.trim() : "";
    const widgetId = typeof row?.widgetId === "string" ? row.widgetId.trim() : "";
    const target = typeof row?.target === "string" ? row.target.trim() : "";
    if (!target || (!sectionId && !widgetId)) continue;
    const label = typeof row?.label === "string" && row.label.trim() ? row.label.trim() : (widgetId || sectionId);
    const scope = widgetId
      ? guidanceWidgetScopeRecord("bootstrap", widgetId, label)
      : guidanceSectionScopeRecord("bootstrap", sectionId, label);
    anchors.push(guidanceScopeAnchor(scope, target));
  }
  return anchors;
}

export function buildGuidanceScopeCatalogEntries({ pages = [], scopes = [], widgetsByPage = {}, bootstrapSections = [] } = {}) {
  const entries = [];
  for (const page of pages) {
    entries.push(...guidanceScopeAnchorsFromWidgets(page, widgetsByPage[page]));
  }
  entries.push(...guidanceScopeAnchorsFromBootstrapSections(bootstrapSections));
  for (const scope of scopes) {
    if (scope && typeof scope === "object") entries.push(scope);
  }
  return entries;
}
