export function privateNotesPrivacyState(actor) {
  if (!actor) {
    return {
      authenticated: false,
      mode: "signin",
      visibility: "actor-private",
      actor: null,
      reason: "sign in to see and save notes that belong only to you"
    };
  }
  return {
    authenticated: true,
    mode: "private",
    visibility: "actor-private",
    actor,
    reason: null
  };
}
