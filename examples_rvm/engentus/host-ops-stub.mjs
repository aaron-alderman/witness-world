// host-ops-stub.mjs — DETERMINISTIC CI stand-in for the engentus pipeline black box.
//
// These are NOT the real algorithms. The real `engentus.pipeline.*` handlers are
// external Python/DB code (see Rung C "Open prerequisites" in
// docs/PIPELINE-FIDELITY-ROADMAP.md) and are not in this repo. These stubs honour
// the exact same host-operation ABI ({ host_operation, request } →
// { status, payload }) and return fixed, schema-valid payloads so that the
// end-to-end loop (command → runtime → event → state → policy) can be exercised
// and asserted in CI without Python present. When the real black box lands it
// drops in behind the identical protocol; when Rung D internalises an algorithm
// in DESIRE it likewise swaps in behind this same contract.
//
// Each handler is `(request) => { status, payload }`. Payloads conform to the
// declared payload_schema of the stage's success event (empty {} where the
// success event carries no payload schema).

export function engentusHostOpHandlers() {
  const ok = (payload = {}) => ({ status: "success", payload });
  return {
    "engentus.pipeline.ingest.imu": () => ok(),
    "engentus.pipeline.ingest.strain": () => ok(),
    "engentus.pipeline.calibrate.strain": () => ok(),
    "engentus.pipeline.fit.burst": request => ok({
      burst_start: request.burst_start ?? "",
      rpm: 12.5,
      n_valid_pkgs: 42
    }),
    "engentus.pipeline.overview": () => ok(),
    "engentus.pipeline.bolt": () => ok(),
    "engentus.pipeline.health.classify": request => ok({
      hour_start: request.hour_start ?? "",
      n_valid_channels: 5,
      n_bolts_evaluated: 3
    }),
    "engentus.pipeline.alignment": () => ok(),
    "engentus.pipeline.clip.detect": request => ok({
      burst_start: request.burst_start ?? "",
      n_channels_evaluated: 5,
      n_clipped_channels: 0
    }),
    "engentus.pipeline.kalman": request => ok({
      burst_start: request.burst_start ?? "",
      omega_burst_rpm: 11.45,
      delta_bt_deg: 0.3,
      bias_combined_dps: 0.01,
      omega_disagree_flag: false
    }),
    "engentus.pipeline.uncertainty": request => ok({
      burst_start: request.burst_start ?? "",
      rpm_std: 0.02,
      phase_std: 0.05,
      n_packages: 6
    })
  };
}
