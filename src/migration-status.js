export const MIGRATION_STATUS = Object.freeze({
  compatible: "compatible",
  migrate: "migrate",
  forkRequired: "forkRequired",
  blocked: "blocked"
});

export function migrationStatusFromTransitionStrategy(strategy = "") {
  switch (String(strategy || "")) {
    case "compatible":
      return MIGRATION_STATUS.compatible;
    case "migrate":
      return MIGRATION_STATUS.migrate;
    case "fork":
      return MIGRATION_STATUS.forkRequired;
    default:
      return MIGRATION_STATUS.blocked;
  }
}

export function migrationStatusFromActivationStatus(status = "") {
  switch (String(status || "")) {
    case "activated":
      return MIGRATION_STATUS.compatible;
    case "migrated":
      return MIGRATION_STATUS.migrate;
    case "forkRequired":
      return MIGRATION_STATUS.forkRequired;
    default:
      return MIGRATION_STATUS.blocked;
  }
}
