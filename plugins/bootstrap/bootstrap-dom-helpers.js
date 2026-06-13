export function renderBootstrapDomHelpersFactory() {
  return String.raw`
    const createBootstrapDomHelpers = ${createBootstrapDomHelpers.toString()};
  `;
}

export function createBootstrapDomHelpers({ document } = {}) {
  const byId = id => document?.getElementById?.(id) || null;
  const setStatus = (id, text) => {
    const el = byId(id);
    if (el) el.textContent = text || "";
  };
  const formField = (form, name) => form?.elements?.namedItem(name) || form?.querySelector?.('[name="' + CSS.escape(name) + '"]') || null;
  const fillSelect = (id, rows, getValue, getLabel, { includeBlank = true } = {}) => {
    const select = byId(id);
    if (!select) return;
    const current = select.value;
    select.innerHTML = "";
    if (includeBlank) select.append(new Option("", ""));
    for (const row of rows) select.append(new Option(getLabel(row), getValue(row)));
    if ([...select.options].some(option => option.value === current)) select.value = current;
  };
  const readSelectValue = id => byId(id)?.value || "";
  const readFieldValue = (formId, fieldName) => String(formField(byId(formId), fieldName)?.value || "");
  const setSelectedValue = (id, selectedValue) => {
    const select = byId(id);
    if (select && [...select.options].some(option => option.value === selectedValue)) select.value = selectedValue;
  };
  const setSubmitDisabled = (formId, disabled) => {
    const button = byId(formId)?.querySelector('button[type="submit"]');
    if (button) button.disabled = Boolean(disabled);
  };
  return {
    byId,
    setStatus,
    formField,
    fillSelect,
    readSelectValue,
    readFieldValue,
    setSelectedValue,
    setSubmitDisabled
  };
}
