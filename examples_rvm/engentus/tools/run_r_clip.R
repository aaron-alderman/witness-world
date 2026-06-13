# run_r_clip.R — build a deterministic synthetic samples set exercising every
# clip-flag branch, run the canonical R detect_clips on it, and emit BOTH the
# input samples and the output stats as JSON. The in-IR JS kernel reads the same
# input and must reproduce the stats (R is canonical).
#
# Why synthetic: the available caches only hold IMU accel (b_/i_AccelX..Z); no
# raw LOAD-channel (x1/y1/x3/y3/z2) data was ever fetched, so there is no real
# signal for clip detection. Synthetic input still proves port fidelity since R
# and JS run on identical values.
#
# detect_clips is parse()-eval'd from clip.R (with constants + load_channels
# supplied) so this uses the exact canonical code — no drift.
#
# Usage (repo root):
#   Rscript examples_rvm/engentus/tools/run_r_clip.R \
#     example-ports/engentus-pipeline-r/R/clip.R \
#     examples_rvm/engentus/fixtures/clip-samples.json

args <- commandArgs(trailingOnly = TRUE)
src <- args[1]; out <- args[2]
suppressMessages(library(dplyr))

# constants + channel set (clip.R lines 20-23; load_channels from parse.R)
adc_max       <- 16777215L
rail_margin   <- 167772L
iqr_threshold <- 83886L
spike_ratio_k <- 50L
load_channels <- c("x1", "y1", "x3", "y3", "z2")

exprs <- parse(src)
want <- c("hard_clip_sample", "detect_clips")
found <- character(0)
for (e in exprs) {
  if (is.call(e) && length(e) >= 3 &&
      (identical(e[[1]], as.name("<-")) || identical(e[[1]], as.name("=")))) {
    nm <- as.character(e[[2]])
    if (length(nm) == 1 && nm %in% want) { eval(e, globalenv()); found <- c(found, nm) }
  }
}
stopifnot(all(want %in% found))

mid <- 8000000L
mk <- function(burst, channel, raw) data.frame(
  burst_id = burst, channel = channel,
  sample_idx = seq_along(raw), raw = as.integer(raw), stringsAsFactors = FALSE)

samples <- dplyr::bind_rows(
  # clean load channel: gentle ramp around mid-scale
  mk("B1", "x1", mid + (0:9) * 1000L),
  # hard-clipped: a few pinned at 0 and adc_max
  mk("B1", "y1", c(0L, 0L, mid, mid + 5000L, adc_max, adc_max, mid, mid - 3000L, 0L, mid)),
  # soft-clipped: median near low rail + tiny IQR
  mk("B1", "x3", rail_margin - 50000L + c(0L, 10L, -10L, 5L, -5L, 0L, 8L, -8L, 3L, -3L)),
  # spike-contaminated: small steps then one huge jump
  mk("B1", "z2", c(mid, mid + 100L, mid + 200L, mid + 300L, mid + 5000000L, mid + 5000100L, mid + 5000200L, mid, mid + 50L, mid + 80L)),
  # IMU channel: flags must be NA
  mk("B1", "ax_bolt", c(-700L, -710L, -690L, -705L, -695L, -700L, -702L, -698L, -701L, -699L)),
  # second burst to exercise grouping
  mk("B2", "x1", mid + (0:9) * 2000L)
)

stats <- detect_clips(samples)

# ── hand-rolled JSON ────────────────────────────────────────────────────────
jnum <- function(x) if (is.na(x)) "null" else if (is.logical(x)) tolower(as.character(x)) else sprintf("%.17g", x)
jstr <- function(x) paste0("\"", x, "\"")
obj <- function(pairs) paste0("{", paste(pairs, collapse = ","), "}")

samp_json <- paste(vapply(seq_len(nrow(samples)), function(i) obj(c(
  paste0("\"burst_id\":", jstr(samples$burst_id[i])),
  paste0("\"channel\":", jstr(samples$channel[i])),
  paste0("\"sample_idx\":", samples$sample_idx[i]),
  paste0("\"raw\":", samples$raw[i]))), character(1)), collapse = ",")

numcols <- c("median_raw", "iqr_raw", "min_raw", "max_raw", "n_samples",
             "n_hard_clip", "pct_at_rail", "max_abs_diff", "median_abs_diff")
logcols <- c("hard_clip", "soft_clip", "spike_contaminated", "is_clipped")
stat_json <- paste(vapply(seq_len(nrow(stats)), function(i) obj(c(
  paste0("\"burst_id\":", jstr(stats$burst_id[i])),
  paste0("\"channel\":", jstr(stats$channel[i])),
  vapply(numcols, function(cn) paste0("\"", cn, "\":", jnum(stats[[cn]][i])), character(1)),
  vapply(logcols, function(cn) paste0("\"", cn, "\":", jnum(stats[[cn]][i])), character(1))
)), character(1)), collapse = ",")

writeLines(paste0("{\"samples\":[", samp_json, "],\"stats\":[", stat_json, "]}"), out)
cat("wrote", out, "—", nrow(samples), "samples,", nrow(stats), "stat rows\n")
