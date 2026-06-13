# run_r_health.R — run the canonical R health timeline + summary on synthetic
# stats+bursts and emit inputs + outputs as JSON, for the in-IR JS kernel to
# verify against (R is canonical). Functions are parse()-eval'd from health.R
# (no source-of plotting deps; no drift).
#
# Usage (repo root):
#   Rscript examples_rvm/engentus/tools/run_r_health.R \
#     example-ports/engentus-pipeline-r/R/health.R \
#     examples_rvm/engentus/fixtures/health-r.json

args <- commandArgs(trailingOnly = TRUE)
src <- args[1]; out <- args[2]
suppressMessages({ library(dplyr); library(lubridate) })

load_channels      <- c("x1", "y1", "x3", "y3", "z2")
degraded_threshold <- 0.0
failed_threshold   <- 1.0

exprs <- parse(src)
want <- c("build_health_timeline", "summarise_health")
found <- character(0)
for (e in exprs) {
  if (is.call(e) && length(e) >= 3 &&
      (identical(e[[1]], as.name("<-")) || identical(e[[1]], as.name("=")))) {
    nm <- as.character(e[[2]])
    if (length(nm) == 1 && nm %in% want) { eval(e, globalenv()); found <- c(found, nm) }
  }
}
stopifnot(all(want %in% found))

# ── synthetic bursts: 2 bolts × 4 bursts across 2 days ──────────────────────
bursts <- tibble::tribble(
  ~burst_id, ~bolt, ~burst_start_utc,
  "b5d1a", 5L, "2026-04-02 10:00:00",
  "b5d1b", 5L, "2026-04-02 12:00:00",
  "b5d2a", 5L, "2026-04-03 10:00:00",
  "b5d2b", 5L, "2026-04-03 12:00:00",
  "b6d1a", 6L, "2026-04-02 10:00:00",
  "b6d1b", 6L, "2026-04-02 12:00:00"
) |> mutate(device_id = paste0("dev", bolt), mill_id = "B01",
            trial_arm = if_else(bolt == 5L, "insert", "control"),
            burst_start_perth = burst_start_utc)

# ── synthetic stats: x1 (load) varied clips, y1 (load), ax_bolt (IMU→filtered)
mk <- function(burst, channel, hard, soft, spike) {
  isc <- channel %in% load_channels
  tibble::tibble(burst_id = burst, channel = channel,
    hard_clip = if (isc) hard else NA, soft_clip = if (isc) soft else NA,
    spike_contaminated = if (isc) spike else NA,
    is_clipped = if (isc) (hard | soft | spike) else NA,
    median_raw = 8000000, iqr_raw = 1000)
}
stats <- dplyr::bind_rows(
  # bolt5 x1: day1 clean+hard (degraded), day2 all clipped (failed)
  mk("b5d1a", "x1", FALSE, FALSE, FALSE), mk("b5d1b", "x1", TRUE, FALSE, FALSE),
  mk("b5d2a", "x1", TRUE, TRUE, FALSE),  mk("b5d2b", "x1", FALSE, FALSE, TRUE),
  # bolt5 y1: all clean (healthy) day1
  mk("b5d1a", "y1", FALSE, FALSE, FALSE), mk("b5d1b", "y1", FALSE, FALSE, FALSE),
  # bolt6 x1: day1 both hard (failed)
  mk("b6d1a", "x1", TRUE, FALSE, FALSE), mk("b6d1b", "x1", TRUE, TRUE, TRUE),
  # IMU channel must be dropped by the load-channel filter
  mk("b5d1a", "ax_bolt", NA, NA, NA)
)

timeline <- build_health_timeline(stats, bursts)
day_sum  <- summarise_health(timeline, period = "day")

# ── hand-rolled JSON ────────────────────────────────────────────────────────
jb <- function(x) if (is.na(x)) "null" else tolower(as.character(x))
js <- function(x) paste0("\"", x, "\"")
jn <- function(x) if (is.na(x)) "null" else sprintf("%.17g", x)
obj <- function(p) paste0("{", paste(p, collapse = ","), "}")
arr <- function(v) paste0("[", paste(v, collapse = ","), "]")

stat_rows <- arr(vapply(seq_len(nrow(stats)), function(i) obj(c(
  paste0("\"burst_id\":", js(stats$burst_id[i])), paste0("\"channel\":", js(stats$channel[i])),
  paste0("\"hard_clip\":", jb(stats$hard_clip[i])), paste0("\"soft_clip\":", jb(stats$soft_clip[i])),
  paste0("\"spike_contaminated\":", jb(stats$spike_contaminated[i])),
  paste0("\"is_clipped\":", jb(stats$is_clipped[i])),
  paste0("\"median_raw\":", jn(stats$median_raw[i])), paste0("\"iqr_raw\":", jn(stats$iqr_raw[i]))
)), character(1)))

burst_rows <- arr(vapply(seq_len(nrow(bursts)), function(i) obj(c(
  paste0("\"burst_id\":", js(bursts$burst_id[i])), paste0("\"device_id\":", js(bursts$device_id[i])),
  paste0("\"bolt\":", bursts$bolt[i]), paste0("\"mill_id\":", js(bursts$mill_id[i])),
  paste0("\"trial_arm\":", js(bursts$trial_arm[i])),
  paste0("\"burst_start_utc\":", js(bursts$burst_start_utc[i])),
  paste0("\"burst_start_perth\":", js(bursts$burst_start_perth[i]))
)), character(1)))

sum_rows <- arr(vapply(seq_len(nrow(day_sum)), function(i) obj(c(
  paste0("\"bolt\":", day_sum$bolt[i]), paste0("\"mill_id\":", js(day_sum$mill_id[i])),
  paste0("\"trial_arm\":", js(day_sum$trial_arm[i])), paste0("\"channel\":", js(day_sum$channel[i])),
  paste0("\"window\":", js(as.character(day_sum$window[i]))),
  paste0("\"n_bursts\":", day_sum$n_bursts[i]), paste0("\"n_hard_clip\":", day_sum$n_hard_clip[i]),
  paste0("\"n_soft_clip\":", day_sum$n_soft_clip[i]), paste0("\"n_spike\":", day_sum$n_spike[i]),
  paste0("\"n_clipped\":", day_sum$n_clipped[i]), paste0("\"clip_rate\":", jn(day_sum$clip_rate[i])),
  paste0("\"median_raw_avg\":", jn(day_sum$median_raw_avg[i])),
  paste0("\"status\":", js(as.character(day_sum$status[i])))
)), character(1)))

writeLines(obj(c(paste0("\"stats\":", stat_rows), paste0("\"bursts\":", burst_rows),
                 paste0("\"day_summary\":", sum_rows))), out)
cat("wrote", out, "—", nrow(timeline), "timeline rows,", nrow(day_sum), "summary rows\n")
