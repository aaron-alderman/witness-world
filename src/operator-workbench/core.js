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
    openOverlayIds: [],
    overlayStateById: {},
    readerStateBySurfaceId: {},
    helpOpen: false,
    contextMenuOpen: false,
    contextMenuContext: null,
    topCursor: 0,
    leftCursor: 0,
    rightCursor: 0,
    rightSectionIndex: 0,
    rightSectionCursorsByScreenId: {},
    collapsedSectionIdsByScreenId: {},
    viewportLayout: null,
    numberBuffer: "",
    lastOutput: "",
    lastStatus: "info",
    displaySettings: normalizeOperatorWorkbenchDisplaySettings(displaySettings)
  };
}

function orderedOverlayIds(ids = []) {
  return [...new Set(
    (Array.isArray(ids) ? ids : [])
      .map(id => String(id ?? "").trim())
      .filter(Boolean)
  )];
}

function syncOverlayCompatibilityFlags(uiState) {
  const overlayIds = orderedOverlayIds(uiState.openOverlayIds);
  uiState.openOverlayIds = overlayIds;
  uiState.helpOpen = overlayIds.includes("help_overlay");
  uiState.contextMenuOpen = overlayIds.includes("context_menu");
  if (!uiState.contextMenuOpen) uiState.contextMenuContext = null;
}

function closeOverlayId(uiState, overlayId) {
  uiState.openOverlayIds = orderedOverlayIds(uiState.openOverlayIds).filter(id => id !== overlayId);
  syncOverlayCompatibilityFlags(uiState);
}

function activeOverlayId(uiState) {
  return orderedOverlayIds(uiState.openOverlayIds).at(-1) ?? null;
}

function ensureOverlayUiState(uiState, overlayId) {
  if (!uiState.overlayStateById || typeof uiState.overlayStateById !== "object") {
    uiState.overlayStateById = {};
  }
  if (!uiState.overlayStateById[overlayId] || typeof uiState.overlayStateById[overlayId] !== "object") {
    uiState.overlayStateById[overlayId] = {};
  }
  return uiState.overlayStateById[overlayId];
}

function ensureReaderUiState(uiState, surfaceId) {
  if (!uiState.readerStateBySurfaceId || typeof uiState.readerStateBySurfaceId !== "object") {
    uiState.readerStateBySurfaceId = {};
  }
  if (!uiState.readerStateBySurfaceId[surfaceId] || typeof uiState.readerStateBySurfaceId[surfaceId] !== "object") {
    uiState.readerStateBySurfaceId[surfaceId] = {};
  }
  return uiState.readerStateBySurfaceId[surfaceId];
}

function derivedOverlayInteraction(overlayId, overlayModel = null) {
  if (overlayModel?.interaction && typeof overlayModel.interaction === "object") {
    return overlayModel.interaction;
  }
  const kind = String(overlayModel?.kind ?? (overlayId === "context_menu" ? "menu" : "doc_view"));
  if (kind === "menu") {
    const items = arrayWrap(overlayModel?.items);
    return {
      family: "menu",
      cursorMode: items.length ? "items" : "none",
      activationMode: items.length ? "item" : "none",
      scrollMode: "none"
    };
  }
  return {
    family: "doc_view",
    cursorMode: "none",
    activationMode: "none",
    scrollMode: "xy"
  };
}

function derivedOverlayPolicy(overlayId, overlayModel = null) {
  if (overlayModel?.policy && typeof overlayModel.policy === "object") {
    return overlayModel.policy;
  }
  if (Array.isArray(overlayModel?.closeIdsOnOpen)) {
    return {
      closeIdsOnOpen: overlayModel.closeIdsOnOpen
        .map(id => String(id ?? "").trim())
        .filter(Boolean)
    };
  }
  return {
    closeIdsOnOpen: []
  };
}

function overlayModelById(snapshot, overlayId) {
  if (!overlayId) return null;
  const overlays = Array.isArray(snapshot?.overlays) ? snapshot.overlays : [];
  const exact = overlays.find(overlay => overlay?.id === overlayId) ?? null;
  if (exact) {
    if (!exact.interaction) exact.interaction = derivedOverlayInteraction(overlayId, exact);
    if (!exact.policy) exact.policy = derivedOverlayPolicy(overlayId, exact);
    return exact;
  }
  if (overlayId === "context_menu" && snapshot?.contextMenu) {
    return {
      ...snapshot.contextMenu,
      id: "context_menu",
      kind: "menu",
      interaction: derivedOverlayInteraction("context_menu", snapshot.contextMenu),
      policy: derivedOverlayPolicy("context_menu", snapshot.contextMenu)
    };
  }
  if (overlayId === "help_overlay" && snapshot?.helpOverlay) {
    return {
      ...snapshot.helpOverlay,
      id: "help_overlay",
      kind: "doc_view",
      interaction: derivedOverlayInteraction("help_overlay", snapshot.helpOverlay),
      policy: derivedOverlayPolicy("help_overlay", snapshot.helpOverlay)
    };
  }
  return null;
}

function overlayInteractionById(snapshot, overlayId) {
  return overlayModelById(snapshot, overlayId)?.interaction ?? null;
}

function overlayItemsById(snapshot, overlayId) {
  return arrayWrap(overlayModelById(snapshot, overlayId)?.items);
}

function overlayCloseIdsForOpen(snapshot, overlayId) {
  return arrayWrap(overlayModelById(snapshot, overlayId)?.policy?.closeIdsOnOpen)
    .map(id => String(id ?? "").trim())
    .filter(Boolean);
}

function openOverlayId(uiState, overlayId, {
  closeIds = []
} = {}) {
  const closeSet = new Set(arrayWrap(closeIds).map(id => String(id ?? "").trim()).filter(Boolean));
  const nextOverlayIds = orderedOverlayIds(uiState.openOverlayIds)
    .filter(id => id !== overlayId && !closeSet.has(id));
  nextOverlayIds.push(overlayId);
  uiState.openOverlayIds = nextOverlayIds;
  syncOverlayCompatibilityFlags(uiState);
}

function toggleOverlayId(uiState, overlayId, options = {}) {
  if (orderedOverlayIds(uiState.openOverlayIds).includes(overlayId)) {
    closeOverlayId(uiState, overlayId);
    return;
  }
  openOverlayId(uiState, overlayId, options);
}

function focusOverlayId(uiState, overlayId) {
  const nextOverlayIds = orderedOverlayIds(uiState.openOverlayIds).filter(id => id !== overlayId);
  if (!nextOverlayIds.length && !orderedOverlayIds(uiState.openOverlayIds).includes(overlayId)) {
    return false;
  }
  nextOverlayIds.push(overlayId);
  uiState.openOverlayIds = nextOverlayIds;
  syncOverlayCompatibilityFlags(uiState);
  return true;
}

function moveOverlayFocus(uiState, direction = "next") {
  const overlayIds = orderedOverlayIds(uiState.openOverlayIds);
  if (!overlayIds.length) return false;
  if (overlayIds.length === 1) return true;
  const activeId = activeOverlayId(uiState) ?? overlayIds.at(-1);
  const currentIndex = Math.max(0, overlayIds.indexOf(activeId));
  const delta = direction === "prev" ? -1 : 1;
  const nextIndex = (currentIndex + delta + overlayIds.length) % overlayIds.length;
  const nextId = overlayIds[nextIndex];
  return focusOverlayId(uiState, nextId);
}

function arrayWrap(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeViewportLayoutPatch(layout = {}, currentLayout = {}, viewport = {}) {
  const viewportHeight = Math.max(12, Number(viewport?.height) || 30);
  const currentTop = Number(currentLayout?.top ?? viewport?.top ?? 3) || 3;
  const currentBottom = Number(currentLayout?.bottom ?? viewport?.bottom ?? 4) || 4;
  const nextLeftWeight = clamp(
    Number(layout?.leftWeight ?? currentLayout?.leftWeight ?? viewport?.leftWeight ?? 28) || 28,
    15,
    85
  );
  const proposedTop = Number(layout?.top ?? currentTop) || currentTop;
  const proposedBottom = Number(layout?.bottom ?? currentBottom) || currentBottom;
  const bottom = clamp(proposedBottom, 3, Math.max(3, viewportHeight - 9));
  const top = clamp(proposedTop, 3, Math.max(3, viewportHeight - bottom - 6));
  return {
    top,
    bottom,
    leftWeight: nextLeftWeight,
    rightWeight: 100 - nextLeftWeight
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
  syncOverlayCompatibilityFlags(uiState);

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
    if (type === "activate-screen-shortcut") {
      const shortcut = String(intent.shortcut || "").trim().toUpperCase();
      if (!shortcut) return { snapshot: await snapshot() };
      const next = await snapshot();
      const target = Array.isArray(next?.screens?.shortcuts)
        ? next.screens.shortcuts.find(row => String(row?.shortcut || "").toUpperCase() === shortcut)
        : null;
      if (!target?.screenId) {
        return {
          result: { output: `unknown screen shortcut: ${shortcut}`, status: "error" },
          snapshot: next
        };
      }
      return executeCommand(`screen ${target.screenId}`);
    }
    if (type === "set-focused-pane") {
      uiState.focusedPane = intent.pane || "left";
      if (uiState.focusedPane !== "top") uiState.lastNonTopPane = uiState.focusedPane;
      return { snapshot: await snapshot() };
    }
    if (type === "toggle-help") {
      const next = await snapshot();
      toggleOverlayId(uiState, "help_overlay", { closeIds: overlayCloseIdsForOpen(next, "help_overlay") });
      return { snapshot: await snapshot() };
    }
    if (type === "open-context-menu") {
      const next = await snapshot();
      uiState.contextMenuContext = intent.context && typeof intent.context === "object"
        ? structuredClone(intent.context)
        : null;
      openOverlayId(uiState, "context_menu", { closeIds: overlayCloseIdsForOpen(next, "context_menu") });
      return { snapshot: await snapshot() };
    }
    if (type === "close-context-menu") {
      closeOverlayId(uiState, "context_menu");
      return { snapshot: await snapshot() };
    }
    if (type === "open-overlay") {
      const overlayId = String(intent.overlayId || "").trim();
      if (!overlayId) return { snapshot: await snapshot() };
      const next = await snapshot();
      const closeIds = overlayCloseIdsForOpen(next, overlayId);
      if (overlayId === "context_menu") {
        uiState.contextMenuContext = intent.context && typeof intent.context === "object"
          ? structuredClone(intent.context)
          : uiState.contextMenuContext;
      }
      openOverlayId(uiState, overlayId, { closeIds });
      return { snapshot: await snapshot() };
    }
    if (type === "close-overlay") {
      const overlayId = String(intent.overlayId || "").trim();
      if (!overlayId) return { snapshot: await snapshot() };
      closeOverlayId(uiState, overlayId);
      return { snapshot: await snapshot() };
    }
    if (type === "toggle-overlay") {
      const overlayId = String(intent.overlayId || "").trim();
      if (!overlayId) return { snapshot: await snapshot() };
      const next = await snapshot();
      const closeIds = overlayCloseIdsForOpen(next, overlayId);
      if (overlayId === "context_menu" && !uiState.contextMenuOpen) {
        uiState.contextMenuContext = intent.context && typeof intent.context === "object"
          ? structuredClone(intent.context)
          : uiState.contextMenuContext;
      }
      toggleOverlayId(uiState, overlayId, { closeIds });
      return { snapshot: await snapshot() };
    }
    if (type === "set-active-overlay") {
      const overlayId = String(intent.overlayId || "").trim();
      if (!overlayId) return { snapshot: await snapshot() };
      focusOverlayId(uiState, overlayId);
      return { snapshot: await snapshot() };
    }
    if (type === "move-active-overlay-focus") {
      moveOverlayFocus(uiState, String(intent.direction || "next"));
      return { snapshot: await snapshot() };
    }
    if (type === "activate-context-menu-item") {
      const next = await snapshot();
      const items = Array.isArray(next?.contextMenu?.items) ? next.contextMenu.items : [];
      let item = null;
      if (intent.itemId) item = items.find(entry => entry?.id === intent.itemId) ?? null;
      else if (intent.index !== undefined) item = items[Number(intent.index) || 0] ?? null;
      if (!item) {
        return {
          result: { output: "context menu item not found.", status: "error" },
          snapshot: next
        };
      }
      if (item.enabled === false) {
        return {
          result: { output: `${item.label || "menu item"} is disabled.`, status: "error" },
          snapshot: next
        };
      }
      closeOverlayId(uiState, "context_menu");
      const action = item.action && typeof item.action === "object" ? item.action : null;
      if (action?.kind === "command" && action.command) {
        return executeCommand(action.command);
      }
      if (action?.kind === "hook") {
        return afterResult({
          output: `menu action requested: ${action.hook}${action.subject ? ` :: ${action.subject}` : ""}`,
          status: "info"
        }, { command: `menu ${item.id || action.hook}` });
      }
      return afterResult({
        output: `menu action activated: ${item.label || item.id || "item"}`,
        status: "info"
      }, { command: `menu ${item.id || "item"}` });
    }
    if (type === "move-active-overlay-cursor") {
      const next = await snapshot();
      const overlayId = activeOverlayId(uiState);
      if (!overlayId) return { snapshot: next };
      const interaction = overlayInteractionById(next, overlayId);
      if (interaction?.cursorMode !== "items") {
        return {
          result: { output: `${overlayId} has no cursor.`, status: "error" },
          snapshot: next
        };
      }
      const items = overlayItemsById(next, overlayId);
      if (!items.length) return { snapshot: next };
      const overlayState = ensureOverlayUiState(uiState, overlayId);
      const limit = Math.max(0, items.length - 1);
      const direction = String(intent.direction || "");
      let index = clamp(Number(overlayState.activeItemIndex ?? next.contextMenu?.activeItemIndex ?? 0) || 0, 0, limit);
      if (direction === "up") index = clamp(index - 1, 0, limit);
      if (direction === "down") index = clamp(index + 1, 0, limit);
      if (direction === "home") index = 0;
      if (direction === "end") index = limit;
      overlayState.activeItemIndex = index;
      return { snapshot: await snapshot() };
    }
    if (type === "move-active-overlay-scroll") {
      const next = await snapshot();
      const overlayId = activeOverlayId(uiState);
      if (!overlayId) return { snapshot: next };
      const overlayModel = overlayModelById(next, overlayId);
      if (!overlayModel) return { snapshot: next };
      const interaction = overlayModel.interaction ?? null;
      if (interaction?.scrollMode === "none") {
        return {
          result: { output: `${overlayId} has no scroll.`, status: "error" },
          snapshot: next
        };
      }
      const overlayState = ensureOverlayUiState(uiState, overlayId);
      const lines = Array.isArray(overlayModel.lines) ? overlayModel.lines.map(line => String(line ?? "")) : [];
      const contentWidth = Math.max(0, Number(overlayModel.contentWidth ?? 0) || 0);
      const lineCount = Math.max(0, Number(overlayModel.lineCount ?? 0) || 0);
      const contentHeight = Math.max(0, Number(overlayModel.contentHeight ?? 0) || 0);
      const limitX = Math.max(0, lines.reduce((maxWidth, line) => Math.max(maxWidth, line.length), 0) - contentWidth);
      const limitY = Math.max(0, lineCount - contentHeight);
      const direction = String(intent.direction || "");
      let scrollX = clamp(Number(overlayState.scrollX ?? overlayModel.scrollX ?? 0) || 0, 0, limitX);
      let scrollY = clamp(Number(overlayState.scrollY ?? overlayModel.scrollY ?? 0) || 0, 0, limitY);
      if (direction === "left") scrollX = clamp(scrollX - 1, 0, limitX);
      if (direction === "right") scrollX = clamp(scrollX + 1, 0, limitX);
      if (direction === "up") scrollY = clamp(scrollY - 1, 0, limitY);
      if (direction === "down") scrollY = clamp(scrollY + 1, 0, limitY);
      if (direction === "page-up") scrollY = clamp(scrollY - Math.max(1, contentHeight), 0, limitY);
      if (direction === "page-down") scrollY = clamp(scrollY + Math.max(1, contentHeight), 0, limitY);
      if (direction === "home") scrollY = 0;
      if (direction === "end") scrollY = limitY;
      overlayState.scrollX = scrollX;
      overlayState.scrollY = scrollY;
      return { snapshot: await snapshot() };
    }
    if (type === "move-reader-scroll") {
      const next = await snapshot();
      const surfaceId = String(intent.surfaceId || next.rightPane?.surfaceId || "").trim();
      if (!surfaceId) return { snapshot: next };
      const readerState = ensureReaderUiState(uiState, surfaceId);
      let x = Math.max(0, Number(readerState.x ?? next.rightPane?.readerScroll?.x ?? 0) || 0);
      let y = Math.max(0, Number(readerState.y ?? next.rightPane?.readerScroll?.y ?? 0) || 0);
      if (intent.setX !== undefined) x = Math.max(0, Number(intent.setX) || 0);
      else x = Math.max(0, x + (Number(intent.deltaX ?? 0) || 0));
      if (intent.setY !== undefined) y = Math.max(0, Number(intent.setY) || 0);
      else y = Math.max(0, y + (Number(intent.deltaY ?? 0) || 0));
      readerState.x = x;
      readerState.y = y;
      return { snapshot: await snapshot() };
    }
    if (type === "activate-active-overlay") {
      const next = await snapshot();
      const overlayId = activeOverlayId(uiState);
      if (!overlayId) return { snapshot: next };
      const interaction = overlayInteractionById(next, overlayId);
      if (interaction?.activationMode === "item") {
        const overlayState = ensureOverlayUiState(uiState, overlayId);
        const items = overlayItemsById(next, overlayId);
        const index = clamp(
          Number(overlayState.activeItemIndex ?? overlayModelById(next, overlayId)?.activeItemIndex ?? 0) || 0,
          0,
          Math.max(0, items.length - 1)
        );
        return dispatchIntent({ type: "activate-context-menu-item", index });
      }
      return {
        result: { output: `${overlayId} has no primary action.`, status: "error" },
        snapshot: next
      };
    }
    if (type === "set-viewport-layout") {
      const next = await snapshot();
      const viewport = next.viewport ?? {};
      const currentLayout = viewport.layout ?? {};
      uiState.viewportLayout = normalizeViewportLayoutPatch(intent.layout, currentLayout, viewport);
      if (intent.persistDisplaySettings) {
        uiState.displaySettings = normalizeOperatorWorkbenchDisplaySettings({
          ...uiState.displaySettings,
          paneSplit: clamp((uiState.viewportLayout.leftWeight || 28) / 100, 0.15, 0.85),
          viewportTop: uiState.viewportLayout.top,
          viewportBottom: uiState.viewportLayout.bottom
        });
        const saved = await saveDisplaySettings(uiState.displaySettings);
        uiState.displaySettings = normalizeOperatorWorkbenchDisplaySettings(saved);
      }
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
      if (uiState.contextMenuOpen) {
        closeOverlayId(uiState, "context_menu");
        return { snapshot: await snapshot() };
      }
      if (uiState.focusedPane === "top") {
        uiState.focusedPane = uiState.lastNonTopPane || "left";
        return { snapshot: await snapshot() };
      }
      if (uiState.numberBuffer) {
      uiState.numberBuffer = "";
      return { snapshot: await snapshot() };
    }
      const topOverlayId = orderedOverlayIds(uiState.openOverlayIds).at(-1) ?? null;
      if (topOverlayId && topOverlayId !== "help_overlay" && topOverlayId !== "context_menu") {
        closeOverlayId(uiState, topOverlayId);
        return { snapshot: await snapshot() };
      }
      if (uiState.helpOpen) {
        closeOverlayId(uiState, "help_overlay");
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
      const currentSnapshot = await snapshot();
      const viewport = currentSnapshot.viewport ?? {};
      uiState.displaySettings = normalizeOperatorWorkbenchDisplaySettings({
        ...uiState.displaySettings,
        ...(patch && typeof patch === "object" ? patch : {})
      });
      if (patch && typeof patch === "object" && patch.paneSplit !== undefined) {
        const leftWeight = clamp(Math.round(Number(uiState.displaySettings.paneSplit || 0.42) * 100), 15, 85);
        uiState.viewportLayout = {
          ...(uiState.viewportLayout && typeof uiState.viewportLayout === "object" ? uiState.viewportLayout : {}),
          leftWeight,
          rightWeight: 100 - leftWeight
        };
      }
      if (patch && typeof patch === "object" && (patch.viewportTop !== undefined || patch.viewportBottom !== undefined)) {
        uiState.viewportLayout = normalizeViewportLayoutPatch({
          top: patch.viewportTop,
          bottom: patch.viewportBottom,
          leftWeight: uiState.viewportLayout?.leftWeight
        }, uiState.viewportLayout ?? (viewport.layout ?? {}), viewport);
      }
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
