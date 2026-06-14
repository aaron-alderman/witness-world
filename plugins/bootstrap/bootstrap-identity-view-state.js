function bootstrapIdentityEditIdForUrl(requestUrl = "/_bootstrap") {
  const url = new URL(requestUrl, "http://bootstrap.local");
  const value = url.searchParams.get("identity");
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export function buildBootstrapIdentityView({ bootstrapState = null, requestUrl = "/_bootstrap" } = {}) {
  const identities = Array.isArray(bootstrapState?.identities) ? bootstrapState.identities : [];
  const editId = bootstrapIdentityEditIdForUrl(requestUrl);
  const editingIdentity = identities.find(row => row.id === editId) || null;
  if (editingIdentity) {
    return {
      mode: "edit",
      editId: editingIdentity.id || "",
      heading: "Edit Identity",
      copy: "This handoff edits the real authored identity through bootstrap. Identity id and actor stay fixed in this first slice.",
      submitText: "Save Identity",
      createNewHidden: false,
      idDisabled: true,
      actorDisabled: true,
      fields: {
        editId: editingIdentity.id || "",
        id: editingIdentity.id || "",
        actor: editingIdentity.actor || "",
        label: editingIdentity.label || "",
        username: editingIdentity.username || "",
        password: editingIdentity.password || "",
        homePerspective: editingIdentity.homePerspective || "",
        homeContext: editingIdentity.homeContext || ""
      }
    };
  }
  return {
    mode: "create",
    editId: "",
    heading: "Create First Identity",
    copy: "Create the first user when the world is blank. After identities exist, normal session auth is required for bootstrap edits.",
    submitText: "Create Identity",
    createNewHidden: true,
    idDisabled: false,
    actorDisabled: false,
    fields: {
      editId: "",
      id: "",
      actor: "",
      label: "",
      username: "",
      password: "",
      homePerspective: "",
      homeContext: ""
    }
  };
}
