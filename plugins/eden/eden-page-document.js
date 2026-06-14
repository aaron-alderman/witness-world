function escapeEdenPageDocumentHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character]);
}

export function renderEdenPageDocument({
  title = "Eden Canvas",
  css = "",
  neighborhoodTitle = "First Neighbourhood",
  clientJs = ""
} = {}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeEdenPageDocumentHtml(title)}</title>
<style>${css}</style>
</head>
<body>
  <header class="eden-toolbar">
    <strong>Eden Canvas</strong>
    <span>${escapeEdenPageDocumentHtml(neighborhoodTitle)}</span>
    <button id="eden-reset-view" type="button">Home</button>
    <a href="/">Open Todo</a>
    <a href="/canvas">Open Canvas</a>
  </header>
  <div class="eden-stage" id="eden-stage">
    <svg class="eden-connections" id="eden-connections"></svg>
    <div class="eden-surfaces" id="eden-surfaces"></div>
    <div class="eden-status" id="eden-status"></div>
    <aside class="eden-chapter" id="eden-chapter" hidden>
      <div class="eden-chapter-label">Current Chapter</div>
      <div class="eden-chapter-title" id="eden-chapter-title"></div>
      <div class="eden-chapter-body" id="eden-chapter-body"></div>
      <div class="eden-chapter-unlocks" id="eden-chapter-unlocks"></div>
      <div class="eden-chapter-quests" id="eden-chapter-quests"></div>
      <div class="eden-chapter-tracks" id="eden-chapter-tracks"></div>
    </aside>
    <div class="eden-prompt" id="eden-prompt" hidden></div>
  </div>
  <script>${clientJs}</script>
</body>
</html>`;
}
