function renderSessionStatus() {
  const sessionStatus = el("session-status");
  if (!sessionStatus) return;
  sessionStatus.textContent = isAuthenticated()
    ? "Signed in as " + (state.session.label || currentActor()) + " (" + currentActor() + ")" + (state.session.perspective ? " in " + state.session.perspective : "")
    : "Not signed in";
  const loginButton = el("session-open-btn");
  const logoutButton = el("session-logout-btn");
  if (loginButton) loginButton.disabled = false;
  if (logoutButton) logoutButton.disabled = !isAuthenticated();
}

function syncSession(session) {
  state.session = session?.authenticated
    ? {
        authenticated: true,
        identity: session.identity || null,
        actor: session.actor || null,
        label: session.label || session.actor || null,
        perspective: session.perspective || null
      }
    : { authenticated: false, identity: null, actor: null, label: null, perspective: null };
  renderSessionStatus();
  updateUndoButtons();
  markDirty();
}

async function initSession() {
  const response = await fetch("/api/session");
  const body = await response.json().catch(() => ({ authenticated: false }));
  if (!response.ok) throw new Error(body?.error || "session request failed");
  syncSession(body);
}

async function openSession() {
  const username = (el("session-username")?.value || "").trim();
  const password = el("session-password")?.value || "";
  const response = await fetch("/api/session", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ username, password })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || "session request failed");
  syncSession(body);
  setStatus("signed in as " + (body.label || body.actor || body.identity));
}

async function logoutSession() {
  const response = await fetch("/api/session", { method: "DELETE" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || "logout failed");
  syncSession({ authenticated: false, identity: null, actor: null, label: null, perspective: null });
  setStatus("signed out");
}

export function renderCanvasSessionRuntimePrelude() {
  return `
${renderSessionStatus.toString()}
${syncSession.toString()}
${initSession.toString()}
${openSession.toString()}
${logoutSession.toString()}
`;
}
