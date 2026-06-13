export function renderBootstrapScopedControlsViewFactory() {
  return String.raw`
    const buildScopedContextSelectView = ${buildScopedContextSelectView.toString()};
    const buildContextBindingTargetView = ${buildContextBindingTargetView.toString()};
    const buildContextExportTargetView = ${buildContextExportTargetView.toString()};
    const buildContextImportExportView = ${buildContextImportExportView.toString()};
    const buildStewardshipTargetView = ${buildStewardshipTargetView.toString()};
    const buildBootstrapScopedControlsView = ${buildBootstrapScopedControlsView.toString()};
    const applyBootstrapScopedControlsView = ${applyBootstrapScopedControlsView.toString()};
  `;
}

export function buildScopedContextSelectView({
  contextId = "",
  contextRows = []
} = {}) {
  const contextOptions = (contextRows || []).map(row => ({
    value: row.id,
    label: row.id
  }));
  const selectedContextId = contextOptions.some(row => row.value === contextId)
    ? contextId
    : (contextOptions[0]?.value || "");
  return {
    contextOptions,
    selectedContextId
  };
}

export function buildContextBindingTargetView({
  contextId = "",
  targetId = "",
  contextBindableTargets = () => []
} = {}) {
  const targetOptions = (contextId ? contextBindableTargets(contextId) : [])
    .map(row => ({
      value: row.id,
      label: row.id + (row.context ? " @" + row.context : "")
    }));
  const selectedTargetId = targetOptions.some(row => row.value === targetId)
    ? targetId
    : (targetOptions[0]?.value || "");
  return {
    targetOptions,
    selectedTargetId,
    submitDisabled: !selectedTargetId
  };
}

export function buildContextExportTargetView({
  contextId = "",
  targetId = "",
  contextScopeRows = () => []
} = {}) {
  const targetOptions = (contextId ? contextScopeRows(contextId, "local") : [])
    .map(row => ({
      value: row.target,
      label: row.name + " -> " + row.target
    }));
  const selectedTargetId = targetOptions.some(row => row.value === targetId)
    ? targetId
    : (targetOptions[0]?.value || "");
  return {
    targetOptions,
    selectedTargetId,
    submitDisabled: !selectedTargetId
  };
}

export function buildContextImportExportView({
  sourceContextId = "",
  exportName = "",
  contextExportRows = () => []
} = {}) {
  const exportOptions = (sourceContextId ? contextExportRows(sourceContextId) : [])
    .map(row => ({
      value: row.name,
      label: row.name + " -> " + row.target
    }));
  const selectedExportName = exportOptions.some(row => row.value === exportName)
    ? exportName
    : (exportOptions[0]?.value || "");
  return {
    exportOptions,
    selectedExportName,
    submitDisabled: !selectedExportName
  };
}

export function buildStewardshipTargetView({
  targetKind = "",
  targetId = "",
  stewardshipTargetKinds = [],
  stewardshipTargetsFor = () => []
} = {}) {
  const kindOptions = (stewardshipTargetKinds || []).map(value => ({ value, label: value }));
  const selectedTargetKind = kindOptions.some(row => row.value === targetKind)
    ? targetKind
    : (kindOptions[0]?.value || "");
  const targetOptions = stewardshipTargetsFor(selectedTargetKind)
    .map(row => ({
      value: row.id,
      label: row.id + (row.context ? " @" + row.context : "")
    }));
  const selectedTargetId = targetOptions.some(row => row.value === targetId)
    ? targetId
    : (targetOptions[0]?.value || "");
  return {
    kindOptions,
    selectedTargetKind,
    targetOptions,
    selectedTargetId,
    submitDisabled: !selectedTargetId
  };
}

export function buildBootstrapScopedControlsView({
  readSelectValue = () => "",
  contextRows = [],
  contextBindableTargets = () => [],
  contextScopeRows = () => [],
  contextExportRows = () => [],
  stewardshipTargetKinds = [],
  stewardshipTargetsFor = () => []
} = {}) {
  const bindingCreateContext = buildScopedContextSelectView({
    contextId: readSelectValue("context-binding-context"),
    contextRows
  });
  const bindingRemoveContext = buildScopedContextSelectView({
    contextId: readSelectValue("context-binding-remove-context"),
    contextRows
  });
  const exportCreateContext = buildScopedContextSelectView({
    contextId: readSelectValue("context-export-context"),
    contextRows
  });
  const exportRemoveContext = buildScopedContextSelectView({
    contextId: readSelectValue("context-export-remove-context"),
    contextRows
  });
  const importCreateContext = buildScopedContextSelectView({
    contextId: readSelectValue("context-import-context"),
    contextRows
  });
  const importRemoveContext = buildScopedContextSelectView({
    contextId: readSelectValue("context-import-remove-context"),
    contextRows
  });
  const importCreateSourceContext = buildScopedContextSelectView({
    contextId: readSelectValue("context-import-source-context"),
    contextRows
  });
  const importRemoveSourceContext = buildScopedContextSelectView({
    contextId: readSelectValue("context-import-remove-source-context"),
    contextRows
  });
  return {
    bindingCreateContext,
    bindingRemoveContext,
    exportCreateContext,
    exportRemoveContext,
    importCreateContext,
    importRemoveContext,
    importCreateSourceContext,
    importRemoveSourceContext,
    bindingCreate: buildContextBindingTargetView({
      contextId: bindingCreateContext.selectedContextId,
      targetId: readSelectValue("context-binding-target"),
      contextBindableTargets
    }),
    bindingRemove: buildContextBindingTargetView({
      contextId: bindingRemoveContext.selectedContextId,
      targetId: readSelectValue("context-binding-remove-target"),
      contextBindableTargets
    }),
    exportCreate: buildContextExportTargetView({
      contextId: exportCreateContext.selectedContextId,
      targetId: readSelectValue("context-export-target"),
      contextScopeRows
    }),
    exportRemove: buildContextExportTargetView({
      contextId: exportRemoveContext.selectedContextId,
      targetId: readSelectValue("context-export-remove-target"),
      contextScopeRows
    }),
    importCreate: buildContextImportExportView({
      sourceContextId: importCreateSourceContext.selectedContextId,
      exportName: readSelectValue("context-import-export-name"),
      contextExportRows
    }),
    importRemove: buildContextImportExportView({
      sourceContextId: importRemoveSourceContext.selectedContextId,
      exportName: readSelectValue("context-import-remove-export-name"),
      contextExportRows
    }),
    stewardshipCreate: buildStewardshipTargetView({
      targetKind: readSelectValue("stewardship-target-kind"),
      targetId: readSelectValue("stewardship-target"),
      stewardshipTargetKinds,
      stewardshipTargetsFor
    }),
    stewardshipRemove: buildStewardshipTargetView({
      targetKind: readSelectValue("stewardship-remove-target-kind"),
      targetId: readSelectValue("stewardship-remove-target"),
      stewardshipTargetKinds,
      stewardshipTargetsFor
    })
  };
}

export function applyBootstrapScopedControlsView({
  view = {},
  editingDisabled = false,
  fillSelect = () => {},
  setSelectedValue = () => {},
  setSubmitDisabled = () => {}
} = {}) {
  fillSelect("context-binding-context", view.bindingCreateContext?.contextOptions || [], row => row.value, row => row.label, { includeBlank: false });
  setSelectedValue("context-binding-context", view.bindingCreateContext?.selectedContextId);
  fillSelect("context-binding-remove-context", view.bindingRemoveContext?.contextOptions || [], row => row.value, row => row.label, { includeBlank: false });
  setSelectedValue("context-binding-remove-context", view.bindingRemoveContext?.selectedContextId);
  fillSelect("context-export-context", view.exportCreateContext?.contextOptions || [], row => row.value, row => row.label, { includeBlank: false });
  setSelectedValue("context-export-context", view.exportCreateContext?.selectedContextId);
  fillSelect("context-export-remove-context", view.exportRemoveContext?.contextOptions || [], row => row.value, row => row.label, { includeBlank: false });
  setSelectedValue("context-export-remove-context", view.exportRemoveContext?.selectedContextId);
  fillSelect("context-import-context", view.importCreateContext?.contextOptions || [], row => row.value, row => row.label, { includeBlank: false });
  setSelectedValue("context-import-context", view.importCreateContext?.selectedContextId);
  fillSelect("context-import-remove-context", view.importRemoveContext?.contextOptions || [], row => row.value, row => row.label, { includeBlank: false });
  setSelectedValue("context-import-remove-context", view.importRemoveContext?.selectedContextId);
  fillSelect("context-import-source-context", view.importCreateSourceContext?.contextOptions || [], row => row.value, row => row.label, { includeBlank: false });
  setSelectedValue("context-import-source-context", view.importCreateSourceContext?.selectedContextId);
  fillSelect("context-import-remove-source-context", view.importRemoveSourceContext?.contextOptions || [], row => row.value, row => row.label, { includeBlank: false });
  setSelectedValue("context-import-remove-source-context", view.importRemoveSourceContext?.selectedContextId);
  fillSelect("context-binding-target", view.bindingCreate?.targetOptions || [], row => row.value, row => row.label, { includeBlank: false });
  setSelectedValue("context-binding-target", view.bindingCreate?.selectedTargetId);
  fillSelect("context-binding-remove-target", view.bindingRemove?.targetOptions || [], row => row.value, row => row.label, { includeBlank: false });
  setSelectedValue("context-binding-remove-target", view.bindingRemove?.selectedTargetId);
  fillSelect("context-export-target", view.exportCreate?.targetOptions || [], row => row.value, row => row.label, { includeBlank: false });
  setSelectedValue("context-export-target", view.exportCreate?.selectedTargetId);
  fillSelect("context-export-remove-target", view.exportRemove?.targetOptions || [], row => row.value, row => row.label, { includeBlank: false });
  setSelectedValue("context-export-remove-target", view.exportRemove?.selectedTargetId);
  fillSelect("context-import-export-name", view.importCreate?.exportOptions || [], row => row.value, row => row.label, { includeBlank: false });
  setSelectedValue("context-import-export-name", view.importCreate?.selectedExportName);
  fillSelect("context-import-remove-export-name", view.importRemove?.exportOptions || [], row => row.value, row => row.label, { includeBlank: false });
  setSelectedValue("context-import-remove-export-name", view.importRemove?.selectedExportName);
  fillSelect("stewardship-target-kind", view.stewardshipCreate?.kindOptions || [], row => row.value, row => row.label, { includeBlank: false });
  setSelectedValue("stewardship-target-kind", view.stewardshipCreate?.selectedTargetKind);
  fillSelect("stewardship-remove-target-kind", view.stewardshipRemove?.kindOptions || [], row => row.value, row => row.label, { includeBlank: false });
  setSelectedValue("stewardship-remove-target-kind", view.stewardshipRemove?.selectedTargetKind);
  fillSelect("stewardship-target", view.stewardshipCreate?.targetOptions || [], row => row.value, row => row.label, { includeBlank: false });
  setSelectedValue("stewardship-target", view.stewardshipCreate?.selectedTargetId);
  fillSelect("stewardship-remove-target", view.stewardshipRemove?.targetOptions || [], row => row.value, row => row.label, { includeBlank: false });
  setSelectedValue("stewardship-remove-target", view.stewardshipRemove?.selectedTargetId);
  setSubmitDisabled("context-binding-form", editingDisabled || Boolean(view.bindingCreate?.submitDisabled));
  setSubmitDisabled("context-binding-remove-form", editingDisabled || Boolean(view.bindingRemove?.submitDisabled));
  setSubmitDisabled("context-export-form", editingDisabled || Boolean(view.exportCreate?.submitDisabled));
  setSubmitDisabled("context-export-remove-form", editingDisabled || Boolean(view.exportRemove?.submitDisabled));
  setSubmitDisabled("context-import-form", editingDisabled || Boolean(view.importCreate?.submitDisabled));
  setSubmitDisabled("context-import-remove-form", editingDisabled || Boolean(view.importRemove?.submitDisabled));
  setSubmitDisabled("stewardship-form", editingDisabled || Boolean(view.stewardshipCreate?.submitDisabled));
  setSubmitDisabled("stewardship-remove-form", editingDisabled || Boolean(view.stewardshipRemove?.submitDisabled));
}
