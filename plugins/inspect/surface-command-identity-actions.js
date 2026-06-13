export function renderSurfaceCommandIdentityActionsFactory() {
  return String.raw`
    const submitSurfaceCommandIdentityForm = ${submitSurfaceCommandIdentityForm.toString()};
    const bindSurfaceCommandIdentityActions = ${bindSurfaceCommandIdentityActions.toString()};
  `;
}

function readSurfaceCommandIdentityFields(form) {
  const formData = new FormData(form);
  return {
    label: String(formData.get("label") ?? "").trim(),
    username: String(formData.get("username") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    homeContext: String(formData.get("homeContext") ?? "").trim(),
    homePerspective: String(formData.get("homePerspective") ?? "").trim()
  };
}

export async function submitSurfaceCommandIdentityForm({
  form = null,
  state = {},
  buildSurfaceWhoamiResult = () => ({}),
  currentSurfaceIdentityRecord = () => null,
  patchSurfaceIdentity = async () => ({ ok: false, body: {} }),
  applyTheme = () => {},
  updateSurfaceInspectorUi = () => {},
  readIdentityFields = readSurfaceCommandIdentityFields
} = {}) {
  const whoami = state.surfaceCommandResult?.kind === "whoami" ? state.surfaceCommandResult : null;
  const identityId = form?.getAttribute?.("data-identity-id") || whoami?.identity || "";
  const currentIdentity = currentSurfaceIdentityRecord();
  if (!whoami?.authenticated || !identityId || !currentIdentity) {
    state.surfaceCommandResult = {
      ...buildSurfaceWhoamiResult(),
      statusMessage: "Inline identity editor is not ready yet.",
      statusLevel: "error"
    };
    updateSurfaceInspectorUi();
    return false;
  }
  const { label, username, password, homeContext, homePerspective } = readIdentityFields(form);
  const patch = {};
  if (label !== String(currentIdentity.label ?? "")) patch.label = label;
  if (username !== String(currentIdentity.username ?? "")) patch.username = username;
  if (homeContext !== String(currentIdentity.homeContext ?? "")) patch.homeContext = homeContext;
  if (homePerspective !== String(currentIdentity.homePerspective ?? "")) patch.homePerspective = homePerspective;
  if (password) patch.password = password;
  if (!Object.keys(patch).length) {
    state.surfaceCommandResult = {
      ...buildSurfaceWhoamiResult(),
      statusMessage: "No identity changes to save.",
      statusLevel: "ok"
    };
    updateSurfaceInspectorUi();
    return false;
  }
  state.surfaceCommandResult = {
    ...buildSurfaceWhoamiResult(),
    statusMessage: "Saving " + identityId + "...",
    statusLevel: "ok"
  };
  updateSurfaceInspectorUi();
  const result = await patchSurfaceIdentity({ id: identityId, patch });
  if (!result.ok) {
    state.surfaceCommandResult = {
      ...buildSurfaceWhoamiResult(),
      statusMessage: result.body?.error || "Identity save failed.",
      statusLevel: "error"
    };
    updateSurfaceInspectorUi();
    return false;
  }
  if (result.body?.session && typeof result.body.session === "object") {
    state.session = result.body.session;
    applyTheme();
  }
  if (result.body?.identity && typeof result.body.identity === "object") {
    const identity = result.body.identity;
    const identities = Array.isArray(state.surfaceBootstrapIdentities) ? state.surfaceBootstrapIdentities.slice() : [];
    const index = identities.findIndex(row => row?.id === identity.id);
    if (index >= 0) identities[index] = identity;
    else identities.push(identity);
    state.surfaceBootstrapIdentities = identities;
    state.surfaceBootstrapIdentitiesById = Object.fromEntries(identities.map(row => [row.id, row]));
  }
  state.surfaceCommandResult = {
    ...buildSurfaceWhoamiResult(),
    statusMessage: "Saved " + identityId + ".",
    statusLevel: "ok"
  };
  updateSurfaceInspectorUi();
  return true;
}

export function bindSurfaceCommandIdentityActions({
  overlay = null,
  state = {},
  buildSurfaceWhoamiResult = () => ({}),
  currentSurfaceIdentityRecord = () => null,
  patchSurfaceIdentity = async () => ({ ok: false, body: {} }),
  applyTheme = () => {},
  updateSurfaceInspectorUi = () => {},
  readIdentityFields = readSurfaceCommandIdentityFields
} = {}) {
  overlay?.querySelectorAll?.("[data-surface-command-identity-form]")?.forEach?.(node => {
    node.addEventListener?.("submit", event => {
      event.preventDefault?.();
      void submitSurfaceCommandIdentityForm({
        form: node,
        state,
        buildSurfaceWhoamiResult,
        currentSurfaceIdentityRecord,
        patchSurfaceIdentity,
        applyTheme,
        updateSurfaceInspectorUi,
        readIdentityFields
      });
    });
  });
}
