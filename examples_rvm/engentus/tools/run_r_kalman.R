# run_r_kalman.R — run the authoritative R 3-state joint Kalman on one burst
# and emit its outputs as JSON, so the in-IR JS kernel can be verified against
# the R reference (the golden's filtered states diverged and are not a usable
# oracle; the R model in mill_bolt_angle.R is).
#
# Usage (from repo root):
#   Rscript examples_rvm/engentus/tools/run_r_kalman.R \
#     example-ports/engentus-pipeline-r/R/mill_bolt_angle.R \
#     examples_rvm/engentus/fixtures/_kalman_burst_for_r.csv \
#     examples_rvm/engentus/fixtures/_kalman_r_reference.json

args <- commandArgs(trailingOnly = TRUE)
src <- args[1]; csv <- args[2]; out <- args[3]

source(src)
df <- read.csv(csv, check.names = FALSE)

res <- process_burst(df, time_col = "t_utc",
                     accel_g0 = 9.81, gyro_in_dps = TRUE,
                     true_north_offset_deg = 90, estimate_noise = TRUE)

vals <- list(
  omega_bolt_dps       = res$diagnostics$omega_bolt_dps,
  omega_tx_dps         = res$diagnostics$omega_tx_dps,
  omega_burst_rpm      = res$diagnostics$omega_bolt_dps / 6,
  r_bolt_m             = res$diagnostics$r_bolt_m,
  r_tx_m               = res$diagnostics$r_tx_m,
  delta_BT_deg         = res$delta_BT_deg,
  bias_combined_dps    = res$bias_combined_dps,
  residual_bolt_sd_deg = res$residual_bolt_sd_deg,
  residual_tx_sd_deg   = res$residual_tx_sd_deg,
  total_rotation_deg   = res$diagnostics$total_rotation_deg,
  sigma_theta_b_used   = NA,  # R doesn't surface the used sigma; recomputed below
  sigma_theta_t_used   = NA
)

# Recompute the sigma actually used (process_burst floors estimate at 1e-3).
tsec <- df$t_utc - df$t_utc[1]
aB <- as.matrix(df[, c("ax_bolt_g","ay_bolt_g","az_bolt_g")]) * 9.81
gB <- as.matrix(df[, c("gx_bolt_dps","gy_bolt_dps","gz_bolt_dps")]) * pi/180
aT <- as.matrix(df[, c("ax_tx_g","ay_tx_g","az_tx_g")]) * 9.81
gT <- as.matrix(df[, c("gx_tx_dps","gy_tx_dps","gz_tx_dps")]) * pi/180
fB <- build_sensor_frame(aB, gB); fT <- build_sensor_frame(aT, gT)
pB <- project_signals(aB, gB, fB); pT <- project_signals(aT, gT, fT)
thB <- accel_theta(pB$a_rad, pB$a_tan, fB$c_centripetal)
thT <- accel_theta(pT$a_rad, pT$a_tan, fT$c_centripetal)
vals$sigma_theta_b_used <- max(estimate_sigma_theta(thB, tsec), 1e-3)
vals$sigma_theta_t_used <- max(estimate_sigma_theta(thT, tsec), 1e-3)

# hand-roll minimal JSON (avoid jsonlite dependency)
pairs <- vapply(names(vals), function(k) sprintf('"%s":%.17g', k, vals[[k]]), character(1))
writeLines(paste0("{", paste(pairs, collapse = ","), "}"), out)
cat("wrote", out, "\n")
