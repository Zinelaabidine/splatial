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
import {
  stageLabelWithProgress,
  STAGE_LABEL,
  type CreateUploadStage,
  type UploadTab,
  type Visibility,
} from "@/lib/create/createSceneConstants";

type CreateSceneFormViewProps = {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  activeTab: UploadTab;
  name: string;
  visibility: Visibility;
  file: File | null;
  isDragging: boolean;
  gdriveUrl: string;
  stage: CreateUploadStage;
  progress: number;
  error: string | null;
  uploading: boolean;
  onNameChange: (value: string) => void;
  onVisibilityChange: (value: Visibility) => void;
  onGdriveUrlChange: (value: string) => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onGdriveSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
  onTabChange: (tab: UploadTab) => void;
  onOpenFilePicker: () => void;
};

export default function CreateSceneFormView({
  fileInputRef,
  activeTab,
  name,
  visibility,
  file,
  isDragging,
  gdriveUrl,
  stage,
  progress,
  error,
  uploading,
  onNameChange,
  onVisibilityChange,
  onGdriveUrlChange,
  onFileChange,
  onDrop,
  onDragOver,
  onDragLeave,
  onSubmit,
  onGdriveSubmit,
  onBack,
  onTabChange,
  onOpenFilePicker,
}: CreateSceneFormViewProps) {
  const stageLabel = stageLabelWithProgress(stage, progress);

  return (
    <div className="flex h-screen flex-col bg-[#080d18] text-white">
      <TopNavBar
        mode="dashboard"
        onLibraryClick={onBack}
        onAdminClick={onBack}
        onProfileClick={onBack}
        onCreateClick={() => {}}
      />

      <main className="flex flex-1 items-start justify-center overflow-y-auto px-6 py-10">
        <form
          onSubmit={activeTab === "gdrive" ? onGdriveSubmit : onSubmit}
          className="w-full max-w-5xl"
        >
          <button
            type="button"
            onClick={onBack}
            className="mb-8 inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Library
          </button>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-[#1a2535] bg-[#0d1422] p-8">
              <div className="mb-8 flex items-center gap-3">
                <div className="h-6 w-1 rounded-full bg-blue-500" />
                <h2 className="text-lg font-semibold text-white">Scene Details</h2>
              </div>

              <div className="mb-6 flex flex-col gap-2">
                <label
                  htmlFor="scene-name"
                  className="text-sm font-medium text-slate-300"
                >
                  Scene Name <span className="text-red-400">*</span>
                </label>
                <input
                  id="scene-name"
                  type="text"
                  required
                  autoFocus
                  disabled={uploading}
                  value={name}
                  onChange={(e) => onNameChange(e.target.value)}
                  placeholder="e.g., Golden Gate Bridge"
                  className="rounded-xl border border-[#1e2d45] bg-[#080d18] px-4 py-3 text-sm text-white placeholder:text-slate-600 outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
                />
              </div>

              <div className="mb-4 flex flex-col gap-2">
                <span className="text-sm font-medium text-slate-300">
                  Visibility
                </span>
                <div className="flex rounded-xl bg-[#080d18] p-1 border border-[#1e2d45]">
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => onVisibilityChange("private")}
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
                    onClick={() => onVisibilityChange("public")}
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

              <p className="mb-8 flex items-center gap-2 text-xs text-slate-500">
                <Lock className="h-3.5 w-3.5 shrink-0" />
                {visibility === "private"
                  ? "Only you can view this scene"
                  : "Anyone with the link can view this scene"}
              </p>

              <hr className="mb-8 border-[#1a2535]" />

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
                      <strong className="font-semibold text-white">500 MB</strong>
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

            <div className="rounded-2xl border border-[#1a2535] bg-[#0d1422] p-8">
              <div className="mb-6 flex items-center gap-3">
                <div className="h-6 w-1 rounded-full bg-emerald-500" />
                <h2 className="text-lg font-semibold text-white">
                  Upload Dataset
                </h2>
              </div>

              <div className="mb-6 flex rounded-xl bg-[#080d18] p-1 border border-[#1e2d45]">
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => onTabChange("file")}
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
                  onClick={() => onTabChange("gdrive")}
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

              {activeTab === "file" && (
                <>
                  <div
                    onDrop={onDrop}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onClick={onOpenFilePicker}
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
                              <span>{stageLabel}</span>
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
                          <p className="text-sm text-blue-400">{stageLabel}</p>
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
                          onOpenFilePicker();
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
                    onChange={onFileChange}
                  />
                </>
              )}

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
                      onChange={(e) => onGdriveUrlChange(e.target.value)}
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
                    <p className="text-sm text-blue-400">
                      {STAGE_LABEL.importing}
                    </p>
                  )}
                </div>
              )}

              {error && (
                <p className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400 border border-red-500/20">
                  {error}
                </p>
              )}

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
                  ? stageLabel
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
