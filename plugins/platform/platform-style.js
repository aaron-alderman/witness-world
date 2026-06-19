import fs from "node:fs";
import { renderWcssStylesheet } from "../../src/uplift/wcss-grammar.js";
import { createStylesheetFromWcssSource } from "./wcss-source.js";

const PLATFORM_CONSOLE_WCSS_FILE = "plugins/platform/platform-console.wcss";

export function readPlatformConsoleWcssSource() {
  return fs.readFileSync(new URL("./platform-console.wcss", import.meta.url), "utf8");
}

export function createPlatformConsoleStylesheet() {
  return createStylesheetFromWcssSource(readPlatformConsoleWcssSource(), {
    file: PLATFORM_CONSOLE_WCSS_FILE
  });
}

export function renderPlatformConsoleCss() {
  return renderWcssStylesheet(createPlatformConsoleStylesheet(), {
    banner: `Generated from ${PLATFORM_CONSOLE_WCSS_FILE}`
  });
}
