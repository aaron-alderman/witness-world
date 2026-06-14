import { renderPagePresentationHead } from "../../src/runtime-presentation.js";
import { INSPECT_WIDGET_PAGE_CSS } from "./widget-page-styles.js";

export function renderWidgetPageHead(title, pageTheme) {
  return renderPagePresentationHead({
    title,
    pageTheme,
    extraCss: INSPECT_WIDGET_PAGE_CSS
  });
}
