export function parseOperatorCommand(input) {
  const source = String(input || "").trim();
  if (!source) throw new Error("operator command is empty");

  let match = source.match(/^alias\s+([A-Za-z][A-Za-z0-9_-]*)\s*=\s*(.+)$/i);
  if (match) return { kind: "alias", name: match[1], reference: match[2].trim() };

  match = source.match(/^inspect(?:\s+(.+))?$/i);
  if (match) return { kind: "inspect", reference: (match[1] || "this").trim() };

  match = source.match(/^open(?:\s+(.+))?$/i);
  if (match) return { kind: "open", reference: (match[1] || "this").trim() };

  match = source.match(/^select\s+(.+)$/i);
  if (match) return { kind: "select", reference: match[1].trim() };

  match = source.match(/^note\s+(.+)$/i);
  if (match) return { kind: "note", title: match[1].trim() };

  match = source.match(/^process\s+(.+)$/i);
  if (match) return { kind: "process", title: match[1].trim() };

  match = source.match(/^preview\s+(start|stop|open)$/i);
  if (match) return { kind: "preview", action: match[1].toLowerCase() };

  match = source.match(/^attach(?:\s+(.+))?$/i);
  if (match) return { kind: "attach", appPath: match[1]?.trim() || null };

  if (/^detach$/i.test(source)) return { kind: "detach" };

  throw new Error(`unsupported operator command: ${source}`);
}
