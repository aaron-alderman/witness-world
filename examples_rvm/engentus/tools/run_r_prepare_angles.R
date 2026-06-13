# run_r_prepare_angles.R — run the canonical R angle helpers on one burst and
# emit the three angle columns as JSON, so the in-IR JS kernel can be verified
# against R (canonical) to machine precision.
#
# Rather than source() prepare.R (which pulls in arrow/dplyr/calibrate/…), this
# parse()s the real source and evaluates ONLY the cf_filter + fit_rotation_angle
# definitions — the exact canonical code, no drift, no heavy deps.
#
# Usage (from repo root):
#   Rscript examples_rvm/engentus/tools/run_r_prepare_angles.R \
#     example-ports/engentus-pipeline-r/R/prepare.R \
#     examples_rvm/engentus/fixtures/_prepare_angles_for_r.csv \
#     examples_rvm/engentus/fixtures/_prepare_angles_r_reference.json

args <- commandArgs(trailingOnly = TRUE)
src <- args[1]; csv <- args[2]; out <- args[3]

# constants from prepare.R (lines 30-31)
env <- new.env()
env$dt_s <- 1 / 20
env$cf_alpha <- 0.98

exprs <- parse(src)
want <- c("cf_filter", "fit_rotation_angle")
found <- character(0)
for (e in exprs) {
  if (is.call(e) && length(e) >= 3 &&
      (identical(e[[1]], as.name("<-")) || identical(e[[1]], as.name("=")))) {
    nm <- as.character(e[[2]])
    if (length(nm) == 1 && nm %in% want) { eval(e, env); found <- c(found, nm) }
  }
}
stopifnot(all(want %in% found))

df <- read.csv(csv, check.names = FALSE)
ay <- df$ay_bolt_g; az <- df$az_bolt_g; gx <- df$gx_bolt_dps
t_s <- (df$sample_idx - df$sample_idx[1]) * env$dt_s

theta_acc  <- atan2(ay, az) * 180 / pi
theta_filt <- env$cf_filter(ay, az, gx)
rotation   <- env$fit_rotation_angle(t_s, az, gx)

num_arr <- function(v) paste0("[", paste(vapply(v, function(x)
  if (is.na(x)) "null" else sprintf("%.17g", x), character(1)), collapse = ","), "]")

writeLines(paste0(
  "{\"theta_acc_deg\":", num_arr(theta_acc),
  ",\"theta_filt_deg\":", num_arr(theta_filt),
  ",\"rotation_angle_deg\":", num_arr(rotation), "}"), out)
cat("wrote", out, "— evaluated:", paste(found, collapse = ", "), "\n")
