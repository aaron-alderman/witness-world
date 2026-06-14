import { renderCanvasPageDocument } from "./canvas-page-document.js";
import { renderCanvasPageScript } from "./canvas-page-script.js";
import { CANVAS_PAGE_CSS } from "./canvas-page-styles.js";

export function renderCanvasPage({ actors = [] } = {}) {
  return renderCanvasPageDocument({
    css: CANVAS_PAGE_CSS,
    clientJs: renderCanvasPageScript()
  });
}
