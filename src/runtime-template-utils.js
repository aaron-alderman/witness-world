export function renderTemplatedText(template, vars) {
  const source = typeof template === "string" ? template : "";
  const values = vars && typeof vars === "object" ? vars : {};
  return source.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (_match, name) => {
    if (!Object.prototype.hasOwnProperty.call(values, name)) {
      throw new Error(`missing template variable: ${name}`);
    }
    const value = values[name];
    return value == null ? "" : String(value);
  });
}
