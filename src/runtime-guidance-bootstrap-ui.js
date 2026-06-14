export function renderBootstrapGuidanceStyles() {
  return "";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

export function renderBootstrapGuidanceCard(guidance = null) {
  const title = typeof guidance?.title === "string" && guidance.title.trim()
    ? guidance.title.trim()
    : "Active Guidance";
  const badge = typeof guidance?.bootstrapCardBadge === "string" && guidance.bootstrapCardBadge.trim()
    ? guidance.bootstrapCardBadge.trim()
    : "Guidance";
  const summary = typeof guidance?.summary === "string" && guidance.summary.trim()
    ? guidance.summary.trim()
    : "This guidance uses the real bootstrap builders and the real runtime. It stays attached to authored state instead of a fake shell.";
  return `
      <article class="surface-card surface-stack" id="tutorial-card" data-guidance-card="true" data-tutorial-target="tutorial-card">
        <div class="surface-badge">${escapeHtml(badge)}</div>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(summary)}</p>
        <div class="chapter-list" id="tutorial-chapters"></div>
        <p class="surface-note surface-mono" id="tutorial-summary">Loading guidance status...</p>
        <div class="surface-grid-2">
          <div>
            <div class="surface-kicker">Current Concepts</div>
            <div class="tutorial-concept-list" id="tutorial-current-concepts"></div>
          </div>
          <div>
            <div class="surface-kicker">Revealed Concepts</div>
            <div class="tutorial-concept-list" id="tutorial-revealed-concepts"></div>
          </div>
        </div>
        <div>
          <div class="surface-kicker">Suggested Next Moves</div>
          <div class="tutorial-suggestion-list" id="tutorial-suggestions"></div>
        </div>
        <div>
          <div class="surface-kicker">Disabled Sourcery Scopes</div>
          <div class="tutorial-disabled-list" id="tutorial-disabled-pages"></div>
        </div>
        <div class="surface-actions">
          <button type="button" id="tutorial-start">Start Tutorial</button>
          <button type="button" id="tutorial-resume" class="surface-button-secondary">Resume Tutorial</button>
          <button type="button" id="tutorial-restart-chapter" class="surface-button-secondary">Restart Chapter</button>
          <button type="button" id="tutorial-restart-from-here" class="surface-button-secondary">Restart From This Scope</button>
          <button type="button" id="tutorial-back" class="surface-button-secondary">Back</button>
          <button type="button" id="tutorial-skip" class="surface-button-secondary">Skip Chapter</button>
          <button type="button" id="tutorial-disable-page" class="surface-button-secondary">Disable Sourcery Here</button>
          <button type="button" id="tutorial-exit" class="surface-button-secondary">Exit</button>
          <button type="button" id="tutorial-reset" class="surface-button-secondary">Reset Tutorial</button>
        </div>
        <p class="surface-status surface-mono" id="tutorial-status"></p>
      </article>
  `;
}

export function renderBootstrapGuidanceOverlay() {
  return `
  <div id="tutorial-dimmer" class="tutorial-dimmer tutorial-hidden" data-guidance-dimmer="true" aria-hidden="true"></div>
  <aside id="tutorial-overlay" class="tutorial-overlay tutorial-hidden" data-guidance-overlay="true" aria-live="polite">
    <div id="tutorial-overlay-handle" class="tutorial-overlay-handle">
      <div class="tutorial-handle-copy">
        <div class="tutorial-overlay-meta" id="tutorial-overlay-meta"></div>
        <div class="tutorial-handle-kicker">Drag guidance window</div>
      </div>
      <div class="tutorial-handle-grip" aria-hidden="true">::</div>
    </div>
    <h3 id="tutorial-overlay-title"></h3>
    <p id="tutorial-overlay-body"></p>
    <div class="tutorial-concept-list" id="tutorial-overlay-concepts"></div>
    <div class="surface-actions">
      <button type="button" id="tutorial-next">Next</button>
      <button type="button" class="surface-button-secondary" id="tutorial-restart-current">Restart Chapter</button>
      <button type="button" class="surface-button-secondary" id="tutorial-replay-current">Restart From This Scope</button>
      <button type="button" class="surface-button-secondary" id="tutorial-finish-chapter">Finish Chapter For Me</button>
      <button type="button" class="surface-button-secondary" id="tutorial-disable-current-page">Disable Sourcery Here</button>
      <button type="button" class="surface-button-secondary" id="tutorial-overlay-resume">Resume</button>
    </div>
  </aside>
  `;
}

export const renderBootstrapTutorialStyles = renderBootstrapGuidanceStyles;
export const renderBootstrapTutorialCard = renderBootstrapGuidanceCard;
export const renderBootstrapTutorialOverlay = renderBootstrapGuidanceOverlay;
