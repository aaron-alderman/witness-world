export function createLogger({ sink = console, level = process.env.WITNESS_LOG_LEVEL || "info" } = {}) {
  const levels = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };
  const threshold = levels[level] ?? levels.info;

  function write(kind, event, fields = {}) {
    if ((levels[kind] ?? 0) > threshold) return;
    const entry = {
      at: new Date().toISOString(),
      level: kind,
      event,
      ...safeFields(fields)
    };
    const line = JSON.stringify(entry);
    if (kind === "error") (sink.error ?? sink.log).call(sink, line);
    else if (kind === "warn") (sink.warn ?? sink.log).call(sink, line);
    else (sink.log ?? console.log).call(sink, line);
  }

  return Object.freeze({
    error: (event, fields) => write("error", event, fields),
    warn: (event, fields) => write("warn", event, fields),
    info: (event, fields) => write("info", event, fields),
    debug: (event, fields) => write("debug", event, fields)
  });
}

function safeFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields ?? {})) {
    if (v instanceof Error) out[k] = { name: v.name, message: v.message, stack: v.stack };
    else out[k] = v;
  }
  return out;
}
