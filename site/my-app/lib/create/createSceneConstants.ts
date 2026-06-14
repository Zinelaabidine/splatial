export const CREATE_PART_SIZE = 5 * 1024 * 1024;
export const CREATE_CONCURRENCY = 4;
export const MAX_FILE_SIZE = 500 * 1024 * 1024;

export const GDRIVE_URL_RE =
  /^https:\/\/drive\.google\.com\/(file\/d\/[A-Za-z0-9_-]{10,}|open\?.*\bid=[A-Za-z0-9_-]{10,}|uc\?.*\bid=[A-Za-z0-9_-]{10,})/;

export type UploadTab = "file" | "gdrive";

export type CreateUploadStage =
  | "idle"
  | "initializing"
  | "presigning"
  | "uploading"
  | "completing"
  | "importing"
  | "error";

export type Visibility = "private" | "public";

export const STAGE_LABEL: Record<CreateUploadStage, string> = {
  idle: "",
  initializing: "Initializing upload…",
  presigning: "Preparing upload URLs…",
  uploading: "Uploading…",
  completing: "Finalizing…",
  importing: "Queuing import…",
  error: "",
};

export function stageLabelWithProgress(
  stage: CreateUploadStage,
  progress: number,
): string {
  if (stage === "uploading") return `Uploading… ${progress}%`;
  return STAGE_LABEL[stage];
}
