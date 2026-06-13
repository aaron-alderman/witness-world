export function renderBootstrapCapabilityBaseSelectViewFactory() {
  return String.raw`
    const buildBootstrapCapabilityBaseSelectView = ${buildBootstrapCapabilityBaseSelectView.toString()};
    const applyBootstrapCapabilityBaseSelectView = ${applyBootstrapCapabilityBaseSelectView.toString()};
  `;
}

export function buildBootstrapCapabilityBaseSelectView({
  readSelectValue = () => "",
  contextRows = [],
  capabilityCatalog = [],
  capabilityTargetKinds = []
} = {}) {
  const firstMatchingValue = (options, currentValue) => (
    (options || []).some(option => option.value === currentValue) ? currentValue : (options?.[0]?.value || "")
  );
  const capabilityCatalogOptionLabel = (row = {}) => row.id + (row.version ? " [" + row.version + "]" : "");
  const simpleOption = value => ({ value, label: value });
  const contextOptions = (contextRows || []).map(row => ({
    value: row.id,
    label: row.id
  }));
  const capabilityOptions = (capabilityCatalog || []).map(row => ({
    value: row.id,
    label: capabilityCatalogOptionLabel(row)
  }));
  const targetKindOptions = (capabilityTargetKinds || []).map(simpleOption);
  return {
    createContext: {
      contextOptions,
      selectedContextId: firstMatchingValue(contextOptions, readSelectValue("capability-context"))
    },
    installCapability: {
      capabilityOptions,
      selectedCapabilityId: firstMatchingValue(capabilityOptions, readSelectValue("capability-install-capability"))
    },
    removeCapability: {
      capabilityOptions,
      selectedCapabilityId: firstMatchingValue(capabilityOptions, readSelectValue("capability-remove-capability"))
    },
    installKind: {
      targetKindOptions,
      selectedTargetKind: firstMatchingValue(targetKindOptions, readSelectValue("capability-install-kind"))
    },
    removeKind: {
      targetKindOptions,
      selectedTargetKind: firstMatchingValue(targetKindOptions, readSelectValue("capability-remove-kind"))
    }
  };
}

export function applyBootstrapCapabilityBaseSelectView({
  view = {},
  fillSelect = () => {},
  setSelectedValue = () => {}
} = {}) {
  fillSelect("capability-context", view.createContext?.contextOptions || [], row => row.value, row => row.label);
  setSelectedValue("capability-context", view.createContext?.selectedContextId);
  fillSelect("capability-install-capability", view.installCapability?.capabilityOptions || [], row => row.value, row => row.label, { includeBlank: false });
  setSelectedValue("capability-install-capability", view.installCapability?.selectedCapabilityId);
  fillSelect("capability-remove-capability", view.removeCapability?.capabilityOptions || [], row => row.value, row => row.label, { includeBlank: false });
  setSelectedValue("capability-remove-capability", view.removeCapability?.selectedCapabilityId);
  fillSelect("capability-install-kind", view.installKind?.targetKindOptions || [], row => row.value, row => row.label, { includeBlank: false });
  setSelectedValue("capability-install-kind", view.installKind?.selectedTargetKind);
  fillSelect("capability-remove-kind", view.removeKind?.targetKindOptions || [], row => row.value, row => row.label, { includeBlank: false });
  setSelectedValue("capability-remove-kind", view.removeKind?.selectedTargetKind);
}
