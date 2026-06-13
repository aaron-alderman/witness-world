export function renderSurfaceInspectorFormActionsFactory() {
  return String.raw`
    const readSurfaceInspectorWidgetPatch = ${readSurfaceInspectorWidgetPatch.toString()};
    const surfaceInspectorWidgetPatchChanged = ${surfaceInspectorWidgetPatchChanged.toString()};
    const submitSurfaceInspectorEditForm = ${submitSurfaceInspectorEditForm.toString()};
    const submitSurfaceInspectorProposalForm = ${submitSurfaceInspectorProposalForm.toString()};
    const submitSurfaceInspectorVersionProposalForm = ${submitSurfaceInspectorVersionProposalForm.toString()};
    const bindSurfaceInspectorFormActions = ${bindSurfaceInspectorFormActions.toString()};
  `;
}

export function readSurfaceInspectorWidgetPatch({
  form = null,
  createFormData = value => new FormData(value),
  inputCtor = globalThis.HTMLInputElement
} = {}) {
  const formData = createFormData(form);
  const hiddenField = form?.querySelector?.('[name="hidden"]');
  return {
    text: String(formData.get("text") ?? ""),
    title: String(formData.get("title") ?? ""),
    class: String(formData.get("class") ?? ""),
    hidden: inputCtor && hiddenField instanceof inputCtor ? hiddenField.checked : false
  };
}

export function surfaceInspectorWidgetPatchChanged({ current = null, patch = {} } = {}) {
  const currentProps = current?.props || {};
  return (
    (currentProps.text ?? "") !== patch.text
    || (currentProps.title ?? "") !== patch.title
    || (currentProps.class ?? "") !== patch.class
    || Boolean(currentProps.hidden === true) !== patch.hidden
  );
}

export async function submitSurfaceInspectorEditForm({
  form = null,
  selectedSurfaceWidgetId = () => "",
  selectedSurfaceWidgetAuthored = () => null,
  selectedSurfaceWidgetEditAuthority = () => ({ ok: false, reason: "" }),
  setSurfaceInspectorStatus = () => {},
  updateSurfaceInspectorUi = () => {},
  patchSurfaceWidget = async () => ({ ok: false, body: { error: "Widget save failed." } }),
  invalidateSurfaceInspectorGraph = () => {},
  invalidateSurfaceInspectorWidgets = () => {},
  refreshProjection = async () => {},
  selectSurfaceInspectorWidget = async () => {},
  readWidgetPatch = options => readSurfaceInspectorWidgetPatch(options),
  createFormData = value => new FormData(value),
  inputCtor = globalThis.HTMLInputElement
} = {}) {
  const widgetId = form?.getAttribute?.("data-widget-id") || selectedSurfaceWidgetId();
  if (!widgetId) return false;
  const current = selectedSurfaceWidgetAuthored();
  if (!current) {
    setSurfaceInspectorStatus("Authored widget state is not available for editing.", "error");
    updateSurfaceInspectorUi();
    return false;
  }
  const authority = selectedSurfaceWidgetEditAuthority();
  if (!authority?.ok) {
    setSurfaceInspectorStatus(authority?.reason || "This widget is read-only right now.", "error");
    updateSurfaceInspectorUi();
    return false;
  }
  const patch = readWidgetPatch({ form, createFormData, inputCtor });
  if (!surfaceInspectorWidgetPatchChanged({ current, patch })) {
    setSurfaceInspectorStatus("No widget changes to save.", "ok");
    updateSurfaceInspectorUi();
    return false;
  }
  setSurfaceInspectorStatus("Saving " + widgetId + "...", "ok");
  updateSurfaceInspectorUi();
  const result = await patchSurfaceWidget({ id: widgetId, patch });
  if (!result?.ok) {
    setSurfaceInspectorStatus(result?.body?.error || "Widget save failed.", "error");
    updateSurfaceInspectorUi();
    return false;
  }
  invalidateSurfaceInspectorGraph();
  invalidateSurfaceInspectorWidgets();
  await refreshProjection();
  await selectSurfaceInspectorWidget(widgetId, {
    refreshGraph: true,
    statusMessage: "Saved " + widgetId + "."
  });
  return true;
}

export async function submitSurfaceInspectorProposalForm({
  form = null,
  selectedSurfaceWidgetId = () => "",
  selectedSurfaceWidgetAuthored = () => null,
  selectedSurfaceWidgetEditAuthority = () => ({ ok: false, reason: "" }),
  currentActor = () => "",
  setSurfaceInspectorStatus = () => {},
  updateSurfaceInspectorUi = () => {},
  proposeSurfaceWidgetPatch = async () => ({ ok: false, body: { error: "Proposal creation failed." } }),
  readWidgetPatch = options => readSurfaceInspectorWidgetPatch(options),
  createFormData = value => new FormData(value),
  inputCtor = globalThis.HTMLInputElement
} = {}) {
  const widgetId = form?.getAttribute?.("data-widget-id") || selectedSurfaceWidgetId();
  if (!widgetId) return false;
  const current = selectedSurfaceWidgetAuthored();
  if (!current) {
    setSurfaceInspectorStatus("Authored widget state is not available for proposal.", "error");
    updateSurfaceInspectorUi();
    return false;
  }
  const authority = selectedSurfaceWidgetEditAuthority();
  if (authority?.ok) {
    setSurfaceInspectorStatus("You already have direct authority here. Save the widget instead of proposing it.", "ok");
    updateSurfaceInspectorUi();
    return false;
  }
  if (!currentActor()) {
    setSurfaceInspectorStatus(authority?.reason || "Sign in to propose changes.", "error");
    updateSurfaceInspectorUi();
    return false;
  }
  const patch = readWidgetPatch({ form, createFormData, inputCtor });
  if (!surfaceInspectorWidgetPatchChanged({ current, patch })) {
    setSurfaceInspectorStatus("No widget changes to propose.", "ok");
    updateSurfaceInspectorUi();
    return false;
  }
  const formData = createFormData(form);
  const reason = String(formData.get("reason") ?? "");
  setSurfaceInspectorStatus("Creating proposal for " + widgetId + "...", "ok");
  updateSurfaceInspectorUi();
  const result = await proposeSurfaceWidgetPatch({ id: widgetId, patch, reason });
  if (!result?.ok) {
    setSurfaceInspectorStatus(result?.body?.error || "Proposal creation failed.", "error");
    updateSurfaceInspectorUi();
    return false;
  }
  setSurfaceInspectorStatus("Proposed " + widgetId + " as " + (result?.body?.proposal?.id || result?.proposalId) + ".", "ok");
  updateSurfaceInspectorUi();
  return true;
}

export async function submitSurfaceInspectorVersionProposalForm({
  form = null,
  selectedSurfaceWidgetEditAuthority = () => ({ ok: false, reason: "" }),
  currentActor = () => "",
  setSurfaceInspectorStatus = () => {},
  updateSurfaceInspectorUi = () => {},
  proposeSurfaceWidgetVersionAction = async () => ({ ok: false, body: { error: "Version proposal creation failed." } }),
  createFormData = value => new FormData(value)
} = {}) {
  const processName = form?.getAttribute?.("data-surface-inspector-proposal-process") || "";
  const soul = form?.getAttribute?.("data-surface-inspector-proposal-soul") || "";
  const version = form?.getAttribute?.("data-surface-inspector-proposal-version") || "";
  if (!processName || !soul) return false;
  const authority = selectedSurfaceWidgetEditAuthority();
  if (authority?.ok) {
    setSurfaceInspectorStatus("You already have direct authority here. Apply the version change directly instead of proposing it.", "ok");
    updateSurfaceInspectorUi();
    return false;
  }
  if (!currentActor()) {
    setSurfaceInspectorStatus(authority?.reason || "Sign in to propose version changes.", "error");
    updateSurfaceInspectorUi();
    return false;
  }
  const formData = createFormData(form);
  const reason = String(formData.get("reason") ?? "");
  const actionLabel = processName === "widgetVersion.rollback"
    ? "rollback " + soul
    : "activate " + version;
  setSurfaceInspectorStatus("Creating proposal to " + actionLabel + "...", "ok");
  updateSurfaceInspectorUi();
  const result = await proposeSurfaceWidgetVersionAction({ targetProcess: processName, soul, version, reason });
  if (!result?.ok) {
    setSurfaceInspectorStatus(result?.body?.error || "Version proposal creation failed.", "error");
    updateSurfaceInspectorUi();
    return false;
  }
  setSurfaceInspectorStatus("Proposed " + actionLabel + " as " + (result?.body?.proposal?.id || result?.proposalId) + ".", "ok");
  updateSurfaceInspectorUi();
  return true;
}

export function bindSurfaceInspectorFormActions({
  overlay = null,
  selectedSurfaceWidgetId = () => "",
  selectedSurfaceWidgetAuthored = () => null,
  selectedSurfaceWidgetEditAuthority = () => ({ ok: false, reason: "" }),
  currentActor = () => "",
  setSurfaceInspectorStatus = () => {},
  updateSurfaceInspectorUi = () => {},
  patchSurfaceWidget = async () => ({ ok: false }),
  invalidateSurfaceInspectorGraph = () => {},
  invalidateSurfaceInspectorWidgets = () => {},
  refreshProjection = async () => {},
  selectSurfaceInspectorWidget = async () => {},
  proposeSurfaceWidgetPatch = async () => ({ ok: false }),
  proposeSurfaceWidgetVersionAction = async () => ({ ok: false }),
  readWidgetPatch = options => readSurfaceInspectorWidgetPatch(options),
  createFormData = value => new FormData(value),
  inputCtor = globalThis.HTMLInputElement
} = {}) {
  overlay?.querySelectorAll?.("[data-surface-inspector-edit-form]")?.forEach?.(node => {
    node.addEventListener?.("submit", async event => {
      event.preventDefault?.();
      await submitSurfaceInspectorEditForm({
        form: node,
        selectedSurfaceWidgetId,
        selectedSurfaceWidgetAuthored,
        selectedSurfaceWidgetEditAuthority,
        setSurfaceInspectorStatus,
        updateSurfaceInspectorUi,
        patchSurfaceWidget,
        invalidateSurfaceInspectorGraph,
        invalidateSurfaceInspectorWidgets,
        refreshProjection,
        selectSurfaceInspectorWidget,
        readWidgetPatch,
        createFormData,
        inputCtor
      });
    });
  });
  overlay?.querySelectorAll?.("[data-surface-inspector-proposal-form]")?.forEach?.(node => {
    node.addEventListener?.("submit", async event => {
      event.preventDefault?.();
      await submitSurfaceInspectorProposalForm({
        form: node,
        selectedSurfaceWidgetId,
        selectedSurfaceWidgetAuthored,
        selectedSurfaceWidgetEditAuthority,
        currentActor,
        setSurfaceInspectorStatus,
        updateSurfaceInspectorUi,
        proposeSurfaceWidgetPatch,
        readWidgetPatch,
        createFormData
      });
    });
  });
  overlay?.querySelectorAll?.("[data-surface-inspector-version-proposal-form]")?.forEach?.(node => {
    node.addEventListener?.("submit", async event => {
      event.preventDefault?.();
      await submitSurfaceInspectorVersionProposalForm({
        form: node,
        selectedSurfaceWidgetEditAuthority,
        currentActor,
        setSurfaceInspectorStatus,
        updateSurfaceInspectorUi,
        proposeSurfaceWidgetVersionAction,
        createFormData
      });
    });
  });
}
