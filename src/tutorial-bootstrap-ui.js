export function renderBootstrapTutorialStyles() {
  return `
    .tutorial-concept-list { display: grid; gap: 8px; margin-top: 8px; }
    .tutorial-concept { border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; background: rgba(255,255,255,.72); }
    .tutorial-concept strong { display: block; margin-bottom: 4px; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--accent); font-family: var(--mono); }
    .tutorial-concept span { display: block; font-size: 13px; line-height: 1.45; color: var(--muted); }
    .tutorial-suggestion-list { display: grid; gap: 10px; margin-top: 8px; }
    .tutorial-suggestion { border: 1px solid var(--line); border-radius: 12px; padding: 12px; background: rgba(255,255,255,.82); display: grid; gap: 8px; }
    .tutorial-suggestion strong { display: block; font-size: 14px; color: var(--ink); }
    .tutorial-suggestion p { margin: 0; font-size: 13px; line-height: 1.45; color: var(--muted); }
    .tutorial-disabled-list { display: grid; gap: 10px; margin-top: 8px; }
    .tutorial-disabled-item { border: 1px solid var(--line); border-radius: 12px; padding: 12px; background: rgba(255,255,255,.82); display: grid; gap: 8px; }
    .tutorial-disabled-item strong { display: block; font-size: 14px; color: var(--ink); }
    .tutorial-disabled-item p { margin: 0; font-size: 13px; line-height: 1.45; color: var(--muted); }
    [data-tutorial-focus-scope="true"], [data-tutorial-current] { position: relative; z-index: 7; }
    [data-tutorial-current] { outline: 3px solid var(--accent); outline-offset: 4px; border-radius: 8px; scroll-margin-top: 130px; animation: tutorial-focus-pulse 1.35s ease-in-out infinite; }
    [data-tutorial-changed="true"] { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(122, 77, 42, .18); animation: tutorial-changed-pulse 1.15s ease-in-out 2; }
    [data-tutorial-changed="true"] strong { animation: tutorial-text-pulse 1.15s ease-in-out 2; }
    #tutorial-dimmer { position: fixed; inset: 0; z-index: 5; background: rgba(31, 27, 23, .44); backdrop-filter: blur(2px); pointer-events: none; }
    #tutorial-overlay { position: fixed; width: 360px; max-width: calc(100vw - 24px); z-index: 8; background: rgba(255,253,248,.98); border: 1px solid var(--line); border-radius: 16px; padding: 16px; box-shadow: 0 16px 40px rgba(35, 21, 8, .2); pointer-events: none; }
    #tutorial-overlay h3 { margin: 0 0 8px; font-size: 1.05rem; }
    #tutorial-overlay p { margin: 0 0 10px; font-size: 14px; line-height: 1.5; color: var(--muted); }
    #tutorial-overlay .tutorial-meta { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin-bottom: 6px; }
    #tutorial-overlay button, #tutorial-overlay-handle { pointer-events: auto; }
    #tutorial-overlay-handle { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin: -4px -4px 10px; padding: 4px; cursor: grab; user-select: none; }
    #tutorial-overlay-handle:active { cursor: grabbing; }
    .tutorial-handle-copy { min-width: 0; }
    .tutorial-handle-kicker { font-size: 11px; text-transform: uppercase; letter-spacing: .14em; color: var(--muted); font-family: var(--mono); }
    .tutorial-handle-grip { color: var(--muted); font-size: 18px; line-height: 1; padding-top: 2px; }
    .tutorial-click-pulse { position: fixed; width: 22px; height: 22px; margin-left: -11px; margin-top: -11px; border-radius: 999px; border: 2px solid rgba(122, 77, 42, .65); background: rgba(122, 77, 42, .12); z-index: 9; pointer-events: none; animation: tutorial-click-pulse .55s ease-out forwards; }
    .tutorial-auto-click { animation: tutorial-button-click .5s ease-out; }
    .tutorial-hidden { display: none !important; }
    body.tutorial-dragging { user-select: none; }
  `;
}

export function renderBootstrapTutorialCard() {
  return `
      <article class="card" id="tutorial-card" data-tutorial-target="tutorial-card">
        <div class="badge">Guided Tutorial</div>
        <h2>Build The Todo App From Scratch</h2>
        <p>This tutorial uses the real bootstrap builders and the real runtime. It teaches identities, runner wiring, widgets, programs, routes, mounts, and then continues into the live app to exercise real behavior.</p>
        <div class="chapter-list" id="tutorial-chapters"></div>
        <p class="muted" id="tutorial-summary">Loading tutorial status...</p>
        <div class="grid two">
          <div>
            <div class="kicker">Current Concepts</div>
            <div class="tutorial-concept-list" id="tutorial-current-concepts"></div>
          </div>
          <div>
            <div class="kicker">Revealed Concepts</div>
            <div class="tutorial-concept-list" id="tutorial-revealed-concepts"></div>
          </div>
        </div>
        <div>
          <div class="kicker">Suggested Next Moves</div>
          <div class="tutorial-suggestion-list" id="tutorial-suggestions"></div>
        </div>
        <div>
          <div class="kicker">Disabled Sourcery Scopes</div>
          <div class="tutorial-disabled-list" id="tutorial-disabled-pages"></div>
        </div>
        <div class="actions">
          <button type="button" id="tutorial-start">Start Tutorial</button>
          <button type="button" id="tutorial-resume" class="secondary">Resume Tutorial</button>
          <button type="button" id="tutorial-restart-chapter" class="secondary">Restart Chapter</button>
          <button type="button" id="tutorial-restart-from-here" class="secondary">Restart From This Scope</button>
          <button type="button" id="tutorial-back" class="secondary">Back</button>
          <button type="button" id="tutorial-skip" class="secondary">Skip Chapter</button>
          <button type="button" id="tutorial-disable-page" class="secondary">Disable Sourcery Here</button>
          <button type="button" id="tutorial-exit" class="secondary">Exit</button>
          <button type="button" id="tutorial-reset" class="secondary">Reset Tutorial</button>
        </div>
        <p class="status" id="tutorial-status"></p>
      </article>
  `;
}

export function renderBootstrapTutorialOverlay() {
  return `
  <div id="tutorial-dimmer" class="tutorial-hidden" aria-hidden="true"></div>
  <aside id="tutorial-overlay" class="tutorial-hidden" aria-live="polite">
    <div id="tutorial-overlay-handle">
      <div class="tutorial-handle-copy">
        <div class="tutorial-meta" id="tutorial-overlay-meta"></div>
        <div class="tutorial-handle-kicker">Drag tutorial window</div>
      </div>
      <div class="tutorial-handle-grip" aria-hidden="true">::</div>
    </div>
    <h3 id="tutorial-overlay-title"></h3>
    <p id="tutorial-overlay-body"></p>
    <div class="tutorial-concept-list" id="tutorial-overlay-concepts"></div>
    <div class="actions">
      <button type="button" id="tutorial-next">Next</button>
      <button type="button" class="secondary" id="tutorial-restart-current">Restart Chapter</button>
      <button type="button" class="secondary" id="tutorial-replay-current">Restart From This Scope</button>
      <button type="button" class="secondary" id="tutorial-finish-chapter">Finish Chapter For Me</button>
      <button type="button" class="secondary" id="tutorial-disable-current-page">Disable Sourcery Here</button>
      <button type="button" class="secondary" id="tutorial-overlay-resume">Resume</button>
    </div>
  </aside>
  `;
}
