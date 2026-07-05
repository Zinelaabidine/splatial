"use strict";

/**
 * Shared worker progress fields for attempt PATCH / heartbeat handlers.
 *
 * Body (all optional):
 *   progressPhase, progressPercent, progressSubPhase, progressEtaSeconds,
 *   workerVersion
 *
 * DynamoDB attributes:
 *   progress_phase, progress_percent, progress_sub_phase, progress_eta_seconds,
 *   worker_version
 */

function applyProgressFields(body, exprParts, exprValues) {
  const {
    progressPhase,
    progressPercent,
    progressSubPhase,
    progressEtaSeconds,
    workerVersion,
  } = body ?? {};

  if (progressPhase) {
    exprParts.push("progress_phase = :phase");
    exprValues[":phase"] = { S: progressPhase };
  }
  if (typeof progressPercent === "number") {
    exprParts.push("progress_percent = :pct");
    exprValues[":pct"] = { N: String(progressPercent) };
  }
  if (typeof progressSubPhase === "string" && progressSubPhase.trim() !== "") {
    exprParts.push("progress_sub_phase = :subphase");
    exprValues[":subphase"] = { S: progressSubPhase.trim() };
  }
  if (typeof progressEtaSeconds === "number" && progressEtaSeconds >= 0) {
    exprParts.push("progress_eta_seconds = :eta");
    exprValues[":eta"] = { N: String(Math.round(progressEtaSeconds)) };
  }
  if (typeof workerVersion === "string" && workerVersion.trim() !== "") {
    exprParts.push("worker_version = :workerver");
    exprValues[":workerver"] = { S: workerVersion.trim() };
  }
}

function mapProgressFromItem(item) {
  const out = {};
  if (item.progress_percent?.N != null) {
    out.progressPercent = Number(item.progress_percent.N);
  }
  if (item.progress_phase?.S) {
    out.progressPhase = item.progress_phase.S;
  }
  if (item.progress_sub_phase?.S) {
    out.progressSubPhase = item.progress_sub_phase.S;
  }
  if (item.progress_eta_seconds?.N != null) {
    out.progressEtaSeconds = Number(item.progress_eta_seconds.N);
  }
  if (item.worker_version?.S) {
    out.workerVersion = item.worker_version.S;
  }
  return out;
}

module.exports = { applyProgressFields, mapProgressFromItem };
