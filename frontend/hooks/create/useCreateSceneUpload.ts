"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  CREATE_CONCURRENCY,
  GDRIVE_URL_RE,
  MAX_FILE_SIZE,
  type CreateUploadStage,
  type UploadTab,
  type Visibility,
} from "@/lib/create/createSceneConstants";
import { importFromGdrive } from "@/services/gdriveService";
import { multipartUpload } from "@/services/uploadService";

export function useCreateSceneUpload() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<UploadTab>("file");
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [gdriveUrl, setGdriveUrl] = useState("");
  const [stage, setStage] = useState<CreateUploadStage>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const uploading = stage !== "idle" && stage !== "error";

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !file || uploading) return;

    try {
      setError(null);
      await multipartUpload({
        file,
        contentType: "application/zip",
        name: name.trim(),
        inputType: "images",
        concurrency: CREATE_CONCURRENCY,
        onProgress: (uploadStage, uploadProgress) => {
          setStage(uploadStage);
          if (uploadProgress !== undefined) setProgress(uploadProgress);
        },
      });
      router.push("/scenes");
    } catch (err) {
      console.error("[create] upload failed", err);
      setError("Upload failed. Please try again.");
      setStage("error");
    }
  };

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
      await importFromGdrive({
        gdrive_url: gdriveUrl.trim(),
        name: name.trim(),
      });
      router.push("/scenes");
    } catch (err) {
      console.error("[create] gdrive import failed", err);
      setError(
        "Import failed. Please verify the link is publicly shared and try again.",
      );
      setStage("error");
    }
  };

  const goToLibrary = () => router.push("/scenes");

  const switchTab = (tab: UploadTab) => {
    setActiveTab(tab);
    setError(null);
  };

  const openFilePicker = () => {
    if (!uploading) fileInputRef.current?.click();
  };

  return {
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
    setName,
    setVisibility,
    setGdriveUrl,
    handleFileChange,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handleSubmit,
    handleGdriveSubmit,
    goToLibrary,
    switchTab,
    openFilePicker,
  };
}
