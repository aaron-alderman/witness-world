import {
  buildPathFromContainer,
  buildOperatorWorkbenchSnapshot,
  buildOperatorTuiState,
  buildTuiAutocompleteCandidates,
  buildTuiAutocompletePreview,
  createOperatorTuiEngine,
  loadOperatorTuiRuntimeContext,
  parseTuiArgs
} from "../operator-tui.js";
import {
  DEFAULT_OPERATOR_WORKBENCH_DISPLAY_SETTINGS,
  normalizeOperatorWorkbenchDisplaySettings
} from "./settings.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function defaultUiState(displaySettings) {
  return {
    focusedPane: "left",
    lastNonTopPane: "left",
    inspectorTab: "inspect",
    rightScreenMode: "custom-screen",
    activeScreenId: "inspect",
    inspectorSpec: null,
    helpOpen: false,
    topCursor: 0,
    leftCursor: 0,
    rightCursor: 0,
    rightSectionIndex: 0,
    rightSectionCursorsByScreenId: {},
    collapsedSectionIdsByScreenId: {},
    numberBuffer: "",
    lastOutput: "",
    lastStatus: "info",
    displaySettings: normalizeOperatorWorkbenchDisplaySettings(displaySettings)
  };
}

function commandForPrimaryRow(row) {
  if (!row) return null;
  if (row.primaryAction?.command) return row.primaryAction.command;
  if (row.type === "container") return `open ${row.index}`;
  if (row.type === "record") return `inspect ${row.index}`;
  if (row.type === "alias") return `inspect ${row.index}`;
  return null;
}

function normalizedRightScreenMode(mode) {
  return mode === "custom-screen" ? "custom-screen" : "custom-screen";
}

function rightCursorForSnapshot(snapshot, uiState) {
  return Math.max(0, Number(snapshot?.rightPane?.screen?.activeRowIndex) || 0);
}

function startsSearchCommand(command) {
  return /^search(?:\s|$)/.test(String(command || "").trim());
}

function rightPaneRows(snapshot, uiState) {
  return uiState?.rightScreenMode === "custom-screen" ? (snapshot?.rightPane?.screen?.rows ?? []) : [];
}

function activeRightSection(snapshot) {
  const screen = snapshot?.rightPane?.screen ?? null;
  const sections = screen?.sections ?? [];
  return sections[screen?.activeSectionIndex ?? 0] ?? null;
}

function currentRightScreenId(snapshot, uiState) {
  return snapshot?.rightPane?.activeScreenId ?? uiState?.activeScreenId ?? "inspect";
}

function ensureSessionRightScreenState(session, screenId) {
  if (!session.workbenchSectionStateByScreenId || typeof session.workbenchSectionStateByScreenId !== "object") {
    session.workbenchSectionStateByScreenId = {};
  }
  if (!session.workbenchSectionStateByScreenId[screenId]) {
    session.workbenchSectionStateByScreenId[screenId] = {
      activeSectionId: null,
      cursorsBySectionId: {},
      collapsedSectionIds: [],
      lastCollapsedSectionId: null
    };
  }
  return session.workbenchSectionStateByScreenId[screenId];
}

function syncRightSectionUiState(snapshot, uiState) {
  const screenId = currentRightScreenId(snapshot, uiState);
  const screen = snapshot?.rightPane?.screen ?? null;
  uiState.rightSectionIndex = Math.max(0, Number(screen?.activeSectionIndex ?? 0) || 0);
  if (!uiState.rightSectionCursorsByScreenId[screenId]) uiState.rightSectionCursorsByScreenId[screenId] = {};
  uiState.rightSectionCursorsByScreenId[screenId] = Object.fromEntries(
    (screen?.sections ?? []).map(section => [section.id, Number(section.activeRowIndex ?? 0) || 0])
  );
  uiState.collapsedSectionIdsByScreenId[screenId] = (screen?.sections ?? [])
    .filter(section => section?.collapsed)
    .map(section => section.id);
}

function nextInspectorTab(snapshot, currentTab) {
  const order = ["inspect", "references", "source", "provenance"];
  const startIndex = Math.max(0, order.indexOf(currentTab));
  for (let offset = 1; offset <= order.length; offset += 1) {
    const candidate = order[(startIndex + offset) % order.length];
    if (candidate === "inspect" || snapshot?.rightPane?.tabs?.[candidate]) return candidate;
  }
  return "inspect";
}

export function createOperatorWorkbenchController({
  state,
  engine,
  displaySettings = DEFAULT_OPERATOR_WORKBENCH_DISPLAY_SETTINGS,
  saveDisplaySettings = async settings => settings
} = {}) {
  const uiState = defaultUiState(displaySettings);

  function applyDisplaySettingsToActiveResultView() {
    const resultView = engine.session.resultView;
    if (!resultView || resultView.activeViewName) return;
    resultView.columns = [...uiState.displaySettings.defaultColumns];
    resultView.pageSize = uiState.displaySettings.pageSize;
    resultView.page = 1;
  }

  async function snapshot() {
    const next = await buildOperatorWorkbenchSnapshot(state, engine.session, uiState);
    uiState.topCursor = clamp(uiState.topCursor, 0, Math.max(0, next.topPane?.navigation?.chips?.length - 1));
    uiState.leftCursor = clamp(uiState.leftCursor, 0, Math.max(0, next.leftPane.rows.length - 1));
    uiState.rightCursor = clamp(uiState.rightCursor, 0, Math.max(0, rightPaneRows(next, uiState).length - 1));
    syncRightSectionUiState(next, uiState);
    return buildOperatorWorkbenchSnapshot(state, engine.session, uiState);
  }

  async function afterResult(result, { command = null } = {}) {
    if (startsSearchCommand(command)) applyDisplaySettingsToActiveResultView();
    if (result?.ui?.inspectorSpec !== undefined) {
      uiState.inspectorSpec = result.ui.inspectorSpec;
      uiState.inspectorTab = result.ui?.inspectorTab ?? "inspect";
    }
    if (result?.ui?.rightScreenMode !== undefined) {
      uiState.rightScreenMode = normalizedRightScreenMode(result.ui.rightScreenMode);
    }
    if (result?.ui?.activeScreenId !== undefined) {
      uiState.activeScreenId = result.ui.activeScreenId ?? null;
      if (uiState.activeScreenId) uiState.inspectorTab = uiState.activeScreenId;
    }
    const nextSnapshot = await snapshot();
    uiState.rightCursor = rightCursorForSnapshot(nextSnapshot, uiState);
    uiState.numberBuffer = "";
    uiState.lastOutput = result?.output ?? "";
    uiState.lastStatus = result?.status ?? "info";
    return {
      result,
      snapshot: await snapshot()
    };
  }

  async function executeCommand(command) {
    const result = await engine.execute(command);
    return afterResult(result, { command });
  }

  function clearResultViewForStructuralNavigation() {
    engine.session.resultView = null;
    engine.session.lastEntries = [];
    uiState.leftCursor = 0;
  }

  function setRightSectionCursor(screenId, sectionId, index) {
    if (!screenId || !sectionId) return;
    const stateForScreen = ensureSessionRightScreenState(engine.session, screenId);
    stateForScreen.cursorsBySectionId[sectionId] = Math.max(0, Number(index) || 0);
  }

  function setActiveRightSection(screenId, sectionId) {
    if (!screenId) return;
    const stateForScreen = ensureSessionRightScreenState(engine.session, screenId);
    stateForScreen.activeSectionId = sectionId ?? null;
  }

  function setRightSectionCollapsed(screenId, sectionId, collapsed) {
    if (!screenId || !sectionId) return;
    const stateForScreen = ensureSessionRightScreenState(engine.session, screenId);
    const collapsedIds = new Set(stateForScreen.collapsedSectionIds ?? []);
    if (collapsed) {
      collapsedIds.add(sectionId);
      stateForScreen.lastCollapsedSectionId = sectionId;
    } else {
      collapsedIds.delete(sectionId);
      if (stateForScreen.lastCollapsedSectionId === sectionId) stateForScreen.lastCollapsedSectionId = null;
    }
    stateForScreen.collapsedSectionIds = [...collapsedIds];
  }

  async function navigateToContainer(containerId) {
    if (engine.session.resultView) clearResultViewForStructuralNavigation();
    if (!containerId) {
      engine.session.currentPath = [];
    } else {
      const path = buildPathFromContainer(state.containerIndex, containerId);
      engine.session.currentPath = path;
    }
    uiState.numberBuffer = "";
    return {
      result: {
        output: uiState.lastOutput,
        status: uiState.lastStatus
      },
      snapshot: await snapshot()
    };
  }

  async function resolveTopPrimaryCommand() {
    const next = await snapshot();
    const chip = next.topPane?.navigation?.chips?.[uiState.topCursor] ?? null;
    if (!chip?.action) {
      return {
        result: { output: "navigation chip has no primary action.", status: "error" },
        snapshot: next
      };
    }
    if (chip.action.kind === "noop") {
      return {
        result: { output: uiState.lastOutput, status: uiState.lastStatus },
        snapshot: next
      };
    }
    if (chip.action.kind === "command") return executeCommand(chip.action.command);
    if (chip.action.kind === "navigate-path") return navigateToContainer(chip.action.containerId);
    if (chip.action.kind === "inspect-focus") return executeCommand(`inspect ${chip.action.targetId}`);
    if (chip.action.kind === "set-right-screen-mode") {
      uiState.rightScreenMode = normalizedRightScreenMode(chip.action.screenMode);
      uiState.activeScreenId = chip.action.screenId ?? "inspect";
      uiState.inspectorTab = uiState.activeScreenId;
      uiState.rightCursor = rightCursorForSnapshot(next, uiState);
      return {
        result: { output: uiState.lastOutput, status: uiState.lastStatus },
        snapshot: await snapshot()
      };
    }
    if (chip.action.kind === "cycle-mode") {
      const tab = nextInspectorTab(next, uiState.inspectorTab);
      uiState.inspectorTab = tab;
      uiState.rightScreenMode = "custom-screen";
      uiState.activeScreenId = tab;
      uiState.rightCursor = rightCursorForSnapshot(await snapshot(), uiState);
      return {
        result: { output: uiState.lastOutput, status: uiState.lastStatus },
        snapshot: await snapshot()
      };
    }
    return {
      result: { output: "navigation action is not supported yet.", status: "error" },
      snapshot: next
    };
  }

  async function resolveLeftPrimaryCommand() {
    const next = await snapshot();
    const numericIndex = uiState.numberBuffer ? Number(uiState.numberBuffer) - 1 : uiState.leftCursor;
    const row = next.leftPane.rows[numericIndex] ?? null;
    if (!row) {
      uiState.numberBuffer = "";
      return { result: { output: "no active row.", status: "error" }, snapshot: next };
    }
    const command = commandForPrimaryRow(row);
    if (!command) {
      uiState.numberBuffer = "";
      return { result: { output: "row has no primary action.", status: "error" }, snapshot: next };
    }
    return executeCommand(command);
  }

  async function resolveRightPrimaryCommand() {
    const next = await snapshot();
    if (uiState.rightScreenMode === "custom-screen") {
      const section = activeRightSection(next);
      if (section?.collapsed) {
        return {
          result: { output: `${section.title || "section"} is collapsed.`, status: "error" },
          snapshot: next
        };
      }
      const row = next.rightPane?.screen?.rows?.[uiState.rightCursor] ?? null;
      if (!row) {
        return {
          result: {
            output: section?.actionable === false
              ? `${section.title || "section"} has no actionable row.`
              : "no active screen row.",
            status: "error"
          },
          snapshot: next
        };
      }
      if (!row.primaryCommand) {
        return {
          result: { output: `${section?.title || "section"} is informational only.`, status: "error" },
          snapshot: next
        };
      }
      const result = await engine.execute(row.primaryCommand);
      return afterResult({
        ...result,
        ui: {
          ...(result.ui ?? {}),
          ...(row.primaryUi ?? {})
        }
      }, { command: row.primaryCommand });
    }
    return resolveLeftPrimaryCommand();
  }

  async function dispatchIntent(intent = {}) {
    const type = String(intent.type || "");
    if (type === "set-focused-pane") {
      uiState.focusedPane = intent.pane || "left";
      if (uiState.focusedPane !== "top") uiState.lastNonTopPane = uiState.focusedPane;
      return { snapshot: await snapshot() };
    }
    if (type === "toggle-help") {
      uiState.helpOpen = !uiState.helpOpen;
      return { snapshot: await snapshot() };
    }
    if (type === "set-inspector-tab") {
      uiState.rightScreenMode = "custom-screen";
      uiState.inspectorTab = ["inspect", "references", "source", "provenance"].includes(intent.tab)
        ? intent.tab
        : "inspect";
      uiState.activeScreenId = uiState.inspectorTab;
      uiState.rightCursor = rightCursorForSnapshot(await snapshot(), uiState);
      return { snapshot: await snapshot() };
    }
    if (type === "set-right-screen-mode") {
      uiState.rightScreenMode = normalizedRightScreenMode(intent.mode);
      uiState.activeScreenId = intent.screenId ?? uiState.activeScreenId ?? "inspect";
      uiState.inspectorTab = uiState.activeScreenId;
      const next = await snapshot();
      uiState.rightCursor = rightCursorForSnapshot(next, uiState);
      return { snapshot: await snapshot() };
    }
    if (type === "set-right-section" || type === "move-right-section") {
      const next = await snapshot();
      const screenId = currentRightScreenId(next, uiState);
      const sections = next.rightPane?.screen?.sections ?? [];
      if (!sections.length) return { snapshot: next };
      let nextIndex = next.rightPane?.screen?.activeSectionIndex ?? 0;
      if (type === "set-right-section") {
        if (intent.sectionId) {
          const explicitIndex = sections.findIndex(section => section?.id === intent.sectionId);
          if (explicitIndex >= 0) nextIndex = explicitIndex;
        } else if (intent.index !== undefined) {
          nextIndex = clamp(Number(intent.index) || 0, 0, Math.max(0, sections.length - 1));
        }
      } else {
        const delta = intent.direction === "prev" ? -1 : 1;
        for (let step = 0; step < sections.length; step += 1) {
          nextIndex = (nextIndex + delta + sections.length) % sections.length;
          const candidate = sections[nextIndex];
          if (candidate?.collapsed && !candidate?.actionable && !(candidate?.rows ?? []).length) continue;
          break;
        }
      }
      const nextSection = sections[nextIndex] ?? null;
      if (nextSection) {
        setActiveRightSection(screenId, nextSection.id ?? null);
        uiState.rightSectionIndex = nextIndex;
        uiState.rightCursor = Math.max(0, Number(nextSection.activeRowIndex ?? 0) || 0);
      }
      return { snapshot: await snapshot() };
    }
    if (type === "toggle-right-section-collapsed" || type === "expand-right-section" || type === "collapse-right-section") {
      const next = await snapshot();
      const section = activeRightSection(next);
      const screenId = currentRightScreenId(next, uiState);
      if (!section?.id || section.collapsible === false) return { snapshot: next };
      const shouldCollapse = type === "collapse-right-section"
        ? true
        : (type === "expand-right-section" ? false : !section.collapsed);
      setRightSectionCollapsed(screenId, section.id, shouldCollapse);
      return { snapshot: await snapshot() };
    }
    if (type === "append-digit") {
      uiState.numberBuffer = `${uiState.numberBuffer}${String(intent.digit || "")}`.slice(0, 3);
      return { snapshot: await snapshot() };
    }
    if (type === "clear-number-buffer") {
      uiState.numberBuffer = "";
      return { snapshot: await snapshot() };
    }
    if (type === "move-cursor") {
      const direction = String(intent.direction || "");
      if (uiState.focusedPane === "top") {
        const limit = Math.max(0, ((await snapshot()).topPane?.navigation?.chips?.length ?? 1) - 1);
        if (direction === "left" || direction === "up") uiState.topCursor = clamp(uiState.topCursor - 1, 0, limit);
        if (direction === "right" || direction === "down") uiState.topCursor = clamp(uiState.topCursor + 1, 0, limit);
        if (direction === "home") uiState.topCursor = 0;
        if (direction === "end") uiState.topCursor = limit;
        return { snapshot: await snapshot() };
      }
      const next = await snapshot();
      const isRight = uiState.focusedPane === "right";
      const limit = Math.max(
        0,
        (isRight ? rightPaneRows(next, uiState).length : next.leftPane.rows.length) - 1
      );
      const key = isRight ? "rightCursor" : "leftCursor";
      if (direction === "up") uiState[key] = clamp(uiState[key] - 1, 0, limit);
      if (direction === "down") uiState[key] = clamp(uiState[key] + 1, 0, limit);
      if (direction === "home") uiState[key] = 0;
      if (direction === "end") uiState[key] = limit;
      if (direction === "page-up") uiState[key] = clamp(uiState[key] - uiState.displaySettings.pageSize, 0, limit);
      if (direction === "page-down") uiState[key] = clamp(uiState[key] + uiState.displaySettings.pageSize, 0, limit);
      if (isRight) {
        const screenId = currentRightScreenId(next, uiState);
        const section = activeRightSection(next);
        if (section?.id) setRightSectionCursor(screenId, section.id, uiState.rightCursor);
      }
      return { snapshot: await snapshot() };
    }
    if (type === "activate-primary") {
      if (uiState.focusedPane === "top") return resolveTopPrimaryCommand();
      return uiState.focusedPane === "right"
        ? resolveRightPrimaryCommand()
        : resolveLeftPrimaryCommand();
    }
    if (type === "set-top-cursor") {
      uiState.topCursor = Math.max(0, Number(intent.index) || 0);
      return { snapshot: await snapshot() };
    }
    if (type === "set-left-cursor") {
      uiState.leftCursor = Math.max(0, Number(intent.index) || 0);
      return { snapshot: await snapshot() };
    }
    if (type === "set-right-cursor") {
      uiState.rightCursor = Math.max(0, Number(intent.index) || 0);
      const next = await snapshot();
      const screenId = currentRightScreenId(next, uiState);
      const section = activeRightSection(next);
      if (section?.id) setRightSectionCursor(screenId, section.id, uiState.rightCursor);
      return { snapshot: await snapshot() };
    }
    if (type === "escape") {
      if (uiState.focusedPane === "top") {
        uiState.focusedPane = uiState.lastNonTopPane || "left";
        return { snapshot: await snapshot() };
      }
      if (uiState.numberBuffer) {
        uiState.numberBuffer = "";
        return { snapshot: await snapshot() };
      }
      if (uiState.helpOpen) {
        uiState.helpOpen = false;
        return { snapshot: await snapshot() };
      }
      if (uiState.focusedPane === "right") {
        const next = await snapshot();
        const screenId = currentRightScreenId(next, uiState);
        const section = activeRightSection(next);
        const stateForScreen = ensureSessionRightScreenState(engine.session, screenId);
        if (section?.id && section.collapsed && stateForScreen.lastCollapsedSectionId === section.id) {
          setRightSectionCollapsed(screenId, section.id, false);
          return { snapshot: await snapshot() };
        }
      }
      if (uiState.activeScreenId !== "inspect" || uiState.inspectorTab !== "inspect") {
        uiState.rightScreenMode = "custom-screen";
        uiState.activeScreenId = "inspect";
        uiState.inspectorTab = "inspect";
        uiState.rightCursor = 0;
        return { snapshot: await snapshot() };
      }
      if (engine.session.resultView) return executeCommand("clear");
      if (engine.session.currentPath?.length) return executeCommand("close");
      if (engine.session.focusKind) return executeCommand("leave");
      return { snapshot: await snapshot() };
    }
    return { snapshot: await snapshot() };
  }

  return {
    state,
    engine,
    uiState,
    snapshot,
    executeCommand,
    dispatchIntent,
    autocomplete(line = "") {
      return {
        preview: buildTuiAutocompletePreview(state, engine.session, line),
        matches: buildTuiAutocompleteCandidates(state, engine.session)
          .filter(candidate => candidate.toLowerCase().startsWith(String(line).trimStart().toLowerCase()))
          .slice(0, 12)
      };
    },
    async updateDisplaySettings(patch = {}) {
      uiState.displaySettings = normalizeOperatorWorkbenchDisplaySettings({
        ...uiState.displaySettings,
        ...(patch && typeof patch === "object" ? patch : {})
      });
      applyDisplaySettingsToActiveResultView();
      uiState.rightCursor = 0;
      uiState.leftCursor = 0;
      const saved = await saveDisplaySettings(uiState.displaySettings);
      uiState.displaySettings = normalizeOperatorWorkbenchDisplaySettings(saved);
      return { snapshot: await snapshot() };
    }
  };
}

export async function createOperatorWorkbenchCore({
  args = [],
  cwd = process.cwd(),
  env = process.env,
  displaySettings = DEFAULT_OPERATOR_WORKBENCH_DISPLAY_SETTINGS,
  saveDisplaySettings = async settings => settings
} = {}) {
  const parsed = parseTuiArgs(args);
  const runtimeContext = await loadOperatorTuiRuntimeContext({
    appPath: parsed.appPath,
    worldHome: parsed.worldHome,
    runtimeProfile: parsed.runtimeProfile,
    runtimeProfileExplicit: parsed.runtimeProfileExplicit,
    runtimePluginIds: parsed.runtimePluginIds,
    cwd,
    env
  });
  const state = await buildOperatorTuiState(runtimeContext);
  const engine = createOperatorTuiEngine(state);
  return {
    ...createOperatorWorkbenchController({
      state,
      engine,
      displaySettings,
      saveDisplaySettings
    }),
    parsed,
    async close() {
      await runtimeContext.close?.();
    }
  };
}
