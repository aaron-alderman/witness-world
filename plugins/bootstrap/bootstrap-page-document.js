export function renderBootstrapPageDocument({
  headHtml = "",
  bodyHtml = "",
  scriptBody = ""
} = {}) {
  return `<!doctype html>
<html>
${headHtml}
<body>
${bodyHtml}
  <script>
  (() => {
${scriptBody}
  })();
  </script>
</body>
</html>`;
}
