import path from "node:path";
import { writeFile } from "node:fs/promises";
import {
  ENGENTUS_CHART_THEME_STYLESHEET,
  ENGENTUS_SHELL_THEME_STYLESHEET
} from "../examples/engentus/app/engentus-theme.wcss.js";
import { renderWcssStylesheet } from "../src/uplift/wcss-grammar.js";

const appDir = path.join(process.cwd(), "examples", "engentus", "app");

async function writeThemeFile(fileName, stylesheet) {
  const output = renderWcssStylesheet(stylesheet, {
    banner: "Generated from examples/engentus/app/engentus-theme.wcss.js"
  });
  await writeFile(path.join(appDir, fileName), output, "utf8");
}

await writeThemeFile("engentus-shell.css", ENGENTUS_SHELL_THEME_STYLESHEET);
await writeThemeFile("engentus-chart-pages.css", ENGENTUS_CHART_THEME_STYLESHEET);
