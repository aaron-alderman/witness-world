import { relation } from "./kernel.js";
import { runProcessGraph, runNode, predicatePasses } from "./process-graph.js";
import { renderPagePresentationHead, resolvePagePresentationTheme } from "./runtime-presentation.js";
import { frontendProgram, stableJson, templateWidgetTrees, widgetTree } from "./widgets.js";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function renderRuntimeWidgetPage(world, { actor, rootWidget, frontendProgram: programId = null, appConfig = {} }) {
  const tree = world.project(w => widgetTree(w, rootWidget));
  const program = world.project(w => frontendProgram(w, programId));
  const templates = world.project(templateWidgetTrees);
  const html = renderDocument(tree, program, appConfig, templates);
  if (actor) {
    world.emit({
      process: "widget.renderHtml",
      actor,
      claims: [relation(actor, "rendered", rootWidget)],
      body: { rootWidget, frontendProgram: programId, bytes: html.length }
    });
  }
  return html;
}

function renderDocument(root, program, appConfig = {}, templates = []) {
  const title = root.props?.title ?? "Witness App";
  const pageTheme = resolvePagePresentationTheme(appConfig.pageChrome || {});
  const bodyAttrs = [
    appConfig.page ? `data-page="${escapeAttr(appConfig.page)}"` : "",
    appConfig.surfaceContext ? `data-surface-context="${escapeAttr(appConfig.surfaceContext)}"` : "",
    appConfig.surfaceRouteId ? `data-surface-route="${escapeAttr(appConfig.surfaceRouteId)}"` : "",
    appConfig.surfaceRootWidgetId ? `data-surface-root-widget="${escapeAttr(appConfig.surfaceRootWidgetId)}"` : "",
    appConfig.surfaceProgramId ? `data-surface-program="${escapeAttr(appConfig.surfaceProgramId)}"` : "",
    pageTheme.themeId ? `data-page-theme="${escapeAttr(pageTheme.themeId)}"` : "",
    pageTheme.material ? `data-page-material="${escapeAttr(pageTheme.material)}"` : "",
    pageTheme.typography ? `data-page-typography="${escapeAttr(pageTheme.typography)}"` : ""
  ].filter(Boolean).join(" ");
  const options = { excludeRoles: new Set(appConfig.excludeWidgetRoles ?? []) };
  return `<!doctype html>\n<html>\n${renderPagePresentationHead({ title, pageTheme })}\n<body${bodyAttrs ? " " + bodyAttrs : ""}>\n${renderWidget(root, options)}\n${templates.map(template => renderWidgetTemplate(template, options)).join("\n")}\n${program ? renderClientEngine({ ...program, config: { ...appConfig, pageChrome: pageTheme } }) : ""}\n</body>\n</html>`;
}

function renderWidgetTemplate(widget, options = {}) {
  const content = renderWidget(widget, { ...options, templateContent: true });
  if (widget.kind === "Option") {
    return `<template data-widget-template="${escapeAttr(widget.id)}"><select data-template-wrapper="option">${content}</select></template>`;
  }
  return `<template data-widget-template="${escapeAttr(widget.id)}">${content}</template>`;
}

function renderWidget(widget, options = {}) {
  const role = widget.props?.role ?? widget.props?.["data-role"];
  if (role && options.excludeRoles?.has(role)) return "";
  if (widget.props?.template === true && !options.templateContent) return "";
  const children = widget.children.map(child => renderWidget(child, options)).join("\n");
  const attrs = renderAttrs(widget);

  switch (widget.kind) {
    case "Fragment":
      return children;
    case "Page":
      return `<main${attrs}>\n${children}\n</main>`;
    case "Box":
    case "Section":
      return `<section${attrs}>\n${children}\n</section>`;
    case "Header":
      return `<header${attrs}>\n${children}\n</header>`;
    case "Heading": {
      const level = clamp(Number(widget.props.level ?? 1), 1, 6);
      return `<h${level}${attrs}>${escapeHtml(widget.props.text ?? "")}</h${level}>`;
    }
    case "Paragraph":
      return `<p${attrs}>${escapeHtml(widget.props.text ?? "")}</p>`;
    case "Small":
      return `<small${attrs}>${escapeHtml(widget.props.text ?? "")}</small>`;
    case "Text":
      return `<div${attrs}>${escapeHtml(widget.props.text ?? "")}</div>`;
    case "Label":
      return `<label${attrs}>${children || escapeHtml(widget.props.text ?? "")}</label>`;
    case "Form":
      return `<form${attrs}>\n${children}\n</form>`;
    case "Input":
      return `<input${attrs}${renderExtraAttrs(widget, ["name", "placeholder", "type", "label", "template"])} name="${escapeAttr(widget.props.name ?? "value")}" placeholder="${escapeAttr(widget.props.placeholder ?? "")}" autocomplete="${escapeAttr(widget.props.autocomplete ?? "off")}" />`;
    case "Textarea":
      return `<textarea${attrs}${renderExtraAttrs(widget, ["name", "placeholder", "label", "template"])} name="${escapeAttr(widget.props.name ?? "value")}" placeholder="${escapeAttr(widget.props.placeholder ?? "")}">${escapeHtml(widget.props.text ?? "")}</textarea>`;
    case "Select":
      return `<select${attrs}${renderExtraAttrs(widget, ["name", "template"])} name="${escapeAttr(widget.props.name ?? "value")}">${children}</select>`;
    case "Option":
      return `<option${attrs}${renderExtraAttrs(widget, ["text", "value", "template"])} value="${escapeAttr(widget.props.value ?? "")}">${escapeHtml(widget.props.text ?? "")}</option>`;
    case "Details":
      return `<details${attrs}${widget.props.open ? " open" : ""}>${children}</details>`;
    case "Summary":
      return `<summary${attrs}>${escapeHtml(widget.props.text ?? "")}</summary>`;
    case "Button": {
      const type = widget.props.type ?? "button";
      return `<button${attrs}${renderExtraAttrs(widget, ["text", "type", "template"])} type="${escapeAttr(type)}">${escapeHtml(widget.props.text ?? "Button")}</button>`;
    }
    case "Link":
      return `<a${attrs}${renderExtraAttrs(widget, ["text", "href", "template"])} href="${escapeAttr(widget.props.href ?? "#")}">${escapeHtml(widget.props.text ?? widget.props.href ?? "Link")}</a>`;
    case "List":
      return `<ul${attrs}></ul>`;
    default:
      return `<section${attrs} data-kind="${escapeAttr(widget.kind)}">${children}</section>`;
  }
}

function renderAttrs(widget) {
  const widgetId = widget.props.widgetId ?? widget.id;
  const guidanceTarget = typeof widget.props.guidanceTarget === "string" && widget.props.guidanceTarget !== ""
    ? widget.props.guidanceTarget
    : (typeof widget.props.tutorialTarget === "string" && widget.props.tutorialTarget !== ""
        ? widget.props.tutorialTarget
        : "");
  const parts = [`data-widget="${escapeAttr(widgetId)}"`];
  if (widget.version) parts.push(`data-widget-version="${escapeAttr(widget.version)}"`);
  if (widget.props.domId) parts.push(`id="${escapeAttr(widget.props.domId)}"`);
  if (widget.props.class) parts.push(`class="${escapeAttr(widget.props.class)}"`);
  if (widget.props.hidden === true) parts.push("hidden");
  if (widget.props.role) {
    parts.push(`data-role="${escapeAttr(widget.props.role)}"`);
    parts.push(`data-${escapeAttr(widget.props.role)}`);
  }
  if (widget.props.action) parts.push(`data-action="${escapeAttr(widget.props.action)}"`);
  if (guidanceTarget) {
    parts.push(`data-guidance-target="${escapeAttr(guidanceTarget)}"`);
    parts.push(`data-tutorial-target="${escapeAttr(guidanceTarget)}"`);
  }
  if (widget.props.type && widget.kind !== "Button") parts.push(`type="${escapeAttr(widget.props.type)}"`);
  for (const [key, value] of Object.entries(widget.props || {})) {
    if (key.startsWith("event") && key.length > 5 && value != null) {
      parts.push(`data-${escapeAttr(camelToKebab(key.slice(5)))}="${escapeAttr(value)}"`);
    }
    if ((key.startsWith("data-") || key.startsWith("aria-")) && value != null) parts.push(`${escapeAttr(key)}="${escapeAttr(value)}"`);
  }
  return " " + parts.join(" ");
}

function renderExtraAttrs(widget, consumed = []) {
  const consumedSet = new Set(["class", "role", "action", "hidden", "template", "guidanceTarget", "tutorialTarget", "widgetId", "domId", "open", ...consumed]);
  const entries = Object.entries(widget.props || {})
    .filter(([key, value]) => !consumedSet.has(key) && !key.startsWith("event") && !key.startsWith("data-") && !key.startsWith("aria-") && value != null && typeof value !== "object");
  if (!entries.length) return "";
  return " " + entries.map(([key, value]) => `${escapeAttr(key)}="${escapeAttr(value)}"`).join(" ");
}

function camelToKebab(value) {
  return String(value || "").replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function renderClientEngine(program) {
  const json = JSON.stringify(program).replace(/</g, "\\u003c");
  const frontendProgramScriptId = typeof program.config?.frontendProgramScriptId === "string" && program.config.frontendProgramScriptId.trim()
    ? program.config.frontendProgramScriptId.trim()
    : "witness-frontend-program";
  const engine = String.raw`(async () => {
  const frontendProgramScriptId = ${JSON.stringify(frontendProgramScriptId)};
  let program = JSON.parse(document.getElementById(frontendProgramScriptId).textContent);
  let config = program.config || {};
  const state = Object.create(null);
  const byWidget = id => document.querySelector('[data-widget="' + CSS.escape(id) + '"]');
  const byTemplate = id => document.querySelector('[data-widget-template="' + CSS.escape(id) + '"]');
  const readPath = (value, path) => String(path || '').split('.').filter(Boolean).reduce((x, key) => x == null ? undefined : x[key], value);
  const runNode = ${runNode.toString()};
  const predicatePasses = ${predicatePasses.toString()};
  const runProcessGraph = ${runProcessGraph.toString()};
  const currentInitialStateScriptId = () => typeof config.initialStateScriptId === 'string' && config.initialStateScriptId.trim() ? config.initialStateScriptId.trim() : '';
  const currentInitialStateInto = () => typeof config.initialStateInto === 'string' && config.initialStateInto.trim() ? config.initialStateInto.trim() : '';
  const syncInitialState = (sourceDocument = document) => {
    const initialStateScriptId = currentInitialStateScriptId();
    const initialStateInto = currentInitialStateInto();
    if (!initialStateScriptId || !initialStateInto) return;
    const initialStateEl = sourceDocument.getElementById(initialStateScriptId);
    if (!initialStateEl?.textContent) return;
    try {
      state[initialStateInto] = JSON.parse(initialStateEl.textContent);
    } catch {}
  };
  syncInitialState(document);
  const scopeFor = extra => ({ state, event: state.event || {}, ...extra });
  const evaluateExpression = (expression, scope) => {
    const names = Object.keys(scope);
    const values = Object.values(scope);
    return Function(...names, 'return (' + expression + ');')(...values);
  };
  const interpolateString = (value, scope) => {
    const text = String(value ?? '');
    const exact = text.match(/^\$\{([^}]+)\}$/);
    if (exact) {
      try { return evaluateExpression(exact[1], scope); } catch { return ''; }
    }
    return text.replace(/\$\{([^}]+)\}/g, (_, expression) => {
      try {
        const result = evaluateExpression(expression, scope);
        return result == null ? '' : String(result);
      } catch {
        return '';
      }
    });
  };
  const interpolateValue = (value, scope) => {
    if (typeof value === 'string') return interpolateString(value, scope);
    if (Array.isArray(value)) return value.map(item => interpolateValue(item, scope));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, interpolateValue(item, scope)]));
    return value;
  };
  const requestOptions = options => ({ credentials: 'same-origin', ...(options || {}) });
  const resolveRuntimeUrl = url => {
    const text = String(url || '').trim();
    return text ? new URL(text, window.location.href).toString() : window.location.href;
  };
  const setText = (id, text) => { const el = byWidget(id); if (el) el.textContent = text ?? ''; };
  const setValue = (id, value) => {
    const el = byWidget(id);
    if (!el) return;
    if ('value' in el) el.value = value ?? '';
    else el.textContent = value ?? '';
  };
  const coerceBooleanFlag = value => value === true || value === 1 || value === '1' || String(value || '').trim().toLowerCase() === 'true';
  const setHidden = (id, hidden) => {
    const el = byWidget(id);
    if (!el) return;
    el.hidden = coerceBooleanFlag(hidden);
  };
  const setDisabled = (id, disabled) => {
    const el = byWidget(id);
    if (!el) return;
    const next = coerceBooleanFlag(disabled);
    if ('disabled' in el) el.disabled = next;
    else if (next) el.setAttribute('disabled', '');
    else el.removeAttribute('disabled');
  };
  const applyInterpolations = (root, scope) => {
    const applyElementAttrs = element => {
      for (const attr of [...element.attributes]) {
        if (!attr.value.includes('\${')) continue;
        const value = interpolateString(attr.value, scope);
        if (attr.name === 'selected' || attr.name === 'checked' || attr.name === 'disabled') {
          if (value === false || value === '' || value === 'false' || value == null) element.removeAttribute(attr.name);
          else element.setAttribute(attr.name, attr.name);
        } else if (value == null || value === false) {
          element.removeAttribute(attr.name);
        } else {
          element.setAttribute(attr.name, String(value));
        }
      }
    };
    if (root?.nodeType === Node.ELEMENT_NODE) applyElementAttrs(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let current;
    while ((current = walker.nextNode())) {
      if (current.nodeType === Node.TEXT_NODE) {
        if (current.textContent && current.textContent.includes('\${')) current.textContent = interpolateString(current.textContent, scope);
        continue;
      }
      applyElementAttrs(current);
    }
  };
  const instantiateTemplate = (templateId, scope) => {
    const template = byTemplate(templateId);
    if (!template) throw new Error('unknown template ' + templateId);
    const fragment = template.content.cloneNode(true);
    applyInterpolations(fragment, scope);
    return fragment;
  };
  const instantiateSelectOption = (templateId, scope) => {
    const template = byTemplate(templateId);
    if (!template) throw new Error('unknown template ' + templateId);
    const option = template.content.querySelector('option')?.cloneNode(true);
    if (!option) throw new Error('option template ' + templateId + ' did not yield an option');
    applyInterpolations(option, scope);
    return option;
  };
  const appendTemplateInstance = (target, instance) => {
    const wrapper = instance.firstElementChild;
    if (wrapper?.getAttribute?.('data-template-wrapper') === 'option') {
      while (wrapper.firstChild) target.appendChild(wrapper.firstChild);
      return;
    }
    target.appendChild(instance);
  };
  const renderCollection = ({ widget, from, template, itemAs = 'item', indexAs = 'index', emptyWidget = null, limit = null, reverse = false }) => {
    const el = byWidget(widget);
    if (!el) return;
    const value = Array.isArray(from) ? from : readPath(state, from);
    let items = Array.isArray(value) ? [...value] : [];
    if (reverse) items.reverse();
    if (limit != null && Number.isFinite(Number(limit))) items = items.slice(0, Number(limit));
    el.innerHTML = '';
    const fragment = document.createDocumentFragment();
    const target = el.tagName === 'SELECT' ? el : fragment;
    if (!items.length) {
      if (emptyWidget) appendTemplateInstance(target, instantiateTemplate(emptyWidget, scopeFor({ item: null, index: 0 })));
      if (target !== el) el.appendChild(fragment);
      return;
    }
    items.forEach((item, index) => {
      const scope = scopeFor({ item, index, [itemAs]: item, [indexAs]: index });
      if (el.tagName === 'SELECT') {
        el.appendChild(instantiateSelectOption(template, scope));
        return;
      }
      appendTemplateInstance(target, instantiateTemplate(template, scope));
    });
    if (target !== el) el.appendChild(fragment);
  };
  const initSession = async () => {
    const res = await fetch(resolveRuntimeUrl('/api/session'), requestOptions({}));
    state.session = await res.json().catch(() => ({ authenticated: false }));
    if (!res.ok) throw new Error(state.session?.error || 'session request failed');
    document.body.dataset.actor = state.session?.actor || '';
  };
  const setSession = async ({ from }) => {
    const credentials = state[from] || {};
    const res = await fetch(resolveRuntimeUrl('/api/session'), requestOptions({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: credentials.username || '',
        password: credentials.password || ''
      })
    }));
    state.session = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(state.session?.error || 'session request failed');
    document.body.dataset.actor = state.session?.actor || '';
  };
  const logout = async () => {
    const res = await fetch(resolveRuntimeUrl('/api/session'), requestOptions({ method: 'DELETE' }));
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error || 'logout failed');
    }
    state.session = { authenticated: false, identity: null, actor: null, label: null, perspective: null };
    document.body.dataset.actor = '';
  };
  const formForWidget = widget => {
    const el = byWidget(widget);
    if (!el) return null;
    return el.matches?.('form') ? el : el.querySelector?.('form') || null;
  };
  const readFormData = (form, { checkboxes } = {}) => {
    const data = Object.fromEntries(new FormData(form).entries());
    if (checkboxes === 'boolean') {
      for (const field of Array.from(form.elements || [])) {
        if (!(field instanceof HTMLInputElement)) continue;
        if (field.type !== 'checkbox' || !field.name) continue;
        data[field.name] = Boolean(field.checked);
      }
    }
    return data;
  };
  const readForm = ({ widget, into, checkboxes }) => {
    const form = formForWidget(widget);
    if (!form) throw new Error('widget ' + widget + ' does not contain a form');
    state[into] = readFormData(form, { checkboxes });
  };
  const clearForm = ({ widget }) => { formForWidget(widget)?.reset?.(); };
  const setQueryParam = ({ name, param, value = '', href = '', replace = true, reload = false }) => {
    const key = String(name || param || '').trim();
    if (!key) throw new Error('setQueryParam requires a parameter name');
    const url = new URL(href || window.location.href, window.location.origin);
    if (value == null || value === '') url.searchParams.delete(key);
    else url.searchParams.set(key, String(value));
    if (reload) {
      window.location.assign(url.toString());
      return;
    }
    if (replace === false) window.history.pushState({}, '', url.toString());
    else window.history.replaceState({}, '', url.toString());
  };
  const dispatchDomEvent = ({ event, eventName, detail = null, target = 'window', bubbles = false, cancelable = false, composed = false }) => {
    const name = String(eventName || event || '').trim();
    if (!name) throw new Error('dispatchDomEvent requires an event name');
    const resolvedTarget = target === 'document' ? document : target === 'body' ? document.body : window;
    resolvedTarget?.dispatchEvent?.(new CustomEvent(name, {
      detail,
      bubbles: Boolean(bubbles),
      cancelable: Boolean(cancelable),
      composed: Boolean(composed)
    }));
  };
  const resolveBody = ({ from, pick, body }, executionScope = {}) => {
    if (body) return interpolateValue(body, scopeFor({ ...executionScope }));
    const source = from ? (readPath(state, from) ?? readPath(scopeFor({ ...executionScope }), from) ?? {}) : {};
    if (!pick) return source;
    const out = {};
    for (const key of pick) out[key] = source[key];
    return out;
  };
  const bindSubmitHandlers = () => {
    for (const step of (program.steps || []).filter(s => s.event && s.event.startsWith('submit:'))) {
      const widget = step.event.slice('submit:'.length);
      const form = byWidget(widget);
      if (form && !form.__witnessBound) {
        form.__witnessBound = true;
        form.addEventListener('submit', event => { event.preventDefault(); safeRun('submit:' + widget); });
      }
    }
  };
  const refreshProjection = async () => {
    const res = await fetch(window.location.href, requestOptions({}));
    if (!res.ok) throw new Error('projection refresh failed');
    const html = await res.text();
    const nextDocument = new DOMParser().parseFromString(html, 'text/html');
    const nextProgramEl = nextDocument.getElementById(frontendProgramScriptId);
    if (nextProgramEl?.textContent) {
      program = JSON.parse(nextProgramEl.textContent);
      config = program.config || {};
    }
    const nextRoot = nextDocument.querySelector('[data-widget="' + CSS.escape(program.rootWidget) + '"]');
    const currentRoot = byWidget(program.rootWidget);
    if (!nextRoot || !currentRoot) throw new Error('projection root not found');
    currentRoot.replaceWith(nextRoot);
    document.querySelectorAll('[data-widget-template]').forEach(node => node.remove());
    const currentProgramEl = document.getElementById(frontendProgramScriptId);
    const templateAnchor = currentProgramEl || document.body.lastChild;
    nextDocument.querySelectorAll('[data-widget-template]').forEach(template => {
      const clone = template.cloneNode(true);
      if (templateAnchor?.parentNode) templateAnchor.parentNode.insertBefore(clone, templateAnchor);
      else document.body.appendChild(clone);
    });
    if (currentProgramEl && nextProgramEl?.textContent) currentProgramEl.textContent = nextProgramEl.textContent;
    const initialStateScriptId = currentInitialStateScriptId();
    const initialStateInto = currentInitialStateInto();
    if (initialStateScriptId && initialStateInto) {
      const nextInitialStateEl = nextDocument.getElementById(initialStateScriptId);
      if (nextInitialStateEl?.textContent) {
        const currentInitialStateEl = document.getElementById(initialStateScriptId);
        if (currentInitialStateEl) currentInitialStateEl.textContent = nextInitialStateEl.textContent;
        else if (templateAnchor?.parentNode) templateAnchor.parentNode.insertBefore(nextInitialStateEl.cloneNode(true), templateAnchor);
        else document.body.appendChild(nextInitialStateEl.cloneNode(true));
      }
      syncInitialState(nextDocument);
    }
    bindSubmitHandlers();
    await safeRun('load');
  };
  async function run(event, eventData = {}) {
    state.event = eventData;
    const nodes = (program.graph || program.steps || []).filter(step => step.event === event);
    if (!nodes.length) return;
    await runProcessGraph(
      nodes,
      event,
      async (node, nextState, executionScope) => {
        await executeStep(node, { stateRef: nextState, executionScope });
      },
      state
    );
  }
  async function safeRun(event, eventData = {}, step = null) {
    try {
      await run(event, eventData);
    } catch (error) {
      if (event === 'error' || !(program.graph || program.steps || []).some(row => row.event === 'error')) throw error;
      await run('error', {
        message: error instanceof Error ? error.message : String(error),
        event,
        stepId: step?.id || '',
        op: step?.op || ''
      });
    }
  }
  async function executeStep(step, { stateRef = state, executionScope = {} }) {
    const p = interpolateValue(step.params || {}, scopeFor(executionScope));
    if (step.op === 'initSession') await initSession(p);
    if (step.op === 'setSession') await setSession(p);
    if (step.op === 'logout') await logout(p);
    if (step.op === 'setText') setText(p.widget, p.text || '');
    if (step.op === 'setValue') setValue(p.widget, p.value ?? '');
    if (step.op === 'setHidden') setHidden(p.widget, p.hidden);
    if (step.op === 'setDisabled') setDisabled(p.widget, p.disabled);
    if (step.op === 'fetchJson') {
      const res = await fetch(resolveRuntimeUrl(p.url), requestOptions({}));
      stateRef[p.into] = await res.json().catch(() => ({}));
      if (!res.ok && !p.allowFailure) throw new Error(stateRef[p.into]?.error || 'request failed');
    }
    if (step.op === 'renderCollection') renderCollection(p);
    if (step.op === 'readForm') readForm(p);
    if (step.op === 'refreshProjection') await refreshProjection();
    if (step.op === 'navigate') window.location.assign(p.url || p.href || window.location.href);
    if (step.op === 'setQueryParam') setQueryParam(p);
    if (step.op === 'dispatchDomEvent') dispatchDomEvent(p);
    if (step.op === 'reloadPage') window.location.reload();
    if (step.op === 'postJson' || step.op === 'patchJson' || step.op === 'deleteJson') {
      const method = step.op === 'postJson' ? (p.method || 'POST') : step.op === 'patchJson' ? (p.method || 'PATCH') : (p.method || 'DELETE');
      const options = requestOptions({ method, headers: { 'content-type': 'application/json' } });
      if (step.op !== 'deleteJson') options.body = JSON.stringify(resolveBody(p, executionScope));
      const res = await fetch(resolveRuntimeUrl(p.url), options);
      stateRef[p.into || 'lastResponse'] = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(stateRef[p.into || 'lastResponse'].error || 'request failed');
    }
    if (step.op === 'clearForm') clearForm(p);
    if (step.op === 'run') await run(p.event, stateRef.event);
  }
  bindSubmitHandlers();
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    event.preventDefault();
    safeRun('click:' + button.dataset.action, { ...button.dataset, done: button.dataset.done === 'true' });
  });
  document.addEventListener('change', event => {
    const field = event.target.closest('input[data-widget], select[data-widget], textarea[data-widget]');
    if (!field) return;
    safeRun('change:' + field.getAttribute('data-widget'), { ...(field.dataset || {}), name: field.name || '', value: 'value' in field ? field.value : '', checked: 'checked' in field ? Boolean(field.checked) : undefined });
  });
  document.addEventListener('input', event => {
    const field = event.target.closest('input[data-widget], select[data-widget], textarea[data-widget]');
    if (!field) return;
    safeRun('input:' + field.getAttribute('data-widget'), { ...(field.dataset || {}), name: field.name || '', value: 'value' in field ? field.value : '', checked: 'checked' in field ? Boolean(field.checked) : undefined });
  });
  document.addEventListener('keydown', event => {
    const field = event.target?.closest?.('[data-widget]');
    const widget = field?.getAttribute('data-widget') || program.rootWidget || '';
    if (!widget) return;
    const semanticEvent = 'keydown:' + widget;
    if (!(program.graph || program.steps || []).some(step => step.event === semanticEvent)) return;
    safeRun(semanticEvent, {
      ...(field?.dataset || {}),
      key: event?.key || '',
      code: event?.code || '',
      altKey: Boolean(event?.altKey),
      ctrlKey: Boolean(event?.ctrlKey),
      metaKey: Boolean(event?.metaKey),
      shiftKey: Boolean(event?.shiftKey),
      repeat: Boolean(event?.repeat)
    });
  });
  safeRun('load');
})();`;
  return `<script type="application/json" id="${escapeAttr(frontendProgramScriptId)}">${json}</script>\n<script>\n${engine}\n</script>`;
}

export const renderWidgetPage = renderRuntimeWidgetPage;
