const cloneValue = value => value == null ? value ?? {} : JSON.parse(JSON.stringify(value));
const isObject = value => value != null && typeof value === "object" && !Array.isArray(value);
const deepMerge = (target, patch) => {
  if (patch == null || typeof patch !== "object" || Array.isArray(patch)) return cloneValue(patch);
  const merged = isObject(target) ? cloneValue(target) : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete merged[key];
      continue;
    }
    merged[key] = deepMerge(merged[key], value);
  }
  return merged;
};
const readPath = (object, path) => {
  const parts = String(path || "").split(".").map(part => part.trim()).filter(Boolean);
  let current = object;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
};
const writePath = (object, path, value) => {
  const parts = String(path || "").split(".").map(part => part.trim()).filter(Boolean);
  if (!parts.length) return cloneValue(value);
  const root = isObject(object) ? cloneValue(object) : {};
  let current = root;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    current[key] = isObject(current[key]) ? cloneValue(current[key]) : {};
    current = current[key];
  }
  current[parts.at(-1)] = cloneValue(value);
  return root;
};
const pickPaths = (state, paths = []) => {
  let picked = {};
  for (const path of paths) {
    const value = readPath(state, path);
    if (value === undefined) continue;
    picked = writePath(picked, path, value);
  }
  return picked;
};
const readStorage = (storage, key) => {
  try {
    const raw = storage?.getItem?.(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
};
const writeStorage = (storage, key, value) => {
  try {
    storage?.setItem?.(key, JSON.stringify(isObject(value) ? value : {}));
  } catch {}
};
const formatNumber = value => Number.isFinite(value) ? value.toFixed(1) : "0.0";

function initCommonShellRuntime() {
  document.querySelectorAll("[data-shell-nav-href]").forEach(node => {
    node.addEventListener("click", event => {
      if (event.defaultPrevented) return;
      const href = node.getAttribute("data-shell-nav-href");
      if (!href) return;
      event.preventDefault();
      window.location.assign(href);
    });
  });

  document.querySelectorAll("[data-auth-password-toggle]").forEach(button => {
    button.addEventListener("click", () => {
      const inputId = button.getAttribute("data-auth-password-toggle");
      const input = inputId ? document.getElementById(inputId) : null;
      if (!input) return;
      input.type = input.type === "password" ? "text" : "password";
      button.textContent = input.type === "password" ? "◉" : "◎";
    });
  });

  const profileToggle = document.querySelector("[data-shell-profile-toggle]");
  const profileMenu = document.getElementById("up-menu");
  if (profileToggle && profileMenu) {
    profileToggle.addEventListener("click", event => {
      event.stopPropagation();
      profileMenu.classList.toggle("open");
    });
    document.addEventListener("click", event => {
      if (!profileToggle.contains(event.target)) profileMenu.classList.remove("open");
    });
  }

  const tabGroups = [...document.querySelectorAll("[data-shell-tab-group]")]
    .map(node => node.getAttribute("data-shell-tab-group"))
    .filter(Boolean);
  for (const group of new Set(tabGroups)) {
    const tabs = [...document.querySelectorAll(`[data-shell-tab="${CSS.escape(group)}"][data-view]`)];
    const charts = [...document.querySelectorAll(`[data-shell-frame-wrap="${CSS.escape(group)}"] [data-chart-view]`)];
    if (!tabs.length || !charts.length) continue;
    const setActive = view => {
      for (const tab of tabs) tab.classList.toggle("active", tab.dataset.view === view);
      for (const chart of charts) chart.style.display = chart.dataset.chartView === view ? "" : "none";
    };
    for (const tab of tabs) tab.addEventListener("click", () => setActive(tab.dataset.view));
    setActive(tabs[0].dataset.view);
  }
}

async function bootParameterStudyShell(config) {
  const helperModule = await import(config.helperModuleHref);
  const helper = helperModule?.[config.helperExport];
  if (!helper) throw new Error("surface helper export not found: " + config.helperExport);

  const storageKey = helper.storageKey || "desire.surface-state";
  const defaults = helper.defaults();
  let state = helper.sanitizeState(deepMerge(
    deepMerge(defaults, readStorage(localStorage, storageKey + ":persistent")),
    readStorage(sessionStorage, storageKey + ":session")
  ));
  let resultsBySimulation = {};
  let playHandle = 0;
  let paused = false;
  let stopRequested = false;
  let runningSimulationId = null;
  let windowsBooted = false;

  const selectors = config.selectors || {};
  const $ = selector => selector ? document.querySelector(selector) : null;
  const modeButtons = [...document.querySelectorAll(selectors.modeButtons || "")];
  const windowButtons = [...document.querySelectorAll(selectors.windowButtons || "")];
  const primaryChart = document.querySelector(`[data-surface-id="${CSS.escape(config.surfaceChartIds.primary)}"]`);
  const secondaryChart = config.surfaceChartIds.secondary
    ? document.querySelector(`[data-surface-id="${CSS.escape(config.surfaceChartIds.secondary)}"]`)
    : null;
  const chartCanvas = $(selectors.chartCanvas);
  const chartCanvasCtx = chartCanvas ? chartCanvas.getContext("2d") : null;

  const persist = () => {
    writeStorage(localStorage, storageKey + ":persistent", pickPaths(state, helper.persistentPaths || []));
    writeStorage(sessionStorage, storageKey + ":session", pickPaths(state, helper.sessionPaths || []));
  };

  const setState = nextState => {
    state = helper.sanitizeState(nextState);
    persist();
    render();
  };

  const patchState = patch => setState(deepMerge(state, patch));
  const activeSimulation = () => state.ui?.activeSimId ? state.simulations?.[state.ui.activeSimId] : null;

  function syncRunConfigInputs() {
    const sim = activeSimulation();
    const runBoltsInput = $(selectors.runBoltsInput);
    const runDurationInput = $(selectors.runDurationInput);
    const runStepInput = $(selectors.runStepInput);
    if (runBoltsInput) runBoltsInput.value = String(sim?.config?.nBolts ?? 500);
    if (runDurationInput) runDurationInput.value = String(sim?.config?.tMax ?? 24);
    if (runStepInput) runStepInput.value = String(sim?.config?.dt ?? 0.5);
  }

  function renderStaticControls() {
    const container = $(selectors.staticContainer);
    if (!container) return;
    const controls = helper.staticControls(state);
    container.innerHTML = controls.map(control => `
      <div class="prow" data-static-key="${control.key}">
        <div class="prow-top">
          <label class="plabel" for="static-${control.key}">${control.label}</label>
          <span class="pval" id="static-${control.key}-val">${control.format(control.value)}</span>
        </div>
        <input type="range" id="static-${control.key}" min="${control.min}" max="${control.max}" step="${control.step}" value="${control.value}">
      </div>
    `).join("") + `<button class="save-sim-btn" id="save-sim-btn" type="button">Save as Simulation</button>`;
    for (const control of controls) {
      const input = document.getElementById(`static-${control.key}`);
      const output = document.getElementById(`static-${control.key}-val`);
      input?.addEventListener("input", () => {
        const numeric = Number(input.value);
        if (output) output.textContent = control.format(numeric);
        patchState({ staticView: { [control.key]: numeric } });
      });
    }
    document.getElementById("save-sim-btn")?.addEventListener("click", () => {
      const next = helper.saveScenarioAsSimulation(state);
      setState(next.state);
    });
  }

  function renderSimulationRows() {
    const container = $(selectors.simulationContainer);
    if (!container) return;
    const rows = helper.simulationRows(state);
    container.innerHTML = rows.map(row => `
      <div class="sim-row${row.active ? " on" : ""}" data-sim-id="${row.id}">
        <div class="sim-dot" style="background:${row.status === "done" ? "#16a34a" : row.status === "running" ? "#8CC4D4" : "#94a3b8"}"></div>
        <div class="sim-name">${row.name}</div>
        <div class="sim-badge ${row.status}">${row.status}</div>
        <div class="sim-acts">
          <button class="sab" type="button" data-sim-action="clone" data-sim-id="${row.id}">Clone</button>
          <button class="sab" type="button" data-sim-action="delete" data-sim-id="${row.id}">Delete</button>
        </div>
      </div>
    `).join("");
    container.querySelectorAll("[data-sim-id]").forEach(node => {
      node.addEventListener("click", event => {
        const action = event.target?.getAttribute?.("data-sim-action");
        const simId = event.target?.getAttribute?.("data-sim-id") || node.getAttribute("data-sim-id");
        if (!simId) return;
        if (action === "clone") {
          event.stopPropagation();
          const next = helper.cloneSimulation(state, simId);
          setState(next.state);
          return;
        }
        if (action === "delete") {
          event.stopPropagation();
          delete resultsBySimulation[simId];
          const next = helper.deleteSimulation(state, simId);
          setState(next.state);
          return;
        }
        patchState({ ui: { activeSimId: simId } });
      });
    });
  }

  function renderBoltSets() {
    const container = $(selectors.boltSetsContainer);
    if (!container) return;
    const cards = helper.boltSetCards(state);
    container.innerHTML = cards.map(card => `
      <div class="bs-item" data-bolt-set-id="${card.id}">
        <div class="bs-head">
          <div class="bs-dot" style="background:${card.color}"></div>
          <div class="bs-name">${card.name}</div>
          <label class="free-tog">
            <span class="tog-track${card.visible ? " on" : ""}"><span class="tog-knob"></span></span>
            <span class="tog-lbl">Visible</span>
            <input type="checkbox" data-bolt-visible="${card.id}" ${card.visible ? "checked" : ""} hidden>
          </label>
          <span class="bs-chev${card.open ? " open" : ""}">▶</span>
        </div>
        <div class="bs-params${card.open ? " open" : ""}">
          ${card.categories.map(category => `
            <div class="cat-lbl">${category.label}</div>
            ${category.params.map(param => `
              <div class="prow" data-bolt-param="${card.id}:${param.key}">
                <div class="prow-top">
                  <label class="plabel" for="bolt-${card.id}-${param.key}">${param.label}</label>
                  <span class="pval">${param.displayValue}${param.unit ? " " + param.unit : ""}</span>
                </div>
                ${param.type === "toggle"
                  ? `<input type="checkbox" id="bolt-${card.id}-${param.key}" data-bolt-toggle="${card.id}:${param.key}" ${param.value > 0.5 ? "checked" : ""}>`
                  : `<input type="range" id="bolt-${card.id}-${param.key}" min="${param.min}" max="${param.max}" step="${param.step}" value="${param.value}" data-bolt-range="${card.id}:${param.key}">`}
              </div>
            `).join("")}
          `).join("")}
        </div>
      </div>
    `).join("");
    container.querySelectorAll(".bs-head").forEach(head => {
      head.addEventListener("click", event => {
        if (event.target.closest("[data-bolt-visible]")) return;
        const item = head.closest("[data-bolt-set-id]");
        const boltSetId = item?.getAttribute("data-bolt-set-id");
        if (!boltSetId) return;
        patchState({ ui: { openBsSets: { [boltSetId]: !state.ui.openBsSets[boltSetId] } } });
      });
    });
    container.querySelectorAll("[data-bolt-visible]").forEach(input => {
      input.addEventListener("change", () => {
        const boltSetId = input.getAttribute("data-bolt-visible");
        if (!boltSetId) return;
        patchState({ boltSets: { [boltSetId]: { visible: input.checked } } });
      });
    });
    container.querySelectorAll("[data-bolt-range]").forEach(input => {
      input.addEventListener("input", () => {
        const [boltSetId, key] = input.getAttribute("data-bolt-range").split(":");
        patchState({ boltSets: { [boltSetId]: { params: { [key]: { value: Number(input.value) } } } } });
      });
    });
    container.querySelectorAll("[data-bolt-toggle]").forEach(input => {
      input.addEventListener("change", () => {
        const [boltSetId, key] = input.getAttribute("data-bolt-toggle").split(":");
        patchState({ boltSets: { [boltSetId]: { params: { [key]: { value: input.checked ? 1 : 0 } } } } });
      });
    });
  }

  function renderChartEditControls() {
    const container = $(selectors.editContainer);
    if (!container) return;
    const controls = helper.chartEditControls(state);
    container.innerHTML = controls.map(control => `
      <div class="prow" data-edit-key="${control.key}">
        <div class="prow-top">
          <label class="plabel" for="edit-${control.key.replaceAll(".", "-")}">${control.label}</label>
        </div>
        <input type="${control.type}" id="edit-${control.key.replaceAll(".", "-")}" value="${control.value}">
      </div>
    `).join("");
    container.querySelectorAll("[data-edit-key]").forEach(node => {
      const key = node.getAttribute("data-edit-key");
      const input = node.querySelector("input");
      input?.addEventListener("input", () => {
        const [head, indexText] = key.split(".");
        if (head === "bandFills") {
          const nextFills = [...state.chartEdit.bandFills];
          nextFills[Number(indexText)] = input.value;
          patchState({ chartEdit: { bandFills: nextFills } });
        }
      });
    });
  }

  function updateSectionVisibility() {
    const visible = helper.visibleSections(state);
    const sections = {
      static: $(selectors.staticSection),
      mc: $(selectors.mcSection),
      run: $(selectors.runSection),
      edit: $(selectors.editSection)
    };
    for (const [key, node] of Object.entries(sections)) {
      if (!node) continue;
      node.style.display = visible[key] ? "" : "none";
    }
    if ($(selectors.scrubber)) $(selectors.scrubber).classList.toggle("hidden", !(state.ui.mode === "mc" && resultsBySimulation[state.ui.activeSimId]));
  }

  function syncToolbar() {
    modeButtons.forEach(button => {
      button.classList.toggle("on", button.dataset.mode === state.ui.mode);
      button.classList.toggle("active", button.dataset.mode === state.ui.mode);
    });
    windowButtons.forEach(button => {
      const key = button.dataset.win;
      button.classList.toggle("on", !!state.ui.windows?.[key]?.visible);
    });
  }

  function syncChartModes() {
    const activeChartId = config.modeChartIds?.[state.ui.mode] || config.surfaceChartIds.primary;
    [primaryChart, secondaryChart].filter(Boolean).forEach(node => {
      node.style.display = node.getAttribute("data-surface-id") === activeChartId ? "" : "none";
    });
    const controller = primaryChart?.__chartController;
    if (controller?.update) {
      controller.update({
        params: helper.chartParams(state),
        view: {
          ...controller.spec.view,
          bandFills: state.chartEdit.bandFills
        }
      });
    }
  }

  function resizeOverlayCanvas() {
    if (!chartCanvas || !chartCanvasCtx) return;
    const rect = chartCanvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    chartCanvas.width = Math.max(1, Math.round(rect.width * dpr));
    chartCanvas.height = Math.max(1, Math.round(rect.height * dpr));
    chartCanvasCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    chartCanvas.style.width = rect.width + "px";
    chartCanvas.style.height = rect.height + "px";
  }

  function drawOverlay() {
    if (!chartCanvasCtx || !primaryChart?.__chartController?.node?.projectPoint) return;
    resizeOverlayCanvas();
    const rect = chartCanvas.getBoundingClientRect();
    chartCanvasCtx.clearRect(0, 0, rect.width, rect.height);
    if (state.ui.mode !== "mc") return;
    const scene = helper.overlayScene(state, resultsBySimulation);
    const failBadge = $(selectors.failBadge);
    if (failBadge) failBadge.textContent = scene.failureText || "";
    for (const dataset of scene.datasets) {
      chartCanvasCtx.fillStyle = dataset.color;
      for (const point of dataset.points) {
        const projected = primaryChart.__chartController.node.projectPoint(point.x, point.y);
        chartCanvasCtx.beginPath();
        chartCanvasCtx.globalAlpha = point.failed ? 0.85 : 0.35;
        chartCanvasCtx.arc(projected.x, projected.y, point.failed ? 3 : 2.25, 0, Math.PI * 2);
        chartCanvasCtx.fill();
      }
    }
    chartCanvasCtx.globalAlpha = 1;
  }

  function bringWindowToFront(windowId) {
    patchState({ ui: { maxZ: (state.ui.maxZ ?? 1) + 1, windows: { [windowId]: { z: (state.ui.maxZ ?? 1) + 1 } } } });
  }

  function bindWindowDrag(node, windowId) {
    const bar = node.querySelector(".fw-tb");
    bar?.addEventListener("pointerdown", event => {
      if (event.target.closest(".fw-btn")) return;
      const rect = node.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      const move = next => {
        node.style.left = Math.max(0, Math.min(next.clientX - offsetX, window.innerWidth - node.offsetWidth - 5)) + "px";
        node.style.top = Math.max(44, Math.min(next.clientY - offsetY, window.innerHeight - node.offsetHeight - 5)) + "px";
      };
      const up = () => {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", up);
        setState(helper.updateWindowFrame(state, windowId, {
          left: node.style.left,
          top: node.style.top,
          width: node.style.width,
          height: node.style.height
        }));
      };
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up);
      bringWindowToFront(windowId);
    });
  }

  function bindWindowResize(node, windowId) {
    const handle = node.querySelector(".fw-rz");
    handle?.addEventListener("pointerdown", event => {
      event.stopPropagation();
      const startWidth = node.offsetWidth;
      const startHeight = node.offsetHeight;
      const startX = event.clientX;
      const startY = event.clientY;
      const move = next => {
        node.style.width = Math.max(300, startWidth + (next.clientX - startX)) + "px";
        node.style.height = Math.max(140, startHeight + (next.clientY - startY)) + "px";
        renderWindowBody(windowId);
      };
      const up = () => {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", up);
        setState(helper.updateWindowFrame(state, windowId, {
          left: node.style.left,
          top: node.style.top,
          width: node.style.width,
          height: node.style.height
        }));
      };
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up);
    });
  }

  function renderWindowBody(windowId) {
    const body = document.getElementById(`fwb-${windowId}`);
    if (!body) return;
    if (windowId === "stats") {
      const rows = helper.buildStatsRows(state, resultsBySimulation);
      const formatCell = value => Number.isFinite(Number(value)) ? Number(value).toFixed(1) : "—";
      body.innerHTML = rows.length
        ? `<table class="stbl"><thead><tr><th>Simulation</th><th>Bolt Set</th><th>n</th><th>% Failed</th><th>Mean T</th><th>Std</th><th>P10</th><th>P50</th><th>P90</th></tr></thead><tbody>${rows.map(row => `<tr><td>${row.sim}</td><td><span class="sc-dot" style="background:${row.color}"></span>${row.boltSet}</td><td class="num">${row.n}</td><td class="num">${((row.pFail || 0) * 100).toFixed(1)}%</td><td class="num">${formatCell(row.meanT)}</td><td class="num">${formatCell(row.stdT)}</td><td class="num">${formatCell(row.p10)}</td><td class="num">${formatCell(row.p50)}</td><td class="num">${formatCell(row.p90)}</td></tr>`).join("")}</tbody></table>`
        : `<p style="padding:12px;font-size:11.5px;color:#94a3b8">No completed simulations.</p>`;
      return;
    }
    if (windowId === "anova") {
      const anovaData = helper.buildAnovaData(state, resultsBySimulation);
      body.innerHTML = anovaData.groups.length < 2
        ? `<p style="padding:12px;font-size:11.5px;color:#94a3b8">Need at least two groups with failures for ANOVA.</p>`
        : `<div class="anova-stat"><div class="anova-kv"><span class="anova-k">Groups</span><span class="anova-v">${anovaData.groups.length}</span></div><div class="anova-kv"><span class="anova-k">F-statistic</span><span class="anova-v">${anovaData.result?.F?.toFixed?.(2) ?? "—"}</span></div><div class="anova-kv"><span class="anova-k">Grand mean</span><span class="anova-v">${anovaData.result?.grand?.toFixed?.(1) ?? "—"}</span></div></div>`;
      return;
    }
    const datasets = helper.buildCdfDatasets(state, resultsBySimulation);
    if (!datasets.length) {
      body.innerHTML = `<p style="padding:12px;font-size:11.5px;color:#94a3b8">Run a Monte Carlo simulation to see results.</p>`;
      return;
    }
    body.innerHTML = `<svg width="100%" height="100%"></svg>`;
    const svg = body.querySelector("svg");
    const width = body.clientWidth || 420;
    const height = body.clientHeight || 260;
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const d3 = globalThis.d3;
    if (!d3) return;
    const margin = { top: 18, right: 22, bottom: 42, left: 48 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;
    const xMax = Math.max(...datasets.flatMap(dataset => dataset.cdf.map(point => point.t)));
    const xScale = d3.scaleLinear().domain([0, xMax]).range([0, innerW]);
    const yScale = d3.scaleLinear().domain([0, 1]).range([innerH, 0]);
    const root = d3.select(svg);
    root.selectAll("*").remove();
    const group = root.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    group.append("g").attr("transform", `translate(0,${innerH})`).call(d3.axisBottom(xScale).ticks(6));
    group.append("g").call(d3.axisLeft(yScale).ticks(5));
    const line = d3.line().x(point => xScale(point.t)).y(point => yScale(point.f)).curve(d3.curveStepAfter);
    for (const dataset of datasets) {
      group.append("path").datum(dataset.cdf).attr("d", line).attr("fill", "none").attr("stroke", dataset.color).attr("stroke-width", 2);
    }
  }

  function renderWindows() {
    const layer = document.getElementById(config.windowLayerId);
    if (!layer) return;
    if (!windowsBooted) {
      windowsBooted = true;
      for (const [windowId, definition] of Object.entries(config.windowDefs || {})) {
        const node = document.createElement("div");
        node.className = "fw";
        node.id = `fw-${windowId}`;
        node.innerHTML = `<div class="fw-tb"><span class="fw-title">${definition.title}</span><button class="fw-btn" type="button" data-fw-close="${windowId}">✕</button></div><div class="fw-body" id="fwb-${windowId}"></div><div class="fw-rz"></div>`;
        layer.appendChild(node);
        node.addEventListener("pointerdown", () => bringWindowToFront(windowId));
        node.querySelector("[data-fw-close]")?.addEventListener("click", event => {
          event.stopPropagation();
          patchState({ ui: { windows: { [windowId]: { visible: false } } } });
        });
        bindWindowDrag(node, windowId);
        bindWindowResize(node, windowId);
      }
    }
    for (const [windowId, frame] of Object.entries(state.ui.windows || {})) {
      const node = document.getElementById(`fw-${windowId}`);
      if (!node) continue;
      const width = window.innerWidth;
      const height = window.innerHeight;
      const px = {
        left: Math.min(Math.round((frame.xf ?? 0.55) * width), width - 320),
        top: Math.max(44, Math.round((frame.yf ?? 0.08) * height)),
        width: Math.max(300, Math.round((frame.wf ?? 0.35) * width)),
        height: Math.max(140, Math.round((frame.hf ?? 0.35) * height))
      };
      node.style.display = frame.visible ? "flex" : "none";
      node.style.left = `${px.left}px`;
      node.style.top = `${px.top}px`;
      node.style.width = `${px.width}px`;
      node.style.height = `${px.height}px`;
      node.style.zIndex = String(frame.z ?? 1);
      if (!frame.visible) continue;
      renderWindowBody(windowId);
    }
  }

  function updateProgressUi() {
    const sim = activeSimulation();
    const fill = $(selectors.progressFill);
    const label = $(selectors.progressLabel);
    const runButton = $(selectors.runButton);
    const pauseButton = $(selectors.pauseButton);
    const stopButton = $(selectors.stopButton);
    if (fill) fill.style.width = `${((sim?.progress ?? 0) * 100).toFixed(1)}%`;
    if (label) {
      label.textContent = sim?.status === "running"
        ? `Running... ${(((sim?.progress ?? 0) * 100).toFixed(0))}%`
        : sim?.status === "done"
          ? "Completed"
          : sim?.status === "stopped"
            ? "Stopped"
            : "Ready";
    }
    if (runButton) runButton.disabled = !sim || sim.status === "running";
    if (pauseButton) pauseButton.disabled = sim?.status !== "running";
    if (stopButton) stopButton.disabled = sim?.status !== "running";
  }

  function renderScrubberUi() {
    const result = state.ui.activeSimId ? resultsBySimulation[state.ui.activeSimId] : null;
    const timeSlider = $(selectors.timeSlider);
    const timeLabel = $(selectors.timeLabel);
    const speedSlider = $(selectors.speedSlider);
    const speedLabel = $(selectors.speedLabel);
    const trailCheckbox = $(selectors.trailCheckbox);
    const playButton = $(selectors.playButton);
    if (timeSlider && result?.tVals?.length) {
      const max = result.tVals[result.tVals.length - 1];
      timeSlider.max = String(max);
      timeSlider.value = String(state.ui.scrubber.t ?? 0);
    }
    if (timeLabel) timeLabel.textContent = `t = ${formatNumber(state.ui.scrubber.t ?? 0)} mo`;
    if (speedSlider) speedSlider.value = String(state.ui.scrubber.speed ?? 1);
    if (speedLabel) speedLabel.textContent = `${formatNumber(state.ui.scrubber.speed ?? 1)}×`;
    if (trailCheckbox) trailCheckbox.checked = !!state.ui.scrubber.showTrail;
    if (playButton) playButton.textContent = state.ui.scrubber.playing ? "❚❚" : "▶";
  }

  function stopPlayback() {
    if (playHandle) cancelAnimationFrame(playHandle);
    playHandle = 0;
  }

  function startPlayback() {
    stopPlayback();
    const result = state.ui.activeSimId ? resultsBySimulation[state.ui.activeSimId] : null;
    if (!result?.tVals?.length) return;
    let lastTs = 0;
    const tick = ts => {
      if (!state.ui.scrubber.playing) return;
      if (!lastTs) lastTs = ts;
      const delta = (ts - lastTs) / 1000;
      lastTs = ts;
      const max = result.tVals[result.tVals.length - 1];
      let next = (state.ui.scrubber.t ?? 0) + delta * (state.ui.scrubber.speed ?? 1);
      if (next > max) next = 0;
      state = helper.sanitizeState(deepMerge(state, { ui: { scrubber: { t: next, tMax: max } } }));
      persist();
      render();
      playHandle = requestAnimationFrame(tick);
    };
    playHandle = requestAnimationFrame(tick);
  }

  async function runSimulation() {
    const sim = activeSimulation();
    if (!sim || runningSimulationId) return;
    runningSimulationId = sim.id;
    stopRequested = false;
    paused = false;
    patchState({ simulations: { [sim.id]: { status: "running", progress: 0 } } });
    const result = await helper.runSimulation({
      state,
      simulationId: sim.id,
      shouldStop: () => stopRequested,
      shouldPause: () => paused,
      onProgress: progress => {
        state = helper.sanitizeState(deepMerge(state, { simulations: { [sim.id]: { progress } } }));
        persist();
        render();
      }
    });
    runningSimulationId = null;
    if (!result) {
      patchState({ simulations: { [sim.id]: { status: "stopped", progress: 0 } } });
      return;
    }
    resultsBySimulation[sim.id] = result;
    patchState({
      simulations: { [sim.id]: { status: "done", progress: 1, summary: result.summary } },
      ui: { scrubber: { t: 0, tMax: result.tVals[result.tVals.length - 1], playing: false } }
    });
  }

  function bindFixedEvents() {
    modeButtons.forEach(button => {
      button.addEventListener("click", () => patchState({ ui: { mode: button.dataset.mode } }));
    });
    windowButtons.forEach(button => {
      button.addEventListener("click", () => {
        const key = button.dataset.win;
        patchState({ ui: { windows: { [key]: { visible: !state.ui.windows?.[key]?.visible } } } });
      });
    });
    $(selectors.newSimulationButton)?.addEventListener("click", () => {
      const next = helper.createSimulation(state);
      setState(next.state);
    });
    $(selectors.runButton)?.addEventListener("click", () => { void runSimulation(); });
    $(selectors.pauseButton)?.addEventListener("click", () => { paused = !paused; });
    $(selectors.stopButton)?.addEventListener("click", () => { stopRequested = true; paused = false; });
    $(selectors.playButton)?.addEventListener("click", () => {
      const playing = !state.ui.scrubber.playing;
      patchState({ ui: { scrubber: { playing } } });
      if (playing) startPlayback();
      else stopPlayback();
    });
    $(selectors.timeSlider)?.addEventListener("input", event => {
      stopPlayback();
      patchState({ ui: { scrubber: { t: Number(event.target.value), playing: false } } });
    });
    $(selectors.speedSlider)?.addEventListener("input", event => {
      patchState({ ui: { scrubber: { speed: Number(event.target.value) } } });
    });
    $(selectors.trailCheckbox)?.addEventListener("change", event => {
      patchState({ ui: { scrubber: { showTrail: !!event.target.checked } } });
    });
    const runBoltsInput = $(selectors.runBoltsInput);
    const runDurationInput = $(selectors.runDurationInput);
    const runStepInput = $(selectors.runStepInput);
    const updateRunConfig = () => {
      const sim = activeSimulation();
      if (!sim) return;
      patchState({
        simulations: {
          [sim.id]: {
            config: {
              nBolts: Number(runBoltsInput?.value || sim.config.nBolts || 500),
              tMax: Number(runDurationInput?.value || sim.config.tMax || 24),
              dt: Number(runStepInput?.value || sim.config.dt || 0.5)
            }
          }
        }
      });
    };
    runBoltsInput?.addEventListener("change", updateRunConfig);
    runDurationInput?.addEventListener("change", updateRunConfig);
    runStepInput?.addEventListener("change", updateRunConfig);
    window.addEventListener("resize", () => render());
  }

  function render() {
    syncToolbar();
    renderStaticControls();
    renderSimulationRows();
    renderBoltSets();
    renderChartEditControls();
    updateSectionVisibility();
    syncChartModes();
    updateProgressUi();
    renderScrubberUi();
    syncRunConfigInputs();
    renderWindows();
    drawOverlay();
  }

  bindFixedEvents();
  render();
}

(async () => {
  initCommonShellRuntime();
  if (!desireSurfaceClientConfig?.configHref) return;
  const response = await fetch(desireSurfaceClientConfig.configHref, { credentials: "same-origin" });
  if (!response.ok) throw new Error("surface client config request failed: " + response.status);
  const config = await response.json();
  if (config?.kind === "parameter-study-shell") await bootParameterStudyShell(config);
})();
