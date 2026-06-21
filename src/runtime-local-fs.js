import fs from "node:fs/promises";

// Explicit local filesystem fallback for no-core or demoted utility paths.
// Canonical runtime code should prefer witness-core capability-backed modules.
export const runtimeLocalFsModule = fs;
