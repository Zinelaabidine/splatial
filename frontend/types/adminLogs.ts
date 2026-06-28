/** Log drill-down types. Mirrors GET /admin/attempts/{attemptId}/logs. */

export type AttemptLogLine = {
  timestamp: number;
  logStreamName?: string;
  // Present when the line is a parsed JSON envelope:
  ts?: string | null;
  level?: string | null;
  event?: string | null;
  msg?: string | null;
  data?: Record<string, unknown> | null;
  // Present when the line was not valid JSON:
  raw?: string;
};

export type AttemptLogsResponse = {
  lines: AttemptLogLine[];
  nextToken?: string;
  note?: string;
};
