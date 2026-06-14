"use client";

import { authenticatedFetch } from "@/server/services/apiClient";
import type {
  CompleteResponse,
  CompletedPart,
  InitUploadResponse,
  InputType,
  PresignResponse,
} from "@/types/api";

export const DEFAULT_PART_SIZE = 5 * 1024 * 1024;
export const DEFAULT_CONCURRENCY = 4;

export type MultipartUploadStage =
  | "initializing"
  | "presigning"
  | "uploading"
  | "completing";

export type MultipartUploadProgressHandler = (
  stage: MultipartUploadStage,
  progress?: number,
  meta?: { sceneId?: string },
) => void;

export interface MultipartUploadParams {
  file: File;
  contentType: string;
  name?: string;
  inputType?: InputType;
  partSize?: number;
  concurrency?: number;
  signal?: AbortSignal;
  onProgress?: MultipartUploadProgressHandler;
}

export interface MultipartUploadResult {
  sceneId: string;
  uploadId: string;
  key: string;
  complete: CompleteResponse;
}

export async function multipartUpload(
  params: MultipartUploadParams,
): Promise<MultipartUploadResult> {
  const {
    file,
    contentType,
    name,
    inputType,
    partSize = DEFAULT_PART_SIZE,
    concurrency = DEFAULT_CONCURRENCY,
    signal,
    onProgress,
  } = params;

  onProgress?.("initializing");

  const initBody: Record<string, string> = {
    filename: file.name,
    contentType,
  };
  if (name !== undefined) initBody.name = name;
  if (inputType !== undefined) initBody.inputType = inputType;

  const init = (await authenticatedFetch("/upload/init", {
    method: "POST",
    body: JSON.stringify(initBody),
    signal,
  })) as InitUploadResponse;

  onProgress?.("presigning", undefined, { sceneId: init.sceneId });

  const partCount = Math.max(1, Math.ceil(file.size / partSize));
  const presign = (await authenticatedFetch("/upload/presign", {
    method: "POST",
    body: JSON.stringify({
      uploadId: init.uploadId,
      key: init.key,
      partCount,
    }),
    signal,
  })) as PresignResponse;

  onProgress?.("uploading", 0);

  const completed: CompletedPart[] = new Array(partCount);
  let done = 0;

  const uploadPart = async (part: PresignResponse["parts"][number]) => {
    const start = (part.partNumber - 1) * partSize;
    const blob = file.slice(start, Math.min(start + partSize, file.size));
    const res = await fetch(part.url, { method: "PUT", body: blob, signal });
    if (!res.ok) {
      throw new Error(`Part ${part.partNumber} failed: ${res.status}`);
    }
    const eTag = res.headers.get("ETag")?.replace(/"/g, "");
    if (!eTag) {
      throw new Error(`Part ${part.partNumber} missing ETag`);
    }
    completed[part.partNumber - 1] = { partNumber: part.partNumber, eTag };
    done++;
    onProgress?.("uploading", Math.round((done / partCount) * 100));
  };

  const ordered = [...presign.parts].sort(
    (a, b) => a.partNumber - b.partNumber,
  );
  for (let i = 0; i < ordered.length; i += concurrency) {
    await Promise.all(ordered.slice(i, i + concurrency).map(uploadPart));
  }

  onProgress?.("completing");

  const complete = (await authenticatedFetch("/upload/complete", {
    method: "POST",
    body: JSON.stringify({
      uploadId: init.uploadId,
      key: init.key,
      sceneId: init.sceneId,
      parts: completed,
    }),
    signal,
  })) as CompleteResponse;

  return {
    sceneId: init.sceneId,
    uploadId: init.uploadId,
    key: init.key,
    complete,
  };
}
