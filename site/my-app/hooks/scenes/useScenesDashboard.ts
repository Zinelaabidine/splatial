"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { cancelJob, submitJob } from "@/server/services/jobsService";
import { deleteScene, listScenes } from "@/server/services/scenesService";
import { multipartUpload } from "@/server/services/uploadService";
import type { InputType, Scene } from "@/types/api";

const CONCURRENCY = 4;

const INITIAL_FORM = { name: "", inputType: "video" as InputType, file: null as File | null };

export function useScenesDashboard() {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<{ name: string; inputType: InputType; file: File | null }>(INITIAL_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [uploadStage, setUploadStage] = useState<string>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchScenes = useCallback(async () => {
    try {
      setLoading(true);
      setFetchError(null);
      const data = await listScenes();
      setScenes(data.scenes ?? []);
    } catch (err) {
      console.error("[scenes] fetch failed", err);
      setFetchError("Failed to load scenes. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch initial data on mount.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchScenes(); }, [fetchScenes]);

  const openModal = () => {
    setForm(INITIAL_FORM);
    setCreateError(null);
    setUploadStage("idle");
    setUploadProgress(0);
    setShowModal(true);
  };

  const closeModal = () => {
    if (creating) return;
    setShowModal(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.file) return;

    const file = form.file;
    const contentType = file.type || "application/octet-stream";

    try {
      setCreating(true);
      setCreateError(null);

      await multipartUpload({
        file,
        contentType,
        name: form.name.trim(),
        inputType: form.inputType,
        concurrency: CONCURRENCY,
        onProgress: (stage, progress) => {
          setUploadStage(stage);
          if (progress !== undefined) setUploadProgress(progress);
        },
      });

      await fetchScenes();
      setShowModal(false);
    } catch (err) {
      console.error("[scenes] create+upload failed", err);
      setCreateError("Upload failed. Please try again.");
      setUploadStage("error");
    } finally {
      setCreating(false);
    }
  };

  const handleSubmit = async (sceneId: string) => {
    if (submittingId) return;
    setSubmittingId(sceneId);
    setActionError(null);
    try {
      await submitJob(sceneId);
      setScenes((prev) =>
        prev.map((s) => (s.sceneId === sceneId ? { ...s, status: "QUEUED" } : s))
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Submit failed";
      setActionError(msg);
      await fetchScenes();
    } finally {
      setSubmittingId(null);
    }
  };

  const handleCancel = async (sceneId: string) => {
    if (cancellingId) return;
    setCancellingId(sceneId);
    try {
      await cancelJob(sceneId);
      setScenes((prev) =>
        prev.map((s) => (s.sceneId === sceneId ? { ...s, status: "CANCELLED" } : s))
      );
    } catch (err) {
      console.error("[scenes] cancel failed", err);
      await fetchScenes();
    } finally {
      setCancellingId(null);
    }
  };

  const handleDelete = async (sceneId: string) => {
    if (deletingId) return;
    setDeletingId(sceneId);
    setActionError(null);
    try {
      await deleteScene(sceneId);
      setScenes((prev) => prev.filter((s) => s.sceneId !== sceneId));
    } catch (err) {
      console.error("[scenes] delete failed", err);
      const msg = err instanceof Error ? err.message : "Delete failed";
      setActionError(msg);
      await fetchScenes();
    } finally {
      setDeletingId(null);
    }
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, name: e.target.value }));
  };

  const handleInputTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setForm((f) => ({ ...f, inputType: e.target.value as InputType, file: null }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setForm((f) => ({ ...f, file }));
  };

  const isUploading = creating && uploadStage !== "idle" && uploadStage !== "error";

  const handleFilePickerClick = () => {
    if (!isUploading) fileInputRef.current?.click();
  };

  const handleModalBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) closeModal();
  };

  const clearActionError = () => setActionError(null);

  return {
    scenes,
    loading,
    fetchError,
    showModal,
    form,
    creating,
    createError,
    uploadStage,
    uploadProgress,
    deletingId,
    submittingId,
    cancellingId,
    actionError,
    fileInputRef,
    isUploading,
    openModal,
    closeModal,
    handleCreate,
    handleSubmit,
    handleCancel,
    handleDelete,
    handleNameChange,
    handleInputTypeChange,
    handleFileChange,
    handleFilePickerClick,
    handleModalBackdropClick,
    clearActionError,
  };
}
