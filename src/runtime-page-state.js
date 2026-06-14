export function serializeRuntimePageJson(value) {
  return JSON.stringify(value).replace(/[<>&]/g, char => {
    if (char === "<") return "\\u003c";
    if (char === ">") return "\\u003e";
    return "\\u0026";
  });
}

export function renderRuntimePageInitialStateScript(scriptId, value) {
  const id = typeof scriptId === "string" ? scriptId.trim() : "";
  if (!id) throw new Error("initial state script id is required");
  return `<script type="application/json" id="${escapeAttr(id)}">${serializeRuntimePageJson(value)}</script>`;
}

export function injectRuntimePageMarkupBeforeProgram(html, addition, {
  frontendProgramScriptId = "witness-frontend-program"
} = {}) {
  const source = String(html ?? "");
  const markup = String(addition ?? "");
  const anchorId = typeof frontendProgramScriptId === "string" && frontendProgramScriptId.trim()
    ? frontendProgramScriptId.trim()
    : "witness-frontend-program";
  const anchor = `<script type="application/json" id="${escapeAttr(anchorId)}">`;
  if (source.includes(anchor)) return source.replace(anchor, `${markup}\n${anchor}`);
  if (source.includes("</body>")) return source.replace("</body>", `${markup}\n</body>`);
  return `${source}\n${markup}`;
}

function escapeAttr(value) {
  return String(value)
    .replace(/&(?!#39;|quot;)/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
