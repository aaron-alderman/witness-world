import { SHARED_SURFACE_CONTENT_PRIMITIVES_CSS } from "./runtime-surface-content-primitives.js";
import { SHARED_SURFACE_COMMAND_PRIMITIVES_CSS } from "./runtime-surface-command-primitives.js";
import { SHARED_SURFACE_FORM_CONTROLS_CSS } from "./runtime-surface-form-controls.js";
import { SHARED_SURFACE_INSPECTOR_PRIMITIVES_CSS } from "./runtime-surface-inspector-primitives.js";
import { SHARED_SURFACE_TUTORIAL_PRIMITIVES_CSS } from "./runtime-surface-tutorial-primitives.js";

export const SHARED_SURFACE_KIT_CSS = `
body {
  font-family: var(--body-font);
  max-width: 920px;
  margin: 40px auto;
  padding: 0 24px;
  color: var(--ink);
  background:
    radial-gradient(circle at top, rgba(255,255,255,0.38), transparent 34%),
    linear-gradient(180deg, rgba(255,255,255,var(--texture-opacity)) 0%, rgba(255,255,255,0) 22%),
    var(--page-bg);
}
body[data-page="world"] { max-width: none; margin: 0; padding: 0; overflow: hidden; }
body[data-page="world"] main { height: 100vh; display: grid; grid-template-rows: auto 1fr; gap: 0; overflow: hidden; }
body[data-page="world"] h1 { font-size: 1.05rem; margin: 4px 14px 6px; line-height: 1.2; }
body[data-page="world"] .world-graph-link { padding: 6px 14px; display: inline-block; font-size: 13px; }
body[data-actor="aaron"] { --accent: #375a7f; }
body[data-actor="callan"] { --accent: #6b4f8a; }
body[data-actor="adam"] { --accent: #667a3a; }
h1, h2 { font-family: var(--heading-font); }
h1 { color: var(--accent, #333); }
main { display: grid; gap: 18px; }
${SHARED_SURFACE_FORM_CONTROLS_CSS}
${SHARED_SURFACE_CONTENT_PRIMITIVES_CSS}
${SHARED_SURFACE_COMMAND_PRIMITIVES_CSS}
${SHARED_SURFACE_INSPECTOR_PRIMITIVES_CSS}
${SHARED_SURFACE_TUTORIAL_PRIMITIVES_CSS}
`;
