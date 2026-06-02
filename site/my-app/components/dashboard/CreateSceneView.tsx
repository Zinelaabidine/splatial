"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  FileArchive,
  Lock,
  Upload,
  Link,
} from "lucide-react";

import TopNavBar from "@/components/dashboard/TopNavBar";
import { authenticatedFetch } from "@/utils/apiClient";
import type {
  GdriveImportRequest,
  GdriveImportResponse,
  InitUploadResponse,
  PresignResponse,
} from "@/types/api";

// ── Constants ─────────────────────────────────────────────────────────────────

const PART_SIZE = 5 * 1024 * 1024; // 5 MiB — S3 multipart minimum
const CONCURRENCY = 4;
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB

// Accepted public Google Drive share-link shapes.
// Only https://drive.google.com/ is allowed — no HTTP, no other domains.
const GDRIVE_URL_RE =
  /^https:\/\/drive\.google\.com\/(file\/d\/[A-Za-z0-9_-]{10,}|open\?.*\bid=[A-Za-z0-9_-]{10,}|uc\?.*\bid=[A-Za-z0-9_-]{10,})/;

type UploadTab = "file" | "gdrive";

type UploadStage =
  | "idle"
  | "initializing"
  | "presigning"
  | "uploading"
  | "completing"
  | "importing"
  | "error";

type Visibility = "private" | "public";

// ── Component ─────────────────────────────────────────────────────────────────

export default function CreateSceneView() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<UploadTab>("file");
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("private");

  // File tab state
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Google Drive tab state
  const [gdriveUrl, setGdriveUrl] = useState("");

  const [stage, setStage] = useState<UploadStage>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const uploading = stage !== "idle" && stage !== "error";

  // ── File selection ─────────────────────────────────────────────────────────

  const selectFile = useCallback((f: File) => {
    if (!f.name.toLowerCase().endsWith(".zip")) {
      setError("Only ZIP files are accepted.");
      return;
    }
    if (f.size > MAX_FILE_SIZE) {
      setError("File exceeds the 500 MB limit.");
      return;
    }
    setError(null);
    setFile(f);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) selectFile(f);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) selectFile(f);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  // ── Upload pipeline ────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !file || uploading) return;

    const contentType = "application/zip";

    try {
      setError(null);

      // Step A: init
      setStage("initializing");
      const init = (await authenticatedFetch("/upload/init", {
        method: "POST",
        body: JSON.stringify({
          filename: file.name,
          contentType,
          name: name.trim(),
          inputType: "images",
        }),
      })) as InitUploadResponse;

      // Step B: presign
      setStage("presigning");
      const partCount = Math.max(1, Math.ceil(file.size / PART_SIZE));
      const presign = (await authenticatedFetch("/upload/presign", {
        method: "POST",
        body: JSON.stringify({
          uploadId: init.uploadId,
          key: init.key,
          partCount,
        }),
      })) as PresignResponse;

      // Step C: upload parts
      setStage("uploading");
      setProgress(0);

      const completed: { partNumber: number; eTag: string }[] = new Array(
        partCount,
      );
      let done = 0;

      const uploadPart = async (
        part: PresignResponse["parts"][number],
      ) => {
        const start = (part.partNumber - 1) * PART_SIZE;
        const blob = file.slice(start, Math.min(start + PART_SIZE, file.size));
        const res = await fetch(part.url, { method: "PUT", body: blob });
        if (!res.ok)
          throw new Error(`Part ${part.partNumber} failed: ${res.status}`);
        const eTag = res.headers.get("ETag")?.replace(/"/g, "");
        if (!eTag) throw new Error(`Part ${part.partNumber} missing ETag`);
        completed[part.partNumber - 1] = { partNumber: part.partNumber, eTag };
        done++;
        setProgress(Math.round((done / partCount) * 100));
      };

      const ordered = [...presign.parts].sort(
        (a, b) => a.partNumber - b.partNumber,
      );
      for (let i = 0; i < ordered.length; i += CONCURRENCY) {
        await Promise.all(ordered.slice(i, i + CONCURRENCY).map(uploadPart));
      }

      // Step D: complete
      setStage("completing");
      await authenticatedFetch("/upload/complete", {
        method: "POST",
        body: JSON.stringify({
          uploadId: init.uploadId,
          key: init.key,
          sceneId: init.sceneId,
          parts: completed,
        }),
      });

      router.push("/scenes");
    } catch (err) {
      console.error("[create] upload failed", err);
      setError("Upload failed. Please try again.");
      setStage("error");
    }
  };

  // ── Google Drive submit ────────────────────────────────────────────────────

  const handleGdriveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !gdriveUrl.trim() || uploading) return;

    if (!GDRIVE_URL_RE.test(gdriveUrl.trim())) {
      setError(
        "Invalid Google Drive link. Paste a public share link such as " +
          "https://drive.google.com/file/d/<ID>/view?usp=sharing",
      );
      return;
    }

    try {
      setError(null);
      setStage("importing");

      const payload: GdriveImportRequest = {
        gdrive_url: gdriveUrl.trim(),
        name: name.trim(),
      };

      (await authenticatedFetch("/upload/from-gdrive", {
        method: "POST",
        body: JSON.stringify(payload),
      })) as GdriveImportResponse;

      router.push("/scenes");
    } catch (err) {
      console.error("[create] gdrive import failed", err);
      setError("Import failed. Please verify the link is publicly shared and try again.");
      setStage("error");
    }
  };

  // ── Stage label ────────────────────────────────────────────────────────────

  const stageLabel: Record<UploadStage, string> = {
    idle: "",
    initializing: "Initializing upload…",
    presigning: "Preparing upload URLs…",
    uploading: `Uploading… ${progress}%`,
    completing: "Finalizing…",
    importing: "Queuing import…",
    error: "",
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen flex-col bg-[#080d18] text-white">
      <TopNavBar
        mode="dashboard"
        onLibraryClick={() => router.push("/scenes")}
        onAdminClick={() => router.push("/scenes")}
        onProfileClick={() => router.push("/scenes")}
        onCreateClick={() => {}}
      />

      <main className="flex flex-1 items-start justify-center overflow-y-auto px-6 py-10">
        <form
          onSubmit={activeTab === "gdrive" ? handleGdriveSubmit : handleSubmit}
          className="w-full max-w-5xl"
        >
          {/* Back link */}
          <button
            type="button"
            onClick={() => router.push("/scenes")}
            className="mb-8 inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Library
          </button>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* ── Left panel: Scene Details ── */}
            <div className="rounded-2xl border border-[#1a2535] bg-[#0d1422] p-8">
              {/* Section header */}
              <div className="mb-8 flex items-center gap-3">
                <div className="h-6 w-1 rounded-full bg-blue-500" />
                <h2 className="text-lg font-semibold text-white">
                  Scene Details
                </h2>
              </div>

              {/* Scene Name */}
              <div className="mb-6 flex flex-col gap-2">
                <label
                  htmlFor="scene-name"
                  className="text-sm font-medium text-slate-300"
                >
                  Scene Name{" "}
                  <span className="text-red-400">*</span>
                </label>
                <input
                  id="scene-name"
                  type="text"
                  required
                  autoFocus
                  disabled={uploading}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Golden Gate Bridge"
                  className="rounded-xl border border-[#1e2d45] bg-[#080d18] px-4 py-3 text-sm text-white placeholder:text-slate-600 outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
                />
              </div>

              {/* Visibility */}
              <div className="mb-4 flex flex-col gap-2">
                <span className="text-sm font-medium text-slate-300">
                  Visibility
                </span>
                <div className="flex rounded-xl bg-[#080d18] p-1 border border-[#1e2d45]">
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => setVisibility("private")}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 px-4 text-sm font-medium transition-colors ${
                      visibility === "private"
                        ? "bg-blue-600 text-white shadow"
                        : "text-slate-400 hover:text-slate-300"
                    }`}
                  >
                    <EyeOff className="h-4 w-4" />
                    Private
                  </button>
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => setVisibility("public")}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 px-4 text-sm font-medium transition-colors ${
                      visibility === "public"
                        ? "bg-blue-600 text-white shadow"
                        : "text-slate-400 hover:text-slate-300"
                    }`}
                  >
                    <Eye className="h-4 w-4" />
                    Public
                  </button>
                </div>
              </div>

              {/* Visibility note */}
              <p className="mb-8 flex items-center gap-2 text-xs text-slate-500">
                <Lock className="h-3.5 w-3.5 shrink-0" />
                {visibility === "private"
                  ? "Only you can view this scene"
                  : "Anyone with the link can view this scene"}
              </p>

              <hr className="mb-8 border-[#1a2535]" />

              {/* Upload Requirements */}
              <div>
                <div className="mb-5 flex items-center gap-3">
                  <div className="h-6 w-1 rounded-full bg-purple-500" />
                  <h3 className="text-sm font-semibold text-white">
                    Upload Requirements
                  </h3>
                </div>
                <ul className="space-y-3 text-sm text-slate-400">
                  <li className="flex items-start gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                    <span>
                      File must be a{" "}
                      <strong className="font-semibold text-white">
                        ZIP archive
                      </strong>{" "}
                      containing JPG or PNG images
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                    <span>
                      Recommended:{" "}
                      <strong className="font-semibold text-white">
                        50-200 images
                      </strong>{" "}
                      captured from multiple angles
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                    <span>
                      Maximum file size:{" "}
                      <strong className="font-semibold text-white">
                        500 MB
                      </strong>
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                    <span>
                      Processing time:{" "}
                      <strong className="font-semibold text-white">
                        30-60 minutes
                      </strong>{" "}
                      depending on dataset size
                    </span>
                  </li>
                </ul>
              </div>
            </div>

            {/* ── Right panel: Upload Dataset ── */}
            <div className="rounded-2xl border border-[#1a2535] bg-[#0d1422] p-8">
              {/* Section header */}
              <div className="mb-6 flex items-center gap-3">
                <div className="h-6 w-1 rounded-full bg-emerald-500" />
                <h2 className="text-lg font-semibold text-white">
                  Upload Dataset
                </h2>
              </div>

              {/* ── Source tab switcher ── */}
              <div className="mb-6 flex rounded-xl bg-[#080d18] p-1 border border-[#1e2d45]">
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => { setActiveTab("file"); setError(null); }}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 px-4 text-sm font-medium transition-colors ${
                    activeTab === "file"
                      ? "bg-blue-600 text-white shadow"
                      : "text-slate-400 hover:text-slate-300"
                  }`}
                >
                  <FileArchive className="h-4 w-4" />
                  Upload ZIP
                </button>
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => { setActiveTab("gdrive"); setError(null); }}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 px-4 text-sm font-medium transition-colors ${
                    activeTab === "gdrive"
                      ? "bg-blue-600 text-white shadow"
                      : "text-slate-400 hover:text-slate-300"
                  }`}
                >
                  <Link className="h-4 w-4" />
                  Google Drive
                </button>
              </div>

              {/* ── File upload tab ── */}
              {activeTab === "file" && (
                <>
                  {/* Drop zone */}
                  <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={() =>
                      !uploading && fileInputRef.current?.click()
                    }
                    className={`flex cursor-pointer flex-col items-center justify-center gap-5 rounded-2xl border-2 border-dashed px-8 py-14 transition-colors ${
                      isDragging
                        ? "border-blue-500/70 bg-blue-500/5"
                        : file
                          ? "border-emerald-500/50 bg-emerald-500/5"
                          : "border-[#1e3a5f] bg-[#080d18] hover:border-blue-500/40 hover:bg-blue-500/5"
                    } ${uploading ? "pointer-events-none opacity-60" : ""}`}
                  >
                    <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-[#1a2a4a]">
                      <FileArchive className="h-12 w-12 text-blue-400" />
                    </div>

                    {file ? (
                      <>
                        <div className="text-center">
                          <p className="font-semibold text-white">{file.name}</p>
                          <p className="mt-1 text-sm text-slate-400">
                            {(file.size / (1024 * 1024)).toFixed(1)} MB
                          </p>
                        </div>
                        {stage === "uploading" && (
                          <div className="w-full max-w-xs">
                            <div className="mb-1.5 flex justify-between text-xs text-slate-400">
                              <span>{stageLabel[stage]}</span>
                              <span>{progress}%</span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-[#1a2535]">
                              <div
                                className="h-full rounded-full bg-blue-500 transition-all duration-300"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          </div>
                        )}
                        {uploading && stage !== "uploading" && (
                          <p className="text-sm text-blue-400">
                            {stageLabel[stage]}
                          </p>
                        )}
                      </>
                    ) : (
                      <div className="text-center">
                        <p className="text-lg font-semibold text-white">
                          Drag &amp; drop your ZIP file here
                        </p>
                        <p className="mt-1.5 text-sm text-slate-400">
                          or click to browse your files
                        </p>
                      </div>
                    )}

                    {!uploading && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          fileInputRef.current?.click();
                        }}
                        className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-8 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-blue-700"
                      >
                        <Upload className="h-4 w-4" />
                        Choose ZIP File
                      </button>
                    )}

                    <p className="flex items-center gap-2 text-xs text-slate-500">
                      <FileArchive className="h-3.5 w-3.5" />
                      ZIP only
                      <span className="mx-0.5">·</span>
                      Max 500 MB
                    </p>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".zip,application/zip,application/x-zip-compressed"
                    className="sr-only"
                    onChange={handleFileChange}
                  />
                </>
              )}

              {/* ── Google Drive tab ── */}
              {activeTab === "gdrive" && (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <label
                      htmlFor="gdrive-url"
                      className="text-sm font-medium text-slate-300"
                    >
                      Google Drive share link{" "}
                      <span className="text-red-400">*</span>
                    </label>
                    <input
                      id="gdrive-url"
                      type="url"
                      required
                      disabled={uploading}
                      value={gdriveUrl}
                      onChange={(e) => setGdriveUrl(e.target.value)}
                      placeholder="https://drive.google.com/file/d/<ID>/view?usp=sharing"
                      className="rounded-xl border border-[#1e2d45] bg-[#080d18] px-4 py-3 text-sm text-white placeholder:text-slate-600 outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
                    />
                  </div>
                  <div className="rounded-xl border border-[#1e2d45] bg-[#080d18] px-4 py-4 space-y-2">
                    <p className="text-xs font-medium text-slate-400">
                      Requirements
                    </p>
                    <ul className="space-y-1.5 text-xs text-slate-500">
                      <li className="flex items-start gap-2">
                        <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-blue-500" />
                        The file must be shared publicly (Anyone with the link)
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-blue-500" />
                        The file must be a ZIP archive of JPG or PNG images
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-blue-500" />
                        Maximum size: 500 MB — the import runs in the background
                      </li>
                    </ul>
                  </div>
                  {stage === "importing" && (
                    <p className="text-sm text-blue-400">{stageLabel.importing}</p>
                  )}
                </div>
              )}

              {/* Error */}
              {error && (
                <p className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400 border border-red-500/20">
                  {error}
                </p>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={
                  !name.trim() ||
                  (activeTab === "file" ? !file : !gdriveUrl.trim()) ||
                  uploading
                }
                className="mt-6 w-full rounded-xl bg-blue-600 py-3.5 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {uploading
                  ? stageLabel[stage]
                  : activeTab === "gdrive"
                    ? "Import from Google Drive"
                    : "Upload & Create Scene"}
              </button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
